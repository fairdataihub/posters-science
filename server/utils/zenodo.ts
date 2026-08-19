import { buildPosterJson } from "./buildPosterJson";
import { isValidOrcidChecksum, validateOrcidExists } from "#shared/utils/orcid";
import isoLanguages from "#shared/data/iso-639-1.json";

const ISO639_1_TO_3: Record<string, string> = Object.fromEntries(
  isoLanguages.filter((l) => l.alpha3).map((l) => [l.code, l.alpha3]),
);
const config = useRuntimeConfig();

const MAX_USER_FACING_BODY = 300;
// Logged bodies are bounded too: Zenodo echoes the whole record on some
// responses, which carries creator names, ORCIDs and unpublished abstracts.
const MAX_LOGGED_BODY = 1000;

// Full request payloads carry personal data (names, ORCIDs, affiliations,
// abstracts), so they are only logged when running locally.
const logFullPayloads = config.siteEnv === "development";

type FundingReference = {
  funderName?: string;
  funderIdentifier?: string;
  funderIdentifierType?: string;
  awardNumber?: string;
  awardUri?: string;
  awardTitle?: string;
};

function truncateForLog(body: string): string {
  return body.length > MAX_LOGGED_BODY
    ? `${body.slice(0, MAX_LOGGED_BODY)}… (${body.length} bytes total)`
    : body;
}

// Describes an RDM payload's shape for logs - which blocks are present and how
// many entries each has, without the values themselves.
function describeRdmPayload(payload: object): string {
  const { metadata, custom_fields: customFields } = payload as {
    metadata?: Record<string, unknown>;
    custom_fields?: Record<string, unknown>;
  };
  const parts: string[] = [];

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (Array.isArray(value)) {
      parts.push(`${key}[${value.length}]`);
    } else if (value !== undefined && value !== null && value !== "") {
      parts.push(key);
    }
  }

  if (customFields) {
    parts.push(`custom_fields{${Object.keys(customFields).join(",")}}`);
  }

  return parts.join(" ");
}

/**
 * Condenses a Zenodo response body into something a user can read. Zenodo
 * error bodies carry the useful part in `message` and `errors[]`; anything else
 * (an HTML 502 page, a full record) is truncated rather than shown whole.
 */
function summarizeZenodoBody(body: string): string {
  if (!body) return "";

  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      errors?: { field?: string; messages?: string[]; message?: string }[];
    };
    const parts: string[] = [];

    if (parsed.message) parts.push(parsed.message);

    for (const error of parsed.errors ?? []) {
      const detail = error.messages?.join(" ") ?? error.message;

      if (detail)
        parts.push(error.field ? `${error.field}: ${detail}` : detail);
    }

    if (parts.length > 0) {
      const joined = parts.join(" ");

      return joined.length > MAX_USER_FACING_BODY
        ? `${joined.slice(0, MAX_USER_FACING_BODY)}…`
        : joined;
    }
  } catch {
    // not JSON - fall through to plain truncation
  }

  const flattened = body.replace(/\s+/g, " ").trim();

  return flattened.length > MAX_USER_FACING_BODY
    ? `${flattened.slice(0, MAX_USER_FACING_BODY)}…`
    : flattened;
}

/**
 * Extracts a useful error string from a failed Zenodo API response.
 * The full body goes to the log for debugging; the returned string is shown to
 * the user, so it carries only the condensed validation detail.
 */
async function getZenodoErrorMessage(
  operation: string,
  response: Response,
): Promise<string> {
  let body = "";

  try {
    body = await response.text();
  } catch {
    // ignore body read errors
  }

  if (body) {
    console.error(
      `[Zenodo] ${operation}: ${response.status} ${response.statusText} - ${truncateForLog(body)}`,
    );
  }

  const summary = summarizeZenodoBody(body);

  return `${operation}: ${response.status} ${response.statusText}${summary ? ` - ${summary}` : ""}`;
}

async function getZenodoToken(userId: string) {
  // User ids stay out of the logs; poster and record ids are enough to trace a
  // publication and are not personal identifiers.
  console.log("[Zenodo] Looking up stored token");
  const tokenRecord = await prisma.zenodoToken.findUnique({
    where: {
      userId,
    },
  });

  if (!tokenRecord) {
    console.log("[Zenodo] No Zenodo token stored for this user");

    return null;
  }

  console.log("[Zenodo] Stored token found");

  return tokenRecord;
}

function zenodoAuthHeader(zenodoToken: string) {
  return `Bearer ${zenodoToken}`;
}

// Zenodo's default serializer on draft endpoints is the legacy deposit shape
// (top-level doi, conceptrecid, state/submitted) rather than what Invenio's API docs state
// This asks for the RDM representation explicitly. The
// readers below still tolerate both, in case an endpoint ignores the header.
const RDM_ACCEPT = "application/vnd.inveniordm.v1+json";

function rdmHeaders(zenodoToken: string, extra?: Record<string, string>) {
  return {
    Accept: RDM_ACCEPT,
    Authorization: zenodoAuthHeader(zenodoToken),
    ...extra,
  };
}

export type ZenodoUserRecord = {
  id: number;
  title: string;
  isPublished: boolean;
  conceptDoi?: string;
};

// Maps an InvenioRDM /user/records search body to the shape of the publish UI
function parseUserRecords(body: unknown): ZenodoUserRecord[] {
  const hits = (body as { hits?: { hits?: RdmRecord[] } })?.hits?.hits;
  const records: ZenodoUserRecord[] = [];

  for (const hit of hits ?? []) {
    const id = Number(hit.id);

    if (!Number.isFinite(id)) continue;

    const conceptDoi = extractConceptDoi(hit);

    records.push({
      id,
      title: hit.metadata?.title ?? "Untitled deposit",
      isPublished: extractIsPublished(hit),
      ...(conceptDoi && { conceptDoi }),
    });
  }

  return records;
}

// Validates the stored token against the InvenioRDM API, refreshing it on success.
// Pass `includeRecords: false` to skip building the (unused) record list - the
// publish route only needs the boolean.
export async function validateZenodoToken(
  userId: string,
  options?: { includeRecords?: boolean },
) {
  const includeRecords = options?.includeRecords ?? true;

  console.log("[Zenodo] Validating stored token");

  let zenodoToken = false;
  let existingDepositions: ZenodoUserRecord[] = [];
  const tokenRecord = await getZenodoToken(userId);

  if (!tokenRecord) {
    console.log("[Zenodo] No Zenodo token stored for this user");

    return {
      zenodoToken,
      message: "No Zenodo token found",
      existingDepositions,
    };
  }

  // One request serves as both the validity probe and (when asked) the record
  // list, so a publish never pays for a listing it discards.
  console.log("[Zenodo] Checking token validity against the InvenioRDM API");

  // Zenodo caps this endpoint's page size at 25 and 400s above it, so the
  // dropdown shows the 25 most recent records
  const query = new URLSearchParams({
    sort: "newest",
    size: includeRecords ? "25" : "1",
    page: "1",
    allversions: "false",
  });

  const probe = await fetch(
    `${config.zenodoApiEndpoint}/user/records?${query.toString()}`,
    { headers: rdmHeaders(tokenRecord.accessToken) },
  );

  if (probe.status === 401 || probe.status === 403) {
    // Drop it so the UI offers a reconnect.
    const message =
      probe.status === 403
        ? "Zenodo rejected this token (403). Your Zenodo connection may need re-authorizing - disconnect and sign in again."
        : "Zenodo token is invalid or expired";

    console.log(
      `[Zenodo] Token rejected (status: ${probe.status}), deleting token`,
    );

    await prisma.zenodoToken.delete({ where: { userId } });

    return { zenodoToken, message, existingDepositions };
  }

  if (!probe.ok) {
    // Transient (5xx, rate limit, network blip). Keep the token since deleting it would force a needless re-OAuth.
    console.warn(
      `[Zenodo] ${await getZenodoErrorMessage("Token check failed", probe)} - keeping token`,
    );

    return {
      zenodoToken,
      message: "Could not reach Zenodo, please try again shortly",
      existingDepositions,
    };
  }

  if (includeRecords) {
    existingDepositions = parseUserRecords(
      await probe.json().catch(() => null),
    );

    console.log(
      `[Zenodo] Found ${existingDepositions.length} existing records`,
    );
  }

  // Token valid so refresh it to extend the session.
  console.log("[Zenodo] Token valid, refreshing to extend session");

  await refreshZenodoToken(userId, tokenRecord.refreshToken);

  zenodoToken = true;

  console.log("[Zenodo] Validation result: Zenodo token is valid");

  return {
    zenodoToken,
    message: "Zenodo token is valid",
    existingDepositions,
  };
}

