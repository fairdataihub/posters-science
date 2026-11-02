import { resolveDoiUrl } from "#shared/utils/doi";
import { zenodoRecordWebUrl } from "#shared/utils/zenodoRecordWebUrl";

/** Public Zenodo landing page for a poster linked via our Zenodo integration. */
export function zenodoRecordUrlForPoster(
  poster: {
    status: string;
    zenodoDepositions: {
      depositionId: number;
      status: string;
      lastPublishedZenodoDoi: string | null;
    } | null;
  },
  zenodoWebBase: string,
): string | undefined {
  const deposition = poster.zenodoDepositions;
  if (!deposition) return undefined;

  const doi = deposition.lastPublishedZenodoDoi?.trim();
  if (doi) {
    return resolveDoiUrl(doi);
  }

  if (
    (poster.status === "published" || deposition.status === "published") &&
    deposition.depositionId
  ) {
    return zenodoRecordWebUrl(deposition.depositionId, zenodoWebBase);
  }

  return undefined;
}
