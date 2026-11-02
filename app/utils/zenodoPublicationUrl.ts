import { resolveDoiUrl } from "#shared/utils/doi";

type ZenodoDepositionLike = {
  depositionId?: number;
  status?: string;
  lastPublishedZenodoDoi?: string | null;
};

type PosterZenodoSource = {
  status?: string;
  /** Set by GET /api/poster/:id using server `zenodoEndpoint`. */
  zenodoRecordUrl?: string | null;
  zenodoDepositions?: ZenodoDepositionLike | null;
};

/** Public Zenodo record page for a poster that has been published via Zenodo. */
export function zenodoPublicationUrlForPoster(
  poster: PosterZenodoSource,
): string | undefined {
  const fromApi = poster.zenodoRecordUrl?.trim();
  if (fromApi) return fromApi;

  const publishedDoi = poster.zenodoDepositions?.lastPublishedZenodoDoi?.trim();
  if (publishedDoi) {
    return resolveDoiUrl(publishedDoi);
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