async function refreshZenodoToken(userId: string, refreshToken: string) {
  console.log("[Zenodo] Refreshing token");

  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.zenodoClientId,
    client_secret: config.zenodoClientSecret,
  });

  const refresh = await fetch(`${config.zenodoEndpoint}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: refreshBody.toString(),
  });

  if (refresh.ok) {
    console.log("[Zenodo] Token refreshed successfully");

    const { access_token, refresh_token, expires_in } = await refresh.json();

    await prisma.zenodoToken.update({
      where: { userId },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      },
    });
  } else {
    // The current access token still works, but without the body
    // there is no way to tell a rotated/expired refresh token from a config
    // problem and a persistent failure ends in a forced reconnect.
    const body = await refresh.text().catch(() => "");

    console.warn(
      `[Zenodo] Token refresh failed (status: ${refresh.status})${body ? ` - ${truncateForLog(body)}` : ""}`,
    );
  }
}

/**
 * Discards an unpublished InvenioRDM draft that is linked to a local poster.
 * A missing draft is already in the desired state, so retries remain safe.
 */
export async function discardZenodoDraft(userId: string, recordId: number) {
  const tokenRecord = await getZenodoToken(userId);

  if (!tokenRecord) {
    return {
      success: false as const,
      error:
        "Reconnect your Zenodo account before deleting this version draft.",
    };
  }

  let response: Response;

  try {
    response = await fetch(
      `${config.zenodoApiEndpoint}/records/${recordId}/draft`,
      {
        method: "DELETE",
        headers: rdmHeaders(tokenRecord.accessToken),
      },
    );
  } catch (error) {
    return {
      success: false as const,
      error: `Could not reach Zenodo while deleting draft ${recordId}: ${(error as Error).message}`,
    };
  }

  if (response.ok || response.status === 404) {
    return { success: true as const };
  }

  return {
    success: false as const,
    error: await getZenodoErrorMessage(
      `Failed to delete Zenodo draft ${recordId}`,
      response,
    ),
  };
}

export type PublicationProgressEvent = {
  step: string;
  status: "in_progress" | "completed" | "error";
  message: string;
};

type ProgressCallback = (
  event: PublicationProgressEvent,
) => void | Promise<void>;

type PosterIdentifier = { identifier: string; identifierType: string };

function extractOrcid(ni: {
  nameIdentifier: string;
  nameIdentifierScheme?: string;
  schemeURI?: string;
}): string | undefined {
  const { nameIdentifier, nameIdentifierScheme, schemeURI } = ni;
  if (!nameIdentifier) return undefined;

  if (nameIdentifier.toLowerCase().includes("orcid.org/")) {
    return nameIdentifier.replace(/.*orcid\.org\//i, "").trim() || undefined;
  }

  const isOrcid =
    nameIdentifierScheme?.toLowerCase() === "orcid" ||
    schemeURI?.toLowerCase().includes("orcid.org");

  return isOrcid ? nameIdentifier : undefined;
}

function extractRorId(
  affiliationIdentifier: string | undefined,
  scheme: string | undefined,
): string | undefined {
  if (!affiliationIdentifier) return undefined;
  const isRor =
    scheme?.toLowerCase() === "ror" ||
    affiliationIdentifier.toLowerCase().includes("ror.org/");
  if (!isRor) return undefined;

  return affiliationIdentifier.replace(/.*ror\.org\//i, "").trim() || undefined;
}

// Binds a poster to its InvenioRDM record. depositionId carries a global unique
// index, so picking a record another poster already owns surfaces as P2002 -
// worth naming, since the generic message is useless to the user.
async function linkZenodoDeposition(
  posterId: number,
  userId: string,
  recordId: number,
  published?: { doi?: string },
) {
  const state = {
    userId,
    depositionId: recordId,
    status: published ? "published" : "draft",
    ...(published?.doi && { lastPublishedZenodoDoi: published.doi }),
  };

  try {
    await prisma.zenodoDeposition.upsert({
      where: { posterId },
      create: { posterId, ...state },
      update: state,
    });

    return { success: true as const };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const msg = `Zenodo record ${recordId} is already linked to another poster`;

      console.error(`[Zenodo] ${msg}`);

      return { success: false as const, error: msg };
    }

    throw error;
  }
}

export async function beginZenodoPublication(
  posterId: string,
  mode: string,
  existingDepositionId: number | undefined,
  userId: string,
  onProgress?: ProgressCallback,
  license?: string,
) {
  console.log(
    `[Zenodo] Beginning publication for poster: ${posterId}, mode: ${mode}, depositionId: ${existingDepositionId}`,
  );

  // Get the user's Zenodo token
  const tokenRecord = await getZenodoToken(userId);

  if (!tokenRecord) {
    console.log("[Zenodo] No token found, aborting publication");

    return { success: false, error: "Zenodo token not found for user" };
  }

  // Step 1: Prepare deposition
  await onProgress?.({
    step: "deposition",
    status: "in_progress",
    message: "Preparing deposition...",
  });

  // Load the poster before touching Zenodo. Bailing after a draft exists would
  // leave an orphaned draft on the user's account.
  const posterInt = parseInt(posterId);

  console.log(`[Zenodo] Fetching poster and metadata for: ${posterId}`);

  const poster = await prisma.poster.findUnique({
    where: { id: posterInt, userId },
    include: { posterMetadata: true, zenodoDepositions: true },
  });

  if (!poster || !poster.posterMetadata) {
    console.log(`[Zenodo] Poster or metadata not found for: ${posterId}`);

    return { success: false, error: "Poster or metadata not found" };
  }

  // Zenodo may have accepted the publication even if our final local
  // transaction failed. linkZenodoDeposition is deliberately marked
  // published before that transaction, making this an idempotency marker.
  // Reconcile it before acquiring a working draft so a retry cannot create an
  // unnecessary next-version draft on Zenodo.
  if (
    poster.status !== "published" &&
    poster.zenodoDepositions?.status === "published" &&
    poster.zenodoDepositions.lastPublishedZenodoDoi
  ) {
    const publishedDoi = poster.zenodoDepositions.lastPublishedZenodoDoi;
    const existingIdentifiers = Array.isArray(poster.posterMetadata.identifiers)
      ? (poster.posterMetadata.identifiers as PosterIdentifier[])
      : [];
    const identifiers = existingIdentifiers.some(
      (identifier) =>
        identifier.identifier === publishedDoi &&
        identifier.identifierType === "DOI",
    )
      ? existingIdentifiers
      : [
          { identifier: publishedDoi, identifierType: "DOI" },
          ...existingIdentifiers,
        ];
    const rootId = posterFamilyRootId(poster);

    console.log(
      `[Zenodo] Reconciling local poster from published record ${poster.zenodoDepositions.depositionId}`,
    );

    await prisma.$transaction([
      prisma.poster.updateMany({
        where: posterFamilyWhere(rootId),
        data: { isLatestVersion: false },
      }),
      prisma.poster.update({
        where: { id: poster.id },
        data: {
          status: "published",
          publishedAt: new Date(),
          isLatestVersion: true,
        },
      }),
      prisma.posterMetadata.update({
        where: { posterId: poster.id },
        data: {
          doi: publishedDoi,
          publisher: "Zenodo",
          identifiers,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        recordId: poster.zenodoDepositions.depositionId,
        doi: publishedDoi,
        recordUrl: `${config.zenodoEndpoint}/records/${poster.zenodoDepositions.depositionId}`,
      },
    };
  }

  const rawFunding = Array.isArray(poster.posterMetadata.fundingReferences)
    ? (poster.posterMetadata.fundingReferences as FundingReference[])
    : [];
  const incompleteAwardIndex = rawFunding.findIndex(
    (funding) =>
      !!funding.awardUri?.trim() &&
      !funding.awardNumber?.trim() &&
      !funding.awardTitle?.trim(),
  );

  if (incompleteAwardIndex >= 0) {
    return {
      success: false,
      error: `Funding reference ${incompleteAwardIndex + 1}: Award title or award number is required when an award URI is provided. Review the poster metadata before publishing.`,
    };
  }

  let effectiveDepositionId = existingDepositionId;

  // A retry should resume the draft already linked to this local version. For
  // a brand-new local version, fall back to the latest published predecessor's
  // stored record so callers do not have to rediscover it client-side.
  if (mode === "existing" && poster.zenodoDepositions?.status === "draft") {
    effectiveDepositionId = poster.zenodoDepositions.depositionId;
  } else if (
    mode === "existing" &&
    !effectiveDepositionId &&
    poster.versionRootId
  ) {
    const predecessor = await prisma.poster.findFirst({
      where: {
        status: "published",
        versionSequence: { lt: poster.versionSequence },
        ...posterFamilyWhere(poster.versionRootId),
      },
      orderBy: { versionSequence: "desc" },
      select: { zenodoDepositions: { select: { depositionId: true } } },
    });
    effectiveDepositionId = predecessor?.zenodoDepositions?.depositionId;
  }

  if (mode === "existing" && !effectiveDepositionId) {
    return {
      success: false,
      error: "An existing Zenodo record is required for this version",
    };
  }

  console.log("[Zenodo] Acquiring working draft");

  const status = await acquireWorkingDraft(
    mode,
    effectiveDepositionId,
    tokenRecord.accessToken,
    {
      title: poster.title,
      creators: buildRdmCreators(
        Array.isArray(poster.posterMetadata.creators)
          ? (poster.posterMetadata.creators as InvenioCreator[])
          : [],
        { skipRorIds: true },
      ),
    },
  );

  if (!status.success) {
    console.log(`[Zenodo] Failed to acquire working draft: ${status.error}`);

    return { success: false, error: status.error };
  }

  const draft = status.data;
  const recordId = Number(draft.id);

  if (!Number.isFinite(recordId)) {
    return {
      success: false,
      error: "Zenodo returned a draft without a usable record id",
    };
  }

  const draftUrl = `${config.zenodoEndpoint}/uploads/${recordId}`;

  console.log(`[Zenodo] Working draft ready - record ${recordId}`);
  console.log(`[Zenodo] Draft URL: ${draftUrl}`);

  // Persist the working draft before any subsequent network operation. If a
  // purge, metadata update, or upload fails, the next attempt can resume this
  // exact draft instead of asking Zenodo to create another version.
  const linked = await linkZenodoDeposition(posterInt, userId, recordId);

  if (!linked.success) {
    return { success: false, error: linked.error };
  }

  if (poster.versionRootId && mode !== "existing") {
    return {
      success: false,
      error: "Poster versions must be published to an existing Zenodo record",
    };
  }

  const purged = await purgeDraftFiles(recordId, tokenRecord.accessToken);

  if (!purged.success) {
    return { success: false, error: purged.error };
  }

  await onProgress?.({
    step: "deposition",
    status: "completed",
    message: "Deposition ready",
  });

  // Step 2: Load poster data
  await onProgress?.({
    step: "metadata",
    status: "in_progress",
    message: "Loading poster data...",
  });

  // Persist license to DB if provided so poster.json and the record stay in sync
  if (license) {
    console.log(`[Zenodo] Saving license to posterMetadata: ${license}`);

    await prisma.posterMetadata.update({
      where: { posterId: posterInt },
      data: { license },
    });

    poster.posterMetadata.license = license;
  }

  await onProgress?.({
    step: "metadata",
    status: "completed",
    message: "Poster data loaded",
  });

  // Step 3: Update deposition metadata
  await onProgress?.({
    step: "upload_metadata",
    status: "in_progress",
    message: "Updating metadata on Zenodo...",
  });

  // Build Zenodo deposition metadata from poster data
  const meta = poster.posterMetadata;

  const metaIdentifiers: PosterIdentifier[] = Array.isArray(meta.identifiers)
    ? (meta.identifiers as PosterIdentifier[])
    : [];

  const creators = meta.creators as InvenioCreator[];

  // Check ORCID IDs exist in the registry. Fail-open: warns but never blocks publication.
  const orcidIds = (creators ?? [])
    .flatMap((c) => c.nameIdentifiers?.map(extractOrcid).filter(Boolean) ?? [])
    .filter((id): id is string => !!id);

  if (orcidIds.length > 0) {
    const results = await Promise.all(
      orcidIds.map((id) => validateOrcidExists(id)),
    );
    const invalid = orcidIds.filter((_, i) => !results[i]);
    if (invalid.length > 0) {
      console.warn(
        `[Zenodo] ORCID registry check failed for: ${invalid.join(", ")}`,
      );
      await onProgress?.({
        step: "upload_metadata",
        status: "error",
        message: `Could not verify the following ORCID IDs in the registry: ${invalid.join(", ")}. Publication will continue — please confirm these IDs are correct.`,
      });
    }
  }

  const rawRelated = meta.relatedIdentifiers as {
    relatedIdentifier?: string;
    relatedIdentifierType?: string;
    relationType?: string;
    resourceTypeGeneral?: string;
  }[];

  const datesArr = Array.isArray(meta.dates)
    ? (meta.dates as Array<{ date?: string; dateType?: string }>)
    : [];

  const hasSubmittedInMeta = datesArr.some((d) => d.dateType === "Submitted");

  const zenodoDates: {
    date: string;
    type: { id: string };
    description?: string;
  }[] = [];

  const zenodoSharedAt = new Date();

  // Inject submitted date from when the poster is shared to Zenodo
  if (!hasSubmittedInMeta) {
    zenodoDates.push({
      date: zenodoSharedAt.toISOString().slice(0, 10),
      type: { id: "submitted" },
      description: "Submitted to Zenodo through Posters.science",
    });
  }

  // Map all meta.dates to InvenioRDM format. DataCite dateType values map
  // 1:1 to InvenioRDM type.id by lowercasing. "Presented" is our custom type
  // stored in meta.dates; it maps to type "other" with a description.
  for (const entry of datesArr) {
    if (!entry.date || !entry.dateType) continue;
    if (entry.dateType === "Presented") {
      zenodoDates.push({
        date: entry.date,
        type: { id: "other" },
        description: "Poster presentation date",
      });
    } else {
      zenodoDates.push({
        date: entry.date,
        type: { id: entry.dateType.toLowerCase() },
      });
    }
  }

  const posterContentObj = meta.posterContent as {
    submissionAbstract?: string;
  } | null;

  // Bump the version before the metadata PUT: `meta` is passed by reference
  // into the payload builder, so bumping afterwards would send Zenodo the old
  // version while the DB recorded the new one.
  if (!poster.automated) {
    meta.version = posterVersionLabel(poster.versionSequence);
  }

  console.log(`[Zenodo] Updating metadata via InvenioRDM [record ${recordId}]`);

  const metadataResult = await updateRdmMetadata(
    recordId,
    tokenRecord.accessToken,
    poster.title,
    poster.description,
    meta as unknown as Record<string, unknown>,
    creators,
    {
      submissionAbstract: posterContentObj?.submissionAbstract,
      rawFunding,
      dbRelated: Array.isArray(rawRelated) ? rawRelated : [],
      presentedDates: zenodoDates,
      // A PUT to /draft is a full replacement, so echo back a DOI the draft
      // already carries. Only when one actually exists: a new draft comes back
      // with `pids: {}`, and sending that empty object asserts "no PIDs" rather
      // than "leave alone", which blocks the reserve that follows.
      ...(draft.pids?.doi?.identifier && {
        pids: draft.pids as Record<string, unknown>,
      }),
    },
  );

  if (!metadataResult.success) {
    console.error(
      `[Zenodo] Metadata update failed [record ${recordId}]: ${metadataResult.error}`,
    );

    await onProgress?.({
      step: "upload_metadata",
      status: "error",
      message: `Metadata update failed: ${metadataResult.error}`,
    });

    return { success: false, error: metadataResult.error };
  }

  // Reserved after the metadata PUT because that PUT replaces the whole record.
  const reserved = await ensureReservedDoi(
    recordId,
    tokenRecord.accessToken,
    draft,
  );

  if (!reserved.success) {
    await onProgress?.({
      step: "upload_metadata",
      status: "error",
      message: reserved.error,
    });

    return { success: false, error: reserved.error };
  }

  const doi = reserved.doi;

  await onProgress?.({
    step: "upload_metadata",
    status: "completed",
    message: "Metadata updated",
  });

  // Step 4: Upload files
  await onProgress?.({
    step: "upload_files",
    status: "in_progress",
    message: "Uploading poster files...",
  });

  // Build poster.json from DB data and upload it to the draft
  console.log(`[Zenodo] Building poster.json for poster: ${posterId}`);

  const posterJson = buildPosterJson(poster.posterMetadata, {
    title: poster.title,
    description: poster.description,
    zenodoDoi: doi,
    publishedAt: zenodoSharedAt,
    includePublisher: true,
  });
  const posterJsonEncoded = new TextEncoder().encode(
    JSON.stringify(posterJson, null, 2),
  );
  const posterJsonBytes = posterJsonEncoded.buffer.slice(
    posterJsonEncoded.byteOffset,
    posterJsonEncoded.byteOffset + posterJsonEncoded.byteLength,
  );

  console.log(`[Zenodo] Uploading poster.json [record ${recordId}]`);

  const uploadResult = await uploadFileToZenodoDraft(
    recordId,
    tokenRecord.accessToken,
    "poster.json",
    posterJsonBytes,
  );

  if (!uploadResult.success) {
    console.log(`[Zenodo] Failed to upload poster.json: ${uploadResult.error}`);

    return { success: false, error: uploadResult.error };
  }

  // Retrieve and upload poster file
  const extractionJob = await prisma.extractionJob.findUnique({
    where: { posterId: posterInt },
  });

  if (!extractionJob?.filePath) {
    console.log(
      `[Zenodo] No extraction job or file path found for poster: ${posterId}`,
    );

    return { success: false, error: "Poster file not found for upload" };
  }

  const posterFileName = sanitizeZenodoFileKey(
    extractionJob.fileName || "poster.pdf",
  );
  const posterFileUrl = `${config.bunnyPrivateStorage}/${extractionJob.filePath}`;

  console.log(
    `[Zenodo] Uploading poster file "${posterFileName}" [record ${recordId}]`,
  );

  const posterFileUpload = await uploadFileToZenodoDraft(
    recordId,
    tokenRecord.accessToken,
    posterFileName,
    {
      // Re-opened once per attempt: a consumed stream cannot be replayed, so a
      // retry has to pull the file from storage again.
      open: async () => {
        const res = await fetch(posterFileUrl, {
          headers: { AccessKey: config.bunnyPrivateStorageKey },
        });

        if (!res.ok || !res.body) {
          throw new Error(
            `Failed to retrieve poster file from storage (status: ${res.status})`,
          );
        }

        return {
          body: res.body,
          contentLength: res.headers.get("Content-Length") ?? undefined,
        };
      },
    },
  );

  if (!posterFileUpload.success) {
    console.log(
      `[Zenodo] Failed to upload poster file "${posterFileName}": ${posterFileUpload.error}`,
    );

    return { success: false, error: posterFileUpload.error };
  }

  console.log(`[Zenodo] Uploaded poster file "${posterFileName}" successfully`);

  await onProgress?.({
    step: "upload_files",
    status: "completed",
    message: "Files uploaded",
  });

  // Step 5: Publish
  await onProgress?.({
    step: "publish",
    status: "in_progress",
    message: "Publishing to Zenodo...",
  });

  // Publish the draft
  console.log(`[Zenodo] About to publish record: ${recordId}`);
  console.log(`[Zenodo] Inspect draft before publish: ${draftUrl}`);

  const publishResult = await publishRdmDraft(
    tokenRecord.accessToken,
    recordId,
  );

  if (!publishResult.success) {
    console.log(`[Zenodo] Publication failed [record ${recordId}]`);

    return { success: false, error: publishResult.error };
  }

  const published = publishResult.data;
  const publishedDoi = published.doi;

  // A record without a DOI would otherwise leave a publicly published poster with no identifier.
  if (!publishedDoi) {
    console.error(
      `[Zenodo] Published record ${published.recordId} is missing a DOI in the response`,
    );

    return {
      success: false,
      error: `Zenodo published record ${published.recordId} but returned no DOI`,
    };
  }

  const linkedPublished = await linkZenodoDeposition(
    posterInt,
    userId,
    published.recordId,
    { doi: publishedDoi },
  );

  if (!linkedPublished.success) {
    return { success: false, error: linkedPublished.error };
  }

  // Move the thumbnail from private to public storage now the record is live
  const posterWithImage = await prisma.poster.findUnique({
    where: { id: posterInt },
    select: { imageUrl: true },
  });

  let newImageUrl: string | undefined;

  const {
    bunnyPrivateStorage,
    bunnyPrivateStorageKey,
    bunnyPublicStorage,
    bunnyPublicStorageKey,
  } = config;

  const imageUrl = posterWithImage?.imageUrl;
  if (
    imageUrl &&
    bunnyPrivateStorage &&
    imageUrl.startsWith(bunnyPrivateStorage)
  ) {
    const thumbnailPath = imageUrl
      .slice(bunnyPrivateStorage.length)
      .replace(/^\//, "");

    if (bunnyPrivateStorageKey && bunnyPublicStorage && bunnyPublicStorageKey) {
      try {
        const downloadRes = await fetch(
          `${bunnyPrivateStorage}/${thumbnailPath}`,
          { headers: { AccessKey: bunnyPrivateStorageKey } },
        );

        if (downloadRes.ok) {
          const contentType =
            downloadRes.headers.get("Content-Type") ?? "image/jpeg";
          const fileBuffer = await downloadRes.arrayBuffer();

          const uploadRes = await fetch(
            `${bunnyPublicStorage}/${thumbnailPath}`,
            {
              method: "PUT",
              headers: {
                AccessKey: bunnyPublicStorageKey,
                "Content-Type": contentType,
                "Content-Length": String(fileBuffer.byteLength),
              },
              body: fileBuffer,
            },
          );

          if (uploadRes.ok) {
            newImageUrl = `https://cdn.posters.science/${thumbnailPath}`;
          } else {
            console.error(
              `[Zenodo] Failed to upload thumbnail to public storage: ${uploadRes.status}`,
            );
          }
        } else {
          console.error(
            `[Zenodo] Failed to download thumbnail from private storage: ${downloadRes.status}`,
          );
        }
      } catch (err) {
        console.error("[Zenodo] Error moving thumbnail:", err);
      }
    }
  }

  const alreadyHasDoi = metaIdentifiers.some(
    (i) => i.identifier === publishedDoi && i.identifierType === "DOI",
  );
  const updatedIdentifiers: PosterIdentifier[] = alreadyHasDoi
    ? metaIdentifiers
    : [{ identifier: publishedDoi, identifierType: "DOI" }, ...metaIdentifiers];

  const familyRootId = posterFamilyRootId(poster);
  await prisma.$transaction([
    prisma.poster.updateMany({
      where: posterFamilyWhere(familyRootId),
      data: { isLatestVersion: false },
    }),
    prisma.poster.update({
      where: { id: posterInt },
      data: {
        status: "published",
        publishedAt: new Date(),
        isLatestVersion: true,
        ...(newImageUrl && { imageUrl: newImageUrl }),
      },
    }),
    prisma.posterMetadata.update({
      where: { posterId: posterInt },
      data: {
        doi: publishedDoi,
        publisher: "Zenodo",
        identifiers: updatedIdentifiers,
        ...(meta.version && { version: meta.version }),
      },
    }),
  ]);

  await onProgress?.({
    step: "publish",
    status: "completed",
    message: "Published!",
  });

  console.log(`[Zenodo] Publication successful [record ${published.recordId}]`);

  return { success: true, data: published };
}

