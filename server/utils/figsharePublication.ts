import { buildPosterJson } from "./buildPosterJson";
import {
  buildFigshareArticle,
  figshareFundingText,
  matchFigshareLicense,
  spdxForFigshareLicense,
  type DbFundingReference,
} from "./figshareArticle";
import {
  FigshareApiError,
  type FigshareAccount,
  type FigshareAuthor,
  type FigshareAuthorInput,
  type FigshareClient,
  type FigsharePrivateArticle,
} from "./figshareClient";
import { figshareClientFor, getFigshareAccessToken } from "./figshare";
import { copyThumbnailToPublicZone, getOrCreateThumbnail } from "./zenodo";
import {
  posterFamilyRootId,
  posterFamilyWhere,
  posterVersionLabel,
} from "./posterVersions";

/**
 * Publishes a poster to the user's own Figshare account. The sequence follows
 * crosswalk/figshare.md: create a private item (storing its id right away),
 * set the authors, reserve the DOI, upload the poster file and poster.json,
 * publish, then read the item back.
 *
 * Every version of a poster family is the same Figshare item: a new version
 * updates it, replaces its files and publishes again, and Figshare numbers the
 * version itself.
 *
 * A retry never makes a second item or a second publish: the stored item is
 * checked first, and an item Figshare already published is finished locally.
 */

export type FigsharePublicationProgress = {
  step: string;
  /** skipped: the publish step on a draft-only site. */
  status: "in_progress" | "completed" | "skipped" | "error";
  message: string;
};

type ProgressCallback = (
  event: FigsharePublicationProgress,
) => void | Promise<void>;

export type FigsharePublicationResult =
  | {
      success: true;
      data: {
        articleId: number;
        doi?: string;
        url?: string;
        version?: number;
        /** The institution reviews items before they are public. */
        underReview?: boolean;
        /** This site stops at a private draft (isFigshareDraftOnly). */
        draftOnly?: boolean;
        /** The draft's private page on Figshare, for the owner. */
        privateUrl?: string;
      };
    }
  | { success: false; error: string };

type PosterIdentifier = { identifier: string; identifierType: string };

const config = useRuntimeConfig();

