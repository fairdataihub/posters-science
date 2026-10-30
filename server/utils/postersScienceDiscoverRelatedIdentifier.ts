import {
  normalizeVersionRelatedIdentifiers,
  posterFamilyRootId,
  posterFamilyWhere,
  posterVersionLabel,
} from "~~/server/utils/posterVersions";
import prisma from "~~/server/utils/prisma";

export function postersScienceSiteBaseUrl(siteEnv?: string | null): string {
  return siteEnv === "staging"
    ? "https://sandbox.posters.science"
    : "https://posters.science";
}

export function postersScienceDiscoverUrl(
  rootPosterId: number,
  siteEnv?: string | null,
): string {
  return `${postersScienceSiteBaseUrl(siteEnv)}/discover/${rootPosterId}`;
}

export type PostersScienceDiscoverRelatedEntry = {
  relatedIdentifier: string;
  relatedIdentifierType: "URL";
  relationType: "IsDescribedBy";
};

export function postersScienceDiscoverRelatedEntry(
  rootPosterId: number,
  siteEnv?: string | null,
): PostersScienceDiscoverRelatedEntry {
  return {
    relatedIdentifier: postersScienceDiscoverUrl(rootPosterId, siteEnv),
    relatedIdentifierType: "URL",
    relationType: "IsDescribedBy",
  };
}

type RelatedIdentifierRow = {
  relatedIdentifier?: string;
  relatedIdentifierType?: string;
  relationType?: string;
  resourceTypeGeneral?: string;
};

/**
 * Adds the canonical Posters.science discover URL to relatedIdentifiers once
 * extraction is done (same behavior as the single-poster job poll). If the user
 * removes it via PUT, this does not re-add unless called again explicitly.
 */
export async function ensurePostersScienceDiscoverRelatedIdentifier(
  posterId: number,
  options?: { siteEnv?: string | null },
): Promise<{ updated: boolean; discoverUrl: string }> {
  const versionPoster = await prisma.poster.findUnique({
    where: { id: posterId },
    select: { id: true, versionRootId: true, versionSequence: true },
  });

  if (!versionPoster) {
    return { updated: false, discoverUrl: "" };
  }

  const rootPosterId = posterFamilyRootId(versionPoster);
  const discoverUrl = postersScienceDiscoverUrl(rootPosterId, options?.siteEnv);

  const previousVersion = versionPoster.versionRootId
    ? await prisma.poster.findFirst({
        where: {
          status: "published",
          versionSequence: { lt: versionPoster.versionSequence },
          ...posterFamilyWhere(rootPosterId),
        },
        orderBy: { versionSequence: "desc" },
        select: { posterMetadata: { select: { doi: true } } },
      })
    : null;

  const meta = await prisma.posterMetadata.findUnique({
    where: { posterId },
    select: { relatedIdentifiers: true, version: true },
  });

  if (!meta) {
    return { updated: false, discoverUrl };
  }

  const existing = Array.isArray(meta.relatedIdentifiers)
    ? (meta.relatedIdentifiers as RelatedIdentifierRow[])
    : [];

  const alreadyPresent = existing.some(
    (r) => r.relatedIdentifier === discoverUrl,
  );

  const previousDoi = previousVersion?.posterMetadata?.doi;
  const { relatedIdentifiers, changed: versionRelationsChanged } =
    normalizeVersionRelatedIdentifiers(existing, previousDoi);

  const assignedVersion = versionPoster.versionRootId
    ? posterVersionLabel(versionPoster.versionSequence)
    : null;

  if (!alreadyPresent) {
    relatedIdentifiers.push(postersScienceDiscoverRelatedEntry(rootPosterId, options?.siteEnv));
  }

  const shouldUpdate =
    !alreadyPresent ||
    versionRelationsChanged ||
    (assignedVersion != null && meta.version !== assignedVersion);

  if (!shouldUpdate) {
    return { updated: false, discoverUrl };
  }

  await prisma.posterMetadata.update({
    where: { posterId },
    data: {
      relatedIdentifiers: relatedIdentifiers as never,
      ...(assignedVersion && { version: assignedVersion }),
    },
  });

  return { updated: true, discoverUrl };
}