// Zenodo does not serialize every RDM endpoint the same way: /api/records/{id}
// returns native InvenioRDM (pids/parent/versions), while others - the DOI
// reserve endpoint among them - return the legacy deposit shape (top-level doi,
// conceptrecid, state/submitted). Both are RDM endpoints but only the response
// serializer differs, so the readers below accept either.
type RdmRecord = {
  id?: string | number;
  is_published?: boolean;
  status?: string;
  pids?: { doi?: { identifier?: string } };
  parent?: {
    id?: string | number;
    pids?: { doi?: { identifier?: string } };
  };
  versions?: { index?: number; is_latest?: boolean };
  links?: {
    self?: string;
    self_html?: string;
    record_html?: string;
    latest_html?: string;
    reserve_doi?: string;
    publish?: string;
    files?: string;
    versions?: string;
  };
  // Legacy deposit serialization
  doi?: string;
  conceptdoi?: string;
  conceptrecid?: string | number;
  submitted?: boolean;
  state?: string;
  metadata?: { title?: string; doi?: string };
};

function extractRecordDoi(record: RdmRecord | null): string | undefined {
  return (
    record?.pids?.doi?.identifier ||
    record?.doi ||
    record?.metadata?.doi
  )?.trim();
}

function extractConceptDoi(record: RdmRecord | null): string | undefined {
  return (record?.parent?.pids?.doi?.identifier || record?.conceptdoi)?.trim();
}