function fail(error: string): FigsharePublicationResult {
  return { success: false, error };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** The versioned DOI of a published item (".v2"), when Figshare gives a DOI. */
function versionedDoi(article: FigsharePrivateArticle) {
  const doi = article.doi?.trim();

  if (!doi) return undefined;
  if (/\.v\d+$/i.test(doi) || !article.version) return doi;

  return `${doi}.v${article.version}`;
}

function publicUrl(article: FigsharePrivateArticle) {
  return article.url_public_html || article.figshare_url || undefined;
}

function isPublic(article: FigsharePrivateArticle) {
  return article.is_public === true || article.status === "public";
}

function normalizeName(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * Figshare adds the account owner as an author of a new item. Replace the
 * list with the poster's authors, linking the owner's Figshare profile in
 * place of the matching author (same ORCID iD, or same name), and leaving the
 * owner out when they are not an author of the poster.
 */
async function setAuthors(
  client: FigshareClient,
  articleId: number,
  authors: FigshareAuthorInput[],
  account: FigshareAccount,
) {
  const current = await client.authors(articleId);
  const ownerName = normalizeName(
    `${account.first_name ?? ""} ${account.last_name ?? ""}`,
  );
  const owner = current.find(
    (author: FigshareAuthor) =>
      author.is_active &&
      ((account.orcid_id && author.orcid_id === account.orcid_id) ||
        (ownerName && normalizeName(author.full_name) === ownerName)),
  );

  const list = authors.map((author) => {
    if (!owner || "id" in author) return author;

    const sameOrcid =
      !!author.orcid_id &&
      (author.orcid_id === owner.orcid_id ||
        author.orcid_id === account.orcid_id);
    const name = normalizeName(
      author.name ?? `${author.first_name ?? ""} ${author.last_name ?? ""}`,
    );
    const sameName = !!ownerName && name === ownerName;

    return sameOrcid || sameName ? { id: owner.id } : author;
  });

  // Only one entry may point at the owner.
  let ownerUsed = false;
  const deduped = list.filter((author) => {
    if (!("id" in author)) return true;
    if (ownerUsed) return false;

    ownerUsed = true;

    return true;
  });

  await client.replaceAuthors(articleId, deduped);
}

/**
 * Links a grant by its Figshare id when the funding search finds exactly one
 * with the same award number from the same funder; otherwise free text.
 */
async function buildFundingList(
  client: FigshareClient,
  fundingReferences: DbFundingReference[],
) {
  const list: ({ id: number } | { title: string })[] = [];

  for (const funding of fundingReferences) {
    const text = figshareFundingText(funding);

    if (!text) continue;

    const award = funding.awardNumber?.trim();
    const funder = normalizeName(funding.funderName);

    if (award && funder) {
      try {
        const matches = (await client.searchFunding(award)).filter(
          (match) =>
            match.grant_code?.trim().toLowerCase() === award.toLowerCase() &&
            normalizeName(match.funder_name) === funder,
        );

        if (matches.length === 1 && matches[0]) {
          list.push({ id: matches[0].id });
          continue;
        }
      } catch (error) {
        // The search is a nicety; fall back to text.
        console.warn(`[Figshare] Funding search failed: ${errorText(error)}`);
      }
    }

    list.push({ title: text });
  }

  return list;
}

async function linkDeposition(
  posterId: number,
  userId: string,
  articleId: number,
  status: string,
  published?: { doi?: string; version?: number; url?: string },
) {
  const data = {
    userId,
    articleId,
    status,
    ...(published?.doi && { lastPublishedDoi: published.doi }),
    ...(published?.version !== undefined && {
      figshareVersion: published.version,
    }),
    ...(published?.url && { publicUrl: published.url }),
  };

  await prisma.figshareDeposition.upsert({
    where: { posterId },
    create: { posterId, ...data },
    update: data,
  });
}

/**
 * Marks the poster published from a public Figshare item. The deposition row
 * is updated first, so if the transaction below fails a retry finds the item
 * already published and only repeats this step.
 */
async function finishLocally(
  poster: {
    id: number;
    versionRootId: number | null;
    imageUrl: string;
    posterMetadata: { identifiers: unknown; license: string | null } | null;
  },
  userId: string,
  article: FigsharePrivateArticle,
  spdxLicense?: string,
): Promise<FigsharePublicationResult> {
  const doi = versionedDoi(article);
  const handle = article.handle?.trim();
  const url = publicUrl(article);

  await linkDeposition(poster.id, userId, article.id, "published", {
    ...(doi && { doi }),
    ...(article.version && { version: article.version }),
    ...(url && { url }),
  });

  const thumbnail = await copyThumbnailToPublicZone(poster.imageUrl);

  if (!thumbnail.success) return fail(thumbnail.error);

  const existing = Array.isArray(poster.posterMetadata?.identifiers)
    ? (poster.posterMetadata.identifiers as PosterIdentifier[])
    : [];
  const newIdentifier: PosterIdentifier | undefined = doi
    ? { identifier: doi, identifierType: "DOI" }
    : handle
      ? { identifier: handle, identifierType: "Handle" }
      : undefined;
  const identifiers =
    newIdentifier &&
    !existing.some((entry) => entry.identifier === newIdentifier.identifier)
      ? [newIdentifier, ...existing]
      : existing;
  const rootId = posterFamilyRootId(poster);

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
        imageUrl: thumbnail.imageUrl,
      },
    }),
    prisma.posterMetadata.update({
      where: { posterId: poster.id },
      data: {
        ...(doi && { doi }),
        publisher: "figshare",
        identifiers,
        ...(spdxLicense && { license: spdxLicense }),
      },
    }),
  ]);

  console.log(
    `[Figshare] Poster ${poster.id} published as item ${article.id} v${article.version ?? "?"}`,
  );

  return {
    success: true,
    data: {
      articleId: article.id,
      ...(doi && { doi }),
      ...(url && { url }),
      ...(article.version && { version: article.version }),
    },
  };
}

