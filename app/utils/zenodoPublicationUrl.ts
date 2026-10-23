type ZenodoDepositionLike = {
  depositionId?: number;
  status?: string;
  lastPublishedZenodoDoi?: string | null;
};

type PosterZenodoSource = {
  status?: string;
  zenodoDepositions?: ZenodoDepositionLike | null;
};

function doiToUrl(doi: string): string {
  const trimmed = doi.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const bare = trimmed.replace(/^doi:\s*/i, "");
  return `https://doi.org/${bare}`;
}

/** Public Zenodo record page for a poster that has been published via Zenodo. */
export function zenodoPublicationUrlForPoster(
  poster: PosterZenodoSource,
  zenodoWebBase = "https://zenodo.org",
): string | undefined {
  const deposition = poster.zenodoDepositions;
  if (!deposition) return undefined;

  const publishedDoi = deposition.lastPublishedZenodoDoi?.trim();
  if (publishedDoi) {
    return doiToUrl(publishedDoi);
  }

  const isPublished =
    poster.status === "published" || deposition.status === "published";

  if (isPublished && deposition.depositionId) {
    const base = zenodoWebBase.replace(/\/$/, "");
    return `${base}/records/${deposition.depositionId}`;
  }

  return undefined;
}

export function zenodoPublicationDoiForPoster(
  poster: PosterZenodoSource,
): string | undefined {
  const raw = poster.zenodoDepositions?.lastPublishedZenodoDoi?.trim();
  if (!raw) return undefined;
  return raw.replace(/^https?:\/\/doi\.org\//i, "").replace(/^doi:\s*/i, "");
}