function extractConceptRecordId(record: RdmRecord | null): number | undefined {
  const raw = record?.parent?.id ?? record?.conceptrecid;
  const id = Number(raw);

  return Number.isFinite(id) ? id : undefined;
}

function extractIsPublished(record: RdmRecord | null): boolean {
  return !!(record?.is_published ?? record?.submitted ?? false);
}

// Seed metadata for a fresh draft: only fields that cannot hit a controlled
// vocabulary. Anything ROR/funder/licence/subject-backed can 400 and leave us
// with no draft at all, so the full payload goes through updateRdmMetadata
// instead, which already knows how to retry a vocabulary rejection.
type RdmDraftSeed = { title: string; creators: object[] };

function parseRdmRecord(body: string): RdmRecord | null {
  try {
    return JSON.parse(body) as RdmRecord;
  } catch {
    return null;
  }
}

function rdmGet(path: string, zenodoToken: string) {
  return fetch(`${config.zenodoApiEndpoint}${path}`, {
    headers: rdmHeaders(zenodoToken),
  });
}

async function createRdmDraft(zenodoToken: string, seed: RdmDraftSeed) {
  console.log("[Zenodo] Creating new InvenioRDM draft");

  const body = {
    access: { record: "public", files: "public" },
    files: { enabled: true },
    metadata: {
      title: seed.title,
      resource_type: { id: "poster" },
      publisher: "Zenodo",
      publication_date: new Date().toISOString().slice(0, 10),
      creators: seed.creators,
    },
  };

  try {
    const response = await fetch(`${config.zenodoApiEndpoint}/records`, {
      method: "POST",
      headers: rdmHeaders(zenodoToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorMsg = await getZenodoErrorMessage(
        "Failed to create Zenodo draft",
        response,
      );

      console.error(`[Zenodo] ${errorMsg}`);

      return { success: false as const, error: errorMsg };
    }

    const data = (await response.json()) as RdmRecord;

    console.log(`[Zenodo] New draft created (record ${data.id})`);

    return { success: true as const, data };
  } catch (error) {
    const errorMsg = `Failed to create Zenodo draft: ${(error as Error).message}`;

    console.error(`[Zenodo] ${errorMsg}`);

    return { success: false as const, error: errorMsg };
  }
}

async function createRdmVersion(zenodoToken: string, recordId: number) {
  console.log(`[Zenodo] Creating new version of record: ${recordId}`);

  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${recordId}/versions`,
      {
        method: "POST",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
      },
    );

    if (!response.ok) {
      const errorMsg = await getZenodoErrorMessage(
        `Failed to create a new version [record ${recordId}]`,
        response,
      );

      console.error(`[Zenodo] ${errorMsg}`);

      return { success: false as const, error: errorMsg };
    }

    const data = (await response.json()) as RdmRecord;

    console.log(
      `[Zenodo] New version draft created (record ${data.id}) from ${recordId}`,
    );

    return { success: true as const, data };
  } catch (error) {
    const errorMsg = `Failed to create a new version [record ${recordId}]: ${(error as Error).message}`;

    console.error(`[Zenodo] ${errorMsg}`);

    return { success: false as const, error: errorMsg };
  }
}

// Resolves the draft we publish into. State comes from HTTP status rather than
// a response field: the RDM API has no legacy "submitted" flag, and the id the
// client sent came from a list that may be stale.
async function acquireWorkingDraft(
  mode: string,
  depositionId: number | undefined,
  zenodoToken: string,
  seed: RdmDraftSeed,
): Promise<
  { success: true; data: RdmRecord } | { success: false; error: string }
> {
  if (mode === "new") {
    return createRdmDraft(zenodoToken, seed);
  }

  console.log(`[Zenodo] Resolving existing Zenodo record: ${depositionId}`);

  let published: Response;

  try {
    published = await rdmGet(`/records/${depositionId}`, zenodoToken);
  } catch (error) {
    return {
      success: false,
      error: `Failed to look up Zenodo record ${depositionId}: ${(error as Error).message}`,
    };
  }

  if (published.status === 401 || published.status === 403) {
    return {
      success: false,
      error: `Zenodo rejected your credentials while looking up record ${depositionId} (status: ${published.status}). Your Zenodo connection may need re-authorizing. Disconnect and sign in again.`,
    };
  }

  if (published.ok) {
    // Published: version from the *latest* version. RDM rejects POST /versions
    // on anything else, and the dropdown can point at an older one.
    const record = (await published.json()) as RdmRecord;
    let latestId = Number(record.id);
    const latest = await rdmGet(
      `/records/${depositionId}/versions/latest`,
      zenodoToken,
    );

    if (latest.ok) {
      const resolved = Number(((await latest.json()) as RdmRecord).id);

      if (Number.isFinite(resolved)) latestId = resolved;
    } else {
      console.warn(
        `[Zenodo] Could not resolve latest version of record ${depositionId} (status: ${latest.status}), versioning from ${latestId}`,
      );
    }

    if (!Number.isFinite(latestId)) {
      return {
        success: false,
        error: `Zenodo record ${depositionId} returned an unusable record id`,
      };
    }

    console.log(
      `[Zenodo] Record ${depositionId} is published, creating a new version from ${latestId}`,
    );

    return createRdmVersion(zenodoToken, latestId);
  }

  if (published.status === 404) {
    // Not published - it may be an unpublished draft we can reuse in place.
    const draft = await rdmGet(`/records/${depositionId}/draft`, zenodoToken);

    if (draft.ok) {
      console.log(
        `[Zenodo] Record ${depositionId} is an unpublished draft, reusing it`,
      );

      return { success: true, data: (await draft.json()) as RdmRecord };
    }

    if (draft.status === 404) {
      return {
        success: false,
        error: `Zenodo record ${depositionId} was not found, or is not yours`,
      };
    }

    return {
      success: false,
      error: await getZenodoErrorMessage(
        `Failed to look up Zenodo draft ${depositionId}`,
        draft,
      ),
    };
  }

  return {
    success: false,
    error: await getZenodoErrorMessage(
      `Failed to look up Zenodo record ${depositionId}`,
      published,
    ),
  };
}

// Clears any files already attached to the draft. A new-version draft comes
// back empty, but a reused draft can still hold files from an earlier run under
// different names, which would otherwise be published alongside the new ones.
async function purgeDraftFiles(recordId: number, zenodoToken: string) {
  const authHeader = zenodoAuthHeader(zenodoToken);
  const listing = await fetch(
    `${config.zenodoApiEndpoint}/records/${recordId}/draft/files`,
    { headers: { Authorization: authHeader } },
  );

  if (!listing.ok) {
    console.warn(
      `[Zenodo] Could not list draft files [record ${recordId}] (status: ${listing.status})`,
    );

    return { success: true as const };
  }

  const entries =
    (
      (await listing.json().catch(() => null)) as {
        entries?: ZenodoDraftFileEntry[];
      } | null
    )?.entries ?? [];

  for (const entry of entries) {
    if (!entry.key) continue;

    const target =
      entry.links?.self ??
      `${config.zenodoApiEndpoint}/records/${recordId}/draft/files/${encodeURIComponent(entry.key)}`;

    const response = await fetch(target, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });

    if (!response.ok && response.status !== 404) {
      const errorMsg = await getZenodoErrorMessage(
        `Failed to delete stale draft file "${entry.key}" [record ${recordId}]`,
        response,
      );

      console.error(`[Zenodo] ${errorMsg}`);

      return { success: false as const, error: errorMsg };
    }

    console.log(
      `[Zenodo] Deleted stale draft file "${entry.key}" [record ${recordId}]`,
    );
  }

  return { success: true as const };
}

// InvenioRDM does not mint a DOI when a draft is created, and poster.json
// embeds the DOI before it is uploaded so it has to be reserved explicitly.
async function ensureReservedDoi(
  recordId: number,
  zenodoToken: string,
  draft?: RdmRecord,
) {
  const known = draft?.pids?.doi?.identifier;

  if (known) {
    console.log(
      `[Zenodo] Draft already carries a reserved DOI: ${known} [record ${recordId}]`,
    );

    return { success: true as const, doi: known };
  }

  // Prefer the link Zenodo handed us.
  const url =
    draft?.links?.reserve_doi ??
    `${config.zenodoApiEndpoint}/records/${recordId}/draft/pids/doi`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: rdmHeaders(zenodoToken, {
        "Content-Type": "application/json",
      }),
    });

    // Read as text so the raw body can go into the error - a reserve that
    // succeeds without a DOI is undiagnosable otherwise.
    // Read as text so the full body can go to the log even when it is not the
    // shape we expected.
    const rawBody = await response.text().catch(() => "");
    const doi = extractRecordDoi(parseRdmRecord(rawBody));

    if (response.ok && doi) {
      console.log(`[Zenodo] Reserved DOI ${doi} [record ${recordId}]`);

      return { success: true as const, doi };
    }

    console.error(
      `[Zenodo] DOI reservation returned no usable DOI [record ${recordId}] (status: ${response.status}) - ${truncateForLog(rawBody)}`,
    );

    const reserveError = response.ok
      ? `Zenodo accepted the DOI reservation but returned no DOI [record ${recordId}]`
      : `Failed to reserve a DOI [record ${recordId}]: ${response.status} ${response.statusText}${summarizeZenodoBody(rawBody) ? ` - ${summarizeZenodoBody(rawBody)}` : ""}`;

    // Some deployments reject a second reserve instead of returning the
    // existing one so reead the draft before giving up.
    const refreshed = await rdmGet(`/records/${recordId}/draft`, zenodoToken);

    if (refreshed.ok) {
      const refreshedDraft = parseRdmRecord(
        await refreshed.text().catch(() => ""),
      );
      const refreshedDoi = extractRecordDoi(refreshedDraft);

      if (refreshedDoi) {
        console.log(
          `[Zenodo] Draft already carried DOI ${refreshedDoi} despite reserve failing [record ${recordId}]`,
        );

        return { success: true as const, doi: refreshedDoi };
      }
    }

    console.error(`[Zenodo] ${reserveError}`);

    return { success: false as const, error: reserveError };
  } catch (error) {
    const errorMsg = `Failed to reserve a DOI [record ${recordId}]: ${(error as Error).message}`;

    console.error(`[Zenodo] ${errorMsg}`);

    return { success: false as const, error: errorMsg };
  }
}

type InvenioCreator = {
  name?: string;
  givenName?: string;
  familyName?: string;
  nameType?: string;
  affiliation?: {
    name: string;
    affiliationIdentifier?: string;
    affiliationIdentifierScheme?: string;
  }[];
  nameIdentifiers?: {
    nameIdentifier: string;
    nameIdentifierScheme?: string;
    schemeURI?: string;
  }[];
};

// Build InvenioRDM-format creator objects from DB creator data.
// DB data has full structured creators; legacy draft only has combined name strings.
function buildRdmCreators(
  dbCreators: InvenioCreator[],
  options?: { skipRorIds?: boolean },
) {
  const skipIds = options?.skipRorIds ?? false;

  return dbCreators.map((c) => {
    const isOrg = c.nameType?.toLowerCase() === "organizational";

    const orcidRaw = c.nameIdentifiers?.map(extractOrcid).find(Boolean);
    const orcidBare = orcidRaw?.replace(/^https?:\/\/orcid\.org\//i, "").trim();
    const orcid =
      orcidBare && isValidOrcidChecksum(orcidBare) ? orcidBare : undefined;

    if (orcidRaw && !orcid) {
      console.warn(
        `[Zenodo] RDM affiliation patch: dropping invalid ORCID "${orcidRaw}" (failed format/checksum)`,
      );
    }

    const affiliations = (c.affiliation ?? [])
      .filter((a) => a.name?.trim())
      .map((a) => {
        const rorId = skipIds
          ? undefined
          : extractRorId(
              a.affiliationIdentifier,
              a.affiliationIdentifierScheme,
            );

        return { name: a.name, ...(rorId && { id: rorId }) };
      });

    if (isOrg) {
      return {
        person_or_org: {
          type: "organizational" as const,
          name: c.name || c.familyName || "",
          ...(orcid && {
            identifiers: [{ scheme: "orcid", identifier: orcid }],
          }),
        },
        ...(affiliations.length > 0 && { affiliations }),
      };
    }

    let familyName = c.familyName;
    let givenName = c.givenName;
    if (!familyName && !givenName && c.name) {
      const commaIdx = c.name.indexOf(",");
      if (commaIdx !== -1) {
        familyName = c.name.slice(0, commaIdx).trim();
        givenName = c.name.slice(commaIdx + 1).trim();
      } else {
        familyName = c.name.trim();
      }
    }

    return {
      person_or_org: {
        type: "personal" as const,
        ...(familyName && { family_name: familyName }),
        ...(givenName && { given_name: givenName }),
        ...(orcid && { identifiers: [{ scheme: "orcid", identifier: orcid }] }),
      },
      ...(affiliations.length > 0 && { affiliations }),
    };
  });
}

// DataCite resourceTypeGeneral → InvenioRDM resource_type.id (conservative mapping)
const DATACITE_TO_INVENIORDM_TYPE: Record<string, string> = {
  Audiovisual: "video",
  Book: "publication-book",
  BookChapter: "publication-section",
  ComputationalNotebook: "software-computationalnotebook",
  ConferencePaper: "publication-conferencepaper",
  Dataset: "dataset",
  Dissertation: "publication-thesis",
  Image: "image",
  JournalArticle: "publication-article",
  Preprint: "publication-preprint",
  Report: "publication-report",
  Software: "software",
  Other: "other",
};

type RdmExtras = {
  skipRorIds?: boolean;
  skipFunderIds?: boolean;
  submissionAbstract?: string;
  rawFunding?: FundingReference[];
  dbRelated?: {
    relatedIdentifier?: string;
    relatedIdentifierType?: string;
    relationType?: string;
    resourceTypeGeneral?: string;
  }[];
  presentedDates?: {
    date: string;
    type: { id: string };
    description?: string;
  }[];
  // Echoed back on the PUT so a full replacement update cannot drop a DOI the
  // draft already carries.
  pids?: Record<string, unknown>;
};

// Builds a complete InvenioRDM PUT payload directly from DB data.
// Used instead of convertLegacyDraftToRdmPayload so we never need to GET the
// legacy draft before updating metadata.
function buildFullRdmPayload(
  posterTitle: string,
  posterDescription: string,
  meta: Record<string, unknown>,
  dbCreators: InvenioCreator[],
  options?: RdmExtras,
): object {
  const rdmCreators = buildRdmCreators(dbCreators, options);

  const keywords = ((meta.subjects as string[] | undefined) ?? []).filter(
    (s) => s !== "",
  );

  const lang2 = meta.language as string | null | undefined;
  const lang3 = lang2
    ? ((ISO639_1_TO_3 as Record<string, string>)[lang2] ?? lang2)
    : undefined;

  const licenseId = (meta.license as string | null | undefined)
    ? (meta.license as string).toLowerCase()
    : undefined;

  const rawRelated = (options?.dbRelated ?? []).filter(
    (r) => r.relatedIdentifier && r.relatedIdentifierType && r.relationType,
  );
  const rdmRelated = rawRelated
    .filter((r) => {
      const scheme = r.relatedIdentifierType!.toLowerCase();
      const id = r.relatedIdentifier!;
      if (scheme === "url") return /^https?:\/\//.test(id);
      if (scheme === "doi") return /^10\.\d{4,}\//.test(id);

      return true;
    })
    .map((r) => {
      const rdmType = r.resourceTypeGeneral
        ? DATACITE_TO_INVENIORDM_TYPE[r.resourceTypeGeneral]
        : undefined;

      return {
        identifier: r.relatedIdentifier!,
        scheme: r.relatedIdentifierType!.toLowerCase(),
        relation_type: { id: r.relationType!.toLowerCase() },
        ...(rdmType && { resource_type: { id: rdmType } }),
      };
    });

  const funding = (options?.rawFunding ?? [])
    .filter((f) => f.funderName?.trim())
    .map((f) => {
      const rorId = options?.skipFunderIds
        ? undefined
        : extractRorId(f.funderIdentifier, f.funderIdentifierType);
      const entry: Record<string, unknown> = {
        funder: { name: f.funderName, ...(rorId && { id: rorId }) },
      };
      if (f.awardNumber?.trim() || f.awardTitle?.trim()) {
        entry.award = {
          ...(f.awardNumber?.trim() && { number: f.awardNumber }),
          ...(f.awardTitle?.trim() && { title: { en: f.awardTitle } }),
          ...(f.awardUri?.trim() && {
            identifiers: [{ identifier: f.awardUri, scheme: "url" }],
          }),
        };
      }

      return entry;
    });

  const additionalDescriptions = options?.submissionAbstract
    ? [{ description: options.submissionAbstract, type: { id: "abstract" } }]
    : [];

  const conferenceDates =
    (meta.conferenceStartDate as string | null) &&
    (meta.conferenceEndDate as string | null)
      ? `${meta.conferenceStartDate} - ${meta.conferenceEndDate}`
      : (meta.conferenceStartDate as string | null) ||
        (meta.conferenceEndDate as string | null) ||
        (meta.conferenceYear ? String(meta.conferenceYear) : undefined);

  const meeting: Record<string, string> = {};
  if (meta.conferenceName) meeting.title = meta.conferenceName as string;
  if (meta.conferenceAcronym)
    meeting.acronym = meta.conferenceAcronym as string;
  if (meta.conferenceLocation)
    meeting.place = meta.conferenceLocation as string;
  if (meta.conferenceUri) meeting.url = meta.conferenceUri as string;
  if (conferenceDates) meeting.dates = conferenceDates;
  const customFields: Record<string, unknown> = {};
  if (Object.keys(meeting).length > 0) {
    customFields["meeting:meeting"] = meeting;
  }

  return {
    metadata: {
      title: posterTitle,
      description: posterDescription,
      publication_date: String(new Date().getFullYear()),
      resource_type: { id: "poster" },
      publisher: "Zenodo",
      creators: rdmCreators,
      ...(keywords.length > 0 && {
        subjects: keywords.map((kw) => ({ subject: kw })),
      }),
      ...(lang3 && { languages: [{ id: lang3 }] }),
      ...(licenseId && { rights: [{ id: licenseId }] }),
      ...(rdmRelated.length > 0 && { related_identifiers: rdmRelated }),
      ...(funding.length > 0 && { funding }),
      ...(additionalDescriptions.length > 0 && {
        additional_descriptions: additionalDescriptions,
      }),
      ...(options?.presentedDates?.length && {
        dates: options.presentedDates,
      }),
      ...((meta.version as string | null | undefined) && {
        version: meta.version as string,
      }),
    },
    ...(Object.keys(customFields).length > 0 && {
      custom_fields: customFields,
    }),
    ...(options?.pids && { pids: options.pids }),
  };
}

// PUTs a complete InvenioRDM metadata payload for the given deposition.
// This is the sole metadata update path - replaces the legacy deposit API entirely.
async function updateRdmMetadata(
  recordId: number,
  zenodoToken: string,
  posterTitle: string,
  posterDescription: string,
  meta: Record<string, unknown>,
  creators: InvenioCreator[],
  extras?: Pick<
    RdmExtras,
    | "submissionAbstract"
    | "rawFunding"
    | "dbRelated"
    | "presentedDates"
    | "pids"
  >,
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = buildFullRdmPayload(
      posterTitle,
      posterDescription,
      meta,
      creators,
      { ...extras },
    );
    console.log(
      `[Zenodo] RDM metadata: sending payload [record ${recordId}] - ${describeRdmPayload(payload)}`,
    );

    if (logFullPayloads) {
      console.log(
        `[Zenodo] RDM metadata payload [record ${recordId}]: ${JSON.stringify(payload, null, 2)}`,
      );
    }

    const putDraft = async (body: object) => {
      const res = await fetch(
        `${config.zenodoApiEndpoint}/records/${recordId}/draft`,
        {
          method: "PUT",
          headers: rdmHeaders(zenodoToken, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(body),
        },
      );
      const text = await res.text().catch(() => "");

      return { ok: res.ok, status: res.status, body: text };
    };

    let put = await putDraft(payload);

    // Zenodo's vocabulary doesn't include every ROR/funder ID. Detect the
    // rejection via structured errors[] first; fall back to substring match
    // if the body isn't valid JSON or has no errors array.
    const isVocabularyRejection = (res: {
      ok: boolean;
      status: number;
      body: string;
    }) => {
      if (res.ok || res.status !== 400) return false;
      try {
        const parsed = JSON.parse(res.body) as {
          errors?: { message?: string }[];
        };
        if (parsed.errors?.length) {
          return parsed.errors.some((e) =>
            /invalid value/i.test(e.message ?? ""),
          );
        }
      } catch {
        // not JSON - fall through to substring check
      }

      return /invalid value/i.test(res.body);
    };

    // Kept so a failing retry still reports what originally went wrong.
    let vocabularyRejection = "";

    if (isVocabularyRejection(put)) {
      vocabularyRejection = `${put.status} - ${put.body}`;

      console.warn(
        `[Zenodo] RDM metadata: ROR/funder vocabulary rejection (status: ${put.status}) - ${truncateForLog(put.body)}. Retrying without ROR/funder IDs.`,
      );

      const fallback = buildFullRdmPayload(
        posterTitle,
        posterDescription,
        meta,
        creators,
        { ...extras, skipRorIds: true, skipFunderIds: true },
      );

      if (logFullPayloads) {
        console.log(
          `[Zenodo] RDM metadata: retry payload (name-only affiliations/funders): ${JSON.stringify(fallback, null, 2)}`,
        );
      }

      put = await putDraft(fallback);
    }

    if (!put.ok) {
      const msg = vocabularyRejection
        ? `RDM metadata PUT failed [record ${recordId}] (status: ${put.status}) - ${put.body} (first attempt was rejected with ${vocabularyRejection})`
        : `RDM metadata PUT failed [record ${recordId}] (status: ${put.status}) - ${put.body}`;

      console.error(`[Zenodo] ${msg}`);

      return { success: false, error: msg };
    }

    console.log(`[Zenodo] RDM metadata: success [record ${recordId}]`);

    return { success: true };
  } catch (err) {
    const msg = `RDM metadata: unexpected error [record ${recordId}] - ${(err as Error).message}`;
    console.error(`[Zenodo] ${msg}`, err);

    return { success: false, error: msg };
  }
}

function shouldRetryZenodoUpload(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();

  return (
    lower.includes("file upload transfer failed") ||
    lower.includes("please try again") ||
    lower.includes(" 500 ") ||
    lower.includes(" 502 ") ||
    lower.includes(" 503 ") ||
    lower.includes(" 504 ")
  );
}

async function deleteZenodoDraftFileIfPresent(
  recordId: number,
  zenodoToken: string,
  filename: string,
) {
  const response = await fetch(
    `${config.zenodoApiEndpoint}/records/${recordId}/draft/files/${encodeURIComponent(filename)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: zenodoAuthHeader(zenodoToken),
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const errorMsg = await getZenodoErrorMessage(
      `Failed to delete draft file "${filename}" [record ${recordId}]`,
      response,
    );

    console.warn(`[Zenodo] ${errorMsg}`);
  }
}

type ZenodoDraftFileEntry = {
  key?: string;
  links?: {
    self?: string;
    content?: string;
    commit?: string;
  };
};

// Zenodo keys draft files by name, and a key cannot contain a path separator.
function sanitizeZenodoFileKey(name: string): string {
  const cleaned = name
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned.slice(0, 255) : "poster.pdf";
}

// A file to upload. Streams have to arrive as a factory rather than a
// ReadableStream: the retry loop may need the body more than once, and a
// consumed stream cannot be replayed.
type ZenodoUploadSource =
  | ArrayBuffer
  | {
      open: () => Promise<{
        body: ReadableStream<Uint8Array>;
        contentLength?: string;
      }>;
    };

async function initializeZenodoDraftFile(
  recordId: number,
  zenodoToken: string,
  filename: string,
) {
  const response = await fetch(
    `${config.zenodoApiEndpoint}/records/${recordId}/draft/files`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: zenodoAuthHeader(zenodoToken),
      },
      body: JSON.stringify([{ key: filename }]),
    },
  );

  if (!response.ok) {
    return { success: false as const, response };
  }

  const data = (await response.json()) as { entries?: ZenodoDraftFileEntry[] };
  const entry = data.entries?.find((file) => file.key === filename);

  if (!entry?.links?.content || !entry.links.commit) {
    return {
      success: false as const,
      error: `Zenodo did not return content/commit links for draft file "${filename}"`,
    };
  }

  return { success: true as const, entry };
}