async function downloadPosterFile(filePath: string) {
  const response = await fetch(`${config.bunnyPrivateStorage}/${filePath}`, {
    headers: { AccessKey: config.bunnyPrivateStorageKey },
  });

  if (!response.ok) {
    throw new Error(
      `Could not read the poster file from storage (status ${response.status})`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

/** A file name Figshare and browsers handle: ASCII letters, digits, dot, dash, underscore. */
function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "");

  return cleaned || "poster.pdf";
}

export async function beginFigsharePublication(options: {
  posterId: number;
  userId: string;
  categoryIds: number[];
  licenseId: number;
  onProgress?: ProgressCallback;
}): Promise<FigsharePublicationResult> {
  const { posterId, userId, categoryIds, licenseId, onProgress } = options;

  const stored = await getFigshareAccessToken(userId);

  if (!stored.token) {
    return fail("Connect your Figshare account before publishing.");
  }

  const client = figshareClientFor(stored.token);

  await onProgress?.({
    step: "deposition",
    status: "in_progress",
    message: "Preparing the Figshare item...",
  });

  const poster = await prisma.poster.findUnique({
    where: { id: posterId, userId },
    include: {
      posterMetadata: true,
      figshareDeposition: true,
      zenodoDepositions: { select: { status: true } },
      extractionJob: { select: { filePath: true, fileName: true } },
    },
  });

  if (!poster || !poster.posterMetadata) {
    return fail("Poster or metadata not found");
  }

  if (poster.status === "published") {
    return fail("This poster is already published.");
  }

  if (poster.zenodoDepositions?.status === "published") {
    return fail(
      "This poster is published on Zenodo. Publish new versions of it to Zenodo.",
    );
  }

  // Versions go to the item the family is on.
  let familyArticleId: number | undefined;

  if (poster.versionRootId) {
    const earlier = await prisma.poster.findMany({
      where: {
        status: "published",
        versionSequence: { lt: poster.versionSequence },
        ...posterFamilyWhere(poster.versionRootId),
      },
      orderBy: { versionSequence: "desc" },
      select: {
        figshareDeposition: { select: { articleId: true } },
        zenodoDepositions: { select: { depositionId: true } },
      },
    });
    const latest = earlier[0];

    if (latest?.zenodoDepositions && !latest.figshareDeposition) {
      return fail(
        "Earlier versions of this poster are on Zenodo, so this version has to go to Zenodo too.",
      );
    }

    familyArticleId = latest?.figshareDeposition?.articleId;
  }

  let account: FigshareAccount;
  let licenses;

  try {
    account = await client.account();
    licenses = await client.licenses();
  } catch (error) {
    if (error instanceof FigshareApiError && error.isTokenRejection) {
      await prisma.figshareToken.deleteMany({ where: { userId } });

      return fail(
        "Figshare no longer accepts your connection. Connect your Figshare account again.",
      );
    }

    return fail(errorText(error));
  }

  const license = licenses.find((entry) => entry.value === licenseId);

  if (!license) {
    return fail("Choose one of the licenses your Figshare account offers.");
  }

  const spdxLicense =
    spdxForFigshareLicense(license) ??
    (matchFigshareLicense(poster.posterMetadata.license, [license])
      ? (poster.posterMetadata.license ?? undefined)
      : undefined);

  // A publish that Figshare finished but this app did not record: finish it
  // here without touching Figshare again.
  const linked = poster.figshareDeposition;

  if (linked && (linked.status === "published" || linked.status === "review")) {
    let article: FigsharePrivateArticle | null;

    try {
      article = await client.getArticle(linked.articleId);
    } catch (error) {
      return fail(errorText(error));
    }

    if (!article) {
      return fail(
        `Figshare item ${linked.articleId} could not be found on your account. It may belong to another Figshare account.`,
      );
    }

    if (isPublic(article)) {
      return finishLocally(poster, userId, article, spdxLicense);
    }

    if (linked.status === "review") {
      return {
        success: true,
        data: {
          articleId: article.id,
          underReview: true,
          ...(versionedDoi(article) && { doi: versionedDoi(article) }),
        },
      };
    }
  }

  // Thumbnails come from the extraction service, before anything on Figshare.
  const thumbnail = await getOrCreateThumbnail(
    poster.id,
    poster.extractionJob?.filePath,
    poster.imageUrl,
  );

  if (!thumbnail.success) return fail(thumbnail.error);

  poster.imageUrl = thumbnail.imageUrl;

  if (!poster.extractionJob?.filePath) {
    return fail("Poster file not found for upload");
  }

  const meta = poster.posterMetadata;

  if (!poster.automated && !meta.version?.trim()) {
    meta.version = posterVersionLabel(poster.versionSequence);
  }

  if (spdxLicense) meta.license = spdxLicense;

  // Check the metadata before creating anything on Figshare.
  const draft = buildFigshareArticle(poster, meta, {
    categoryIds,
    licenseId,
    articleId: linked?.articleId ?? familyArticleId,
  });

  if (draft.missing.length > 0) {
    return fail(
      `Figshare needs a few more details: ${draft.missing.join(", ").toLowerCase()}. Edit the poster's metadata and try again.`,
    );
  }

  if (draft.dropped.length > 0) {
    console.log(
      `[Figshare] ${draft.dropped.length} related identifier(s) have no Figshare equivalent and stay in poster.json [poster ${poster.id}]`,
    );
  }

  // Which item: the one already linked to this poster, the family's item for a
  // new version, or a new one.
  let articleId: number;
  let createdHere = false;
  let publishAttempted = false;

  try {
    if (linked) {
      const existing = await client.getArticle(linked.articleId);

      // An earlier attempt published but crashed before recording it: a new
      // item that is public, or a family item past the version it started
      // from. Finish locally instead of publishing another version.
      const publishedEarlier =
        existing &&
        isPublic(existing) &&
        (linked.status === "draft-new" ||
          (linked.figshareVersion != null &&
            (existing.version ?? 0) > linked.figshareVersion));

      if (existing && publishedEarlier) {
        return finishLocally(poster, userId, existing, spdxLicense);
      }

      if (existing) {
        articleId = existing.id;
      } else if (linked.status === "draft-new") {
        await prisma.figshareDeposition.delete({ where: { posterId } });
        articleId = await client.createArticle(draft.payload);
        createdHere = true;
        await linkDeposition(poster.id, userId, articleId, "draft-new");
      } else {
        return fail(
          `Figshare item ${linked.articleId} could not be found on your account. It may belong to another Figshare account.`,
        );
      }
    } else if (familyArticleId) {
      const existing = await client.getArticle(familyArticleId);

      if (!existing) {
        return fail(
          `The Figshare item for earlier versions (${familyArticleId}) could not be found on this Figshare account. Connect the account that published it.`,
        );
      }

      articleId = existing.id;
      // The version it starts from, so a retry can tell whether this version
      // was already published.
      await linkDeposition(poster.id, userId, articleId, "draft", {
        version: existing.version ?? 0,
      });
    } else {
      articleId = await client.createArticle(draft.payload);
      createdHere = true;
      // Stored before anything else, so a retry continues this item.
      await linkDeposition(poster.id, userId, articleId, "draft-new");
    }
  } catch (error) {
    return fail(errorText(error));
  }

  console.log(`[Figshare] Working on item ${articleId} [poster ${poster.id}]`);

  const failAfterItem = async (
    error: string,
  ): Promise<FigsharePublicationResult> => {
    // A lost publish response: check before deciding anything.
    if (publishAttempted) {
      try {
        const article = await client.getArticle(articleId);

        if (article && isPublic(article)) {
          return finishLocally(poster, userId, article, spdxLicense);
        }
      } catch {
        // Unknown state: keep everything for a retry.
      }

      return fail(
        `${error} Figshare may still publish item ${articleId}, so it was kept. Try again to finish.`,
      );
    }

    // A new item that never got published is removed, as Zenodo drafts are.
    if (createdHere || linked?.status === "draft-new") {
      try {
        await client.deleteArticle(articleId);
        await prisma.figshareDeposition.deleteMany({
          where: { posterId: poster.id, articleId, status: "draft-new" },
        });
      } catch (cleanupError) {
        console.error(
          `[Figshare] Could not remove unpublished item ${articleId}: ${errorText(cleanupError)}`,
        );

        return fail(
          `${error} The private Figshare item ${articleId} was kept for a safe retry.`,
        );
      }
    }

    return fail(error);
  };

  await onProgress?.({
    step: "deposition",
    status: "completed",
    message: "Figshare item ready",
  });

  // Step 2: metadata
  await onProgress?.({
    step: "upload_metadata",
    status: "in_progress",
    message: "Sending metadata to Figshare...",
  });

  let reservedId: { doi?: string; handle?: string };

  try {
    const fundingReferences = Array.isArray(meta.fundingReferences)
      ? (meta.fundingReferences as DbFundingReference[])
      : [];
    const fundingList = fundingReferences.length
      ? await buildFundingList(client, fundingReferences)
      : [];
    const payload = {
      ...draft.payload,
      ...(fundingList.length > 0 && { funding_list: fundingList }),
    };

    // A created item already has this metadata unless funding was linked.
    if (!createdHere || fundingList.some((entry) => "id" in entry)) {
      await client.updateArticle(articleId, payload);
    }

    await setAuthors(client, articleId, draft.payload.authors, account);

    // Persist the license the user chose, so poster.json says the same.
    if (spdxLicense && spdxLicense !== poster.posterMetadata.license) {
      await prisma.posterMetadata.update({
        where: { posterId: poster.id },
        data: { license: spdxLicense },
      });
    }

    const article = await client.getArticle(articleId);

    reservedId = { doi: article?.doi || undefined, handle: article?.handle };

    if (!reservedId.doi && !reservedId.handle) {
      try {
        reservedId.doi = await client.reserveDoi(articleId);
      } catch (error) {
        // Some institutional portals mint Handles instead of DOIs.
        if (account.institution_id) {
          reservedId.handle = await client.reserveHandle(articleId);
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    await onProgress?.({
      step: "upload_metadata",
      status: "error",
      message: errorText(error),
    });

    return failAfterItem(errorText(error));
  }

  await onProgress?.({
    step: "upload_metadata",
    status: "completed",
    message: "Metadata sent",
  });

  // Step 3: files
  await onProgress?.({
    step: "upload_files",
    status: "in_progress",
    message: "Uploading poster files...",
  });

  try {
    // The private copy gets exactly the poster file and poster.json. Files
    // of an earlier public version stay with that version.
    for (const file of await client.files(articleId)) {
      await client.deleteFile(articleId, file.id);
    }

    const posterJson = buildPosterJson(meta, {
      title: poster.title,
      description: poster.description,
      repository: "figshare",
      ...(reservedId.doi && { depositDoi: reservedId.doi }),
      publishedAt: new Date(),
      includePublisher: true,
    });

    await client.uploadFile(
      articleId,
      "poster.json",
      new TextEncoder().encode(JSON.stringify(posterJson, null, 2)),
    );

    const fileBytes = await downloadPosterFile(poster.extractionJob.filePath);

    if (
      account.maximum_file_size &&
      fileBytes.byteLength > account.maximum_file_size
    ) {
      throw new Error(
        "The poster file is larger than your Figshare account allows.",
      );
    }

    await client.uploadFile(
      articleId,
      safeFileName(poster.extractionJob.fileName || "poster.pdf"),
      fileBytes,
    );
  } catch (error) {
    return failAfterItem(errorText(error));
  }

  await onProgress?.({
    step: "upload_files",
    status: "completed",
    message: "Files uploaded",
  });

  // Outside production the run ends here: the item stays a private draft with
  // its metadata and files, and the poster stays unpublished. A later run
  // updates the same draft.
  if (isFigshareDraftOnly()) {
    let draftItem: FigsharePrivateArticle | null = null;

    try {
      draftItem = await client.getArticle(articleId);
    } catch {
      // Only the link is missing; the draft itself is complete.
    }

    await onProgress?.({
      step: "publish",
      status: "skipped",
      message: "Not published: this site only creates private drafts",
    });

    console.log(
      `[Figshare] Draft-only site: item ${articleId} left as a private draft [poster ${poster.id}]`,
    );

    return {
      success: true,
      data: {
        articleId,
        draftOnly: true,
        ...(reservedId.doi && { doi: reservedId.doi }),
        ...(draftItem?.url_private_html && {
          privateUrl: draftItem.url_private_html,
        }),
      },
    };
  }

  // Step 4: publish
  await onProgress?.({
    step: "publish",
    status: "in_progress",
    message: "Publishing on Figshare...",
  });

  let article: FigsharePrivateArticle | null;

  try {
    publishAttempted = true;
    await client.publish(articleId);
    article = await client.getArticle(articleId);
  } catch (error) {
    return failAfterItem(errorText(error));
  }

  if (!article) {
    return failAfterItem("Figshare did not return the published item.");
  }

  if (!isPublic(article)) {
    // An institution's curation review holds the item. Recorded so the next
    // attempt checks it instead of publishing again.
    const doi = versionedDoi(article);

    await linkDeposition(poster.id, userId, articleId, "review", {
      ...(doi && { doi }),
      ...(article.version && { version: article.version }),
    });

    return {
      success: true,
      data: {
        articleId,
        underReview: true,
        ...(doi && { doi }),
      },
    };
  }

  return finishLocally(poster, userId, article, spdxLicense);
}
