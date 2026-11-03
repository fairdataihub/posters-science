import {
  zenodoPublicRdmAccess,
  type ZenodoRdmAccess,
} from "#shared/utils/zenodoFileEmbargoAccess";
import { getZenodoAccessTokenForApi } from "~~/server/utils/zenodo";
import prisma from "~~/server/utils/prisma";

const config = useRuntimeConfig();

// Without this Accept header Zenodo's draft endpoints return the legacy deposit
// shape. Round-tripping that through PUT drops metadata.resource_type and
// creators, and publish then fails validation (see RDM_ACCEPT in zenodo.ts).
const RDM_ACCEPT = "application/vnd.inveniordm.v1+json";

function rdmHeaders(zenodoToken: string, extra: Record<string, string> = {}) {
  return {
    Accept: RDM_ACCEPT,
    Authorization: `Bearer ${zenodoToken}`,
    ...extra,
  };
}

/**
 * Discard the edit draft of a published record (the published version is
 * untouched). Best effort: used to clear a leftover or half-updated draft.
 */
async function discardEditDraft(zenodoToken: string, recordId: number) {
  try {
    await fetch(`${config.zenodoApiEndpoint}/records/${recordId}/draft`, {
      method: "DELETE",
      headers: rdmHeaders(zenodoToken),
    });
  } catch {
    // Ignore: a later attempt will try again.
  }
}

async function createEditDraftFromPublishedRecord(
  zenodoToken: string,
  recordId: number,
): Promise<
  { success: true; draftId: number } | { success: false; error: string }
> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${recordId}/draft`,
      {
        method: "POST",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
      },
    );

    if (response.ok) {
      const data = (await response.json()) as { id?: string | number };
      const draftId = Number(data.id);
      if (!Number.isFinite(draftId)) {
        return {
          success: false,
          error: `Zenodo returned an unusable draft id for record ${recordId}`,
        };
      }
      return { success: true, draftId };
    }

    if (response.status === 409 || response.status === 400) {
      // An edit draft already exists, possibly left half-updated by an earlier
      // failed attempt. Discard it and open a fresh one from the published record.
      await discardEditDraft(zenodoToken, recordId);
      const retry = await fetch(
        `${config.zenodoApiEndpoint}/records/${recordId}/draft`,
        {
          method: "POST",
          headers: rdmHeaders(zenodoToken, {
            "Content-Type": "application/json",
          }),
        },
      );
      if (retry.ok) {
        const data = (await retry.json()) as { id?: string | number };
        const draftId = Number(data.id);
        if (Number.isFinite(draftId)) {
          return { success: true, draftId };
        }
      }
    }

    const body = await response.text().catch(() => "");
    return {
      success: false,
      error: `Could not open a Zenodo edit draft for record ${recordId} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Could not open a Zenodo edit draft for record ${recordId}: ${(error as Error).message}`,
    };
  }
}

async function fetchRdmDraftPayload(
  zenodoToken: string,
  draftId: number,
): Promise<
  { success: true; draft: Record<string, unknown> } | { success: false; error: string }
> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${draftId}/draft`,
      { headers: rdmHeaders(zenodoToken) },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        error: `Could not read Zenodo draft ${draftId} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    const draft = (await response.json()) as Record<string, unknown>;
    return { success: true, draft };
  } catch (error) {
    return {
      success: false,
      error: `Could not read Zenodo draft ${draftId}: ${(error as Error).message}`,
    };
  }
}

/**
 * Read the published record in RDM format. Zenodo's edit-draft endpoint can
 * ignore the RDM Accept header and return the legacy deposit shape (no
 * metadata.resource_type, legacy creators/dates), which then fails validation;
 * the published-record endpoint honors it, and the edit draft starts as a copy
 * of the published record anyway.
 */
async function fetchPublishedRdmRecord(
  zenodoToken: string,
  recordId: number,
): Promise<
  { success: true; record: Record<string, unknown> } | { success: false; error: string }
> {
  try {
    const response = await fetch(`${config.zenodoApiEndpoint}/records/${recordId}`, {
      headers: rdmHeaders(zenodoToken),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        error: `Could not read Zenodo record ${recordId} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }
    const record = (await response.json()) as Record<string, unknown>;
    return { success: true, record };
  } catch (error) {
    return {
      success: false,
      error: `Could not read Zenodo record ${recordId}: ${(error as Error).message}`,
    };
  }
}