async function uploadFileToZenodoDraft(
  recordId: number,
  zenodoToken: string,
  filename: string,
  source: ZenodoUploadSource,
) {
  console.log(
    `[Zenodo] Uploading file "${filename}" to RDM draft [record ${recordId}]`,
  );

  const maxAttempts = 3;
  const authHeader = zenodoAuthHeader(zenodoToken);
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await deleteZenodoDraftFileIfPresent(recordId, zenodoToken, filename);
    }

    const initialized = await initializeZenodoDraftFile(
      recordId,
      zenodoToken,
      filename,
    );

    if (!initialized.success) {
      if ("response" in initialized) {
        lastError = await getZenodoErrorMessage(
          `Failed to initialize draft file "${filename}" [record ${recordId}]`,
          initialized.response!,
        );
      } else {
        lastError = initialized.error;
      }
      console.log(`[Zenodo] ${lastError}`);

      if (attempt === 1) {
        await deleteZenodoDraftFileIfPresent(recordId, zenodoToken, filename);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      return { success: false, error: lastError };
    }

    const contentUrl = initialized.entry.links!.content!;
    const commitUrl = initialized.entry.links!.commit!;
    console.log(
      `[Zenodo] Draft file "${filename}" initialized with content and commit links`,
    );

    let body: BodyInit;
    let contentLength: string;
    let streaming = false;

    try {
      if (source instanceof ArrayBuffer) {
        body = source;
        contentLength = String(source.byteLength);
      } else {
        const opened = await source.open();

        if (opened.contentLength) {
          body = opened.body;
          contentLength = opened.contentLength;
          streaming = true;
        } else {
          // Without a length undici falls back to chunked transfer encoding,
          // which Zenodo's content endpoint does not reliably accept. Buffer
          // this attempt instead of risking it.
          const buffered = await new Response(opened.body).arrayBuffer();

          body = buffered;
          contentLength = String(buffered.byteLength);
        }
      }
    } catch (error) {
      lastError = `Failed to read file "${filename}" for upload [record ${recordId}]: ${(error as Error).message}`;
      console.log(`[Zenodo] ${lastError} (attempt ${attempt}/${maxAttempts})`);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      return { success: false, error: lastError };
    }

    let contentResponse: Response;

    try {
      contentResponse = await fetch(contentUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": contentLength,
          Authorization: authHeader,
        },
        body,
        ...(streaming && { duplex: "half" }),
      } as RequestInit & { duplex?: "half" });
    } catch (error) {
      // A transport failure is retryable and streamed bodies
      // break mid jounrey more often than buffered ones.
      lastError = `Failed to upload file "${filename}" [record ${recordId}]: ${(error as Error).message}`;
      console.log(`[Zenodo] ${lastError} (attempt ${attempt}/${maxAttempts})`);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      return { success: false, error: lastError };
    }

    if (!contentResponse.ok) {
      lastError = await getZenodoErrorMessage(
        `Failed to upload file "${filename}" [record ${recordId}]`,
        contentResponse,
      );
      console.log(`[Zenodo] ${lastError} (attempt ${attempt}/${maxAttempts})`);

      if (attempt < maxAttempts && shouldRetryZenodoUpload(lastError)) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      return { success: false, error: lastError };
    }

    const contentData = (await contentResponse
      .json()
      .catch(() => null)) as ZenodoDraftFileEntry | null;
    const uploadedCommitUrl = contentData?.links?.commit ?? commitUrl;
    console.log(
      `[Zenodo] Draft file "${filename}" content uploaded: key=${contentData?.key ?? "unknown"}, hasCommit=${!!contentData?.links?.commit}`,
    );

    let commitResponse: Response;

    try {
      commitResponse = await fetch(uploadedCommitUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
        },
      });
    } catch (error) {
      lastError = `Failed to commit draft file "${filename}" [record ${recordId}]: ${(error as Error).message}`;
      console.log(`[Zenodo] ${lastError} (attempt ${attempt}/${maxAttempts})`);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      return { success: false, error: lastError };
    }

    if (!commitResponse.ok) {
      lastError = await getZenodoErrorMessage(
        `Failed to commit draft file "${filename}" [record ${recordId}]`,
        commitResponse,
      );
      console.log(`[Zenodo] ${lastError} (attempt ${attempt}/${maxAttempts})`);

      // Retrying restarts the whole attempt  (delete, re-init, re-upload) so a
      // half registered file cannot mess with the next commit.
      if (attempt < maxAttempts && shouldRetryZenodoUpload(lastError)) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      return { success: false, error: lastError };
    }

    const data = await commitResponse.json();

    console.log(
      `[Zenodo] Uploaded file "${filename}" successfully [record ${recordId}]`,
    );

    return { success: true, data };
  }

  return {
    success: false,
    error:
      lastError || `Failed to upload file "${filename}" [record ${recordId}]`,
  };
}