function hasRdmMetadata(record: Record<string, unknown>): boolean {
  const metadata = record.metadata as Record<string, unknown> | undefined;
  const resourceType = metadata?.resource_type as { id?: unknown } | undefined;
  return Boolean(resourceType?.id) && Array.isArray(metadata?.creators);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * GET returns vocabulary references expanded with read-only fields, e.g.
 * rights { id, title: { en }, icon, props }, affiliations { id, name,
 * identifiers }. A draft PUT only accepts the reference and rejects the rest as
 * "Unknown field". Within RDM metadata every object carrying a string `id` is
 * such a reference (rights, languages, resource_type, subjects, roles, date /
 * relation / description types, affiliations, funders, awards), so collapse it
 * to { id }. Entries without an id (custom rights, free-text affiliations or
 * awards) are left as-is.
 */
function collapseRdmVocabularies(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(collapseRdmVocabularies);
  if (!isPlainObject(value)) return value;

  if (typeof value.id === "string" && value.id.trim()) {
    return { id: value.id };
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = collapseRdmVocabularies(child);
  }
  return out;
}

/**
 * Edit payload with public file access: only the parts an RDM draft PUT
 * accepts (whitelisted), copied from an RDM-format record.
 */
function publicAccessPayloadFromRecord(
  record: Record<string, unknown>,
  access: ZenodoRdmAccess,
): Record<string, unknown> {
  return {
    access,
    files: { enabled: true },
    metadata: collapseRdmVocabularies(record.metadata),
    ...(record.custom_fields ? { custom_fields: record.custom_fields } : {}),
    // Keep the existing DOI: a draft PUT is a full replacement.
    ...(record.pids ? { pids: record.pids } : {}),
  };
}

async function putRdmDraftPayload(
  zenodoToken: string,
  draftId: number,
  payload: Record<string, unknown>,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${draftId}/draft`,
      {
        method: "PUT",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      },
    );

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        success: false,
        error: `Zenodo rejected the draft update for ${draftId} (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    // Zenodo saves invalid drafts with 200 and lists problems in errors[];
    // publish would fail later, so stop here with the real reason.
    try {
      const parsed = JSON.parse(body) as { errors?: unknown[] };
      if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        return {
          success: false,
          error: `Zenodo flagged the draft update for ${draftId}: ${JSON.stringify(parsed.errors).slice(0, 300)}`,
        };
      }
    } catch {
      // Non-JSON body: treat as success.
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update Zenodo draft ${draftId}: ${(error as Error).message}`,
    };
  }
}

async function publishZenodoDraft(
  zenodoToken: string,
  draftId: number,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const response = await fetch(
      `${config.zenodoApiEndpoint}/records/${draftId}/draft/actions/publish`,
      {
        method: "POST",
        headers: rdmHeaders(zenodoToken, {
          "Content-Type": "application/json",
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        error: `Zenodo could not publish the embargo update (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to publish Zenodo draft ${draftId}: ${(error as Error).message}`,
    };
  }
}

/**
 * Lifts an active Zenodo file embargo early (same DOI; edit draft + republish).
 */
export async function liftZenodoFileEmbargoForPoster(
  userId: string,
  posterId: number,
): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getZenodoAccessTokenForApi(userId);
  if (!accessToken) {
    return { success: false, error: "Sign in to Zenodo before releasing files." };
  }

  const poster = await prisma.poster.findFirst({
    where: { id: posterId, userId },
    select: {
      id: true,
      status: true,
      zenodoDepositions: {
        select: {
          depositionId: true,
          status: true,
          filesEmbargoUntil: true,
        },
      },
    },
  });

  if (!poster?.zenodoDepositions?.depositionId) {
    return { success: false, error: "This poster is not linked to Zenodo." };
  }

  if (poster.status !== "published") {
    return {
      success: false,
      error: "Only published posters can have file embargoes lifted.",
    };
  }

  const recordId = poster.zenodoDepositions.depositionId;
  const editDraft = await createEditDraftFromPublishedRecord(
    accessToken,
    recordId,
  );
  if (!editDraft.success) {
    return { success: false, error: editDraft.error };
  }

  const publicAccess = zenodoPublicRdmAccess();

  // Prefer the published record (reliably RDM format); fall back to the draft
  // only if it is RDM-shaped. Never PUT a legacy-shaped body.
  let source: Record<string, unknown> | null = null;
  const published = await fetchPublishedRdmRecord(accessToken, recordId);
  if (published.success && hasRdmMetadata(published.record)) {
    source = published.record;
  } else {
    const loaded = await fetchRdmDraftPayload(accessToken, editDraft.draftId);
    if (loaded.success && hasRdmMetadata(loaded.draft)) {
      source = loaded.draft;
    }
  }
  if (!source) {
    await discardEditDraft(accessToken, recordId);
    return {
      success: false,
      error: `Zenodo did not return record ${recordId} in the expected format, so its files could not be released. Nothing was changed.`,
    };
  }

  const updatedPayload = publicAccessPayloadFromRecord(source, publicAccess);

  const saved = await putRdmDraftPayload(
    accessToken,
    editDraft.draftId,
    updatedPayload,
  );
  if (!saved.success) {
    await discardEditDraft(accessToken, recordId);
    return { success: false, error: saved.error };
  }

  const publishResult = await publishZenodoDraft(accessToken, editDraft.draftId);
  if (!publishResult.success) {
    // Leave the published record as it was so a retry starts clean.
    await discardEditDraft(accessToken, recordId);
    return { success: false, error: publishResult.error };
  }

  await prisma.zenodoDeposition.update({
    where: { posterId },
    // Store today's UTC date ("embargo ended today"), not null: null means
    // "unknown" and the resolver would fall back to the batch's embargo days,
    // making the poster look embargoed again.
    data: { filesEmbargoUntil: new Date().toISOString().slice(0, 10) },
  });

  return { success: true };
}