// The raw InvenioRDM record never leaves
// this module so  UI work with these fields instead.
export type ZenodoPublishResult = {
  recordId: number;
  doi?: string;
  conceptDoi?: string;
  conceptRecordId?: number;
  recordUrl: string;
};

async function publishRdmDraft(zenodoToken: string, recordId: number) {
  console.log(`[Zenodo] Publishing draft [record ${recordId}]`);

  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${recordId}/draft/actions/publish`,
      {
        method: "POST",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
      },
    );

    if (!response.ok) {
      const errorMsg = await getZenodoErrorMessage(
        `Failed to publish [record ${recordId}]`,
        response,
      );

      console.error(`[Zenodo] ${errorMsg}`);

      return { success: false as const, error: errorMsg };
    }

    const rawBody = await response.text().catch(() => "");
    const record = parseRdmRecord(rawBody);
    const publishedId = Number(record?.id);

    if (!Number.isFinite(publishedId)) {
      console.error(
        `[Zenodo] Publish response had no usable record id [record ${recordId}] - ${truncateForLog(rawBody)}`,
      );

      return {
        success: false as const,
        error: `Zenodo published [record ${recordId}] but returned an unusable record id`,
      };
    }

    const conceptRecordId = extractConceptRecordId(record);
    const data: ZenodoPublishResult = {
      recordId: publishedId,
      doi: extractRecordDoi(record),
      conceptDoi: extractConceptDoi(record),
      ...(conceptRecordId !== undefined && { conceptRecordId }),
      // self_html is this exact version; latest_html redirects to whichever
      // version is newest, which is not what the user just published.
      recordUrl:
        record?.links?.self_html ??
        record?.links?.record_html ??
        record?.links?.latest_html ??
        "",
    };

    console.log(
      `[Zenodo] Published record ${data.recordId} - doi: ${data.doi}, concept doi: ${data.conceptDoi ?? "none"}, url: ${data.recordUrl}`,
    );

    return { success: true as const, data };
  } catch (error) {
    const errorMsg = `Failed to publish [record ${recordId}]: ${(error as Error).message}`;

    console.error(`[Zenodo] ${errorMsg}`);

    return { success: false as const, error: errorMsg };
  }
}
