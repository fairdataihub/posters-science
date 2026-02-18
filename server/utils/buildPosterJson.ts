import type { PosterMetadata } from "@prisma/client";

/**
 * Transforms PosterMetadata from the database into
 * the poster_schema.json structure for Zenodo upload.
 */
export function buildPosterJson(meta: PosterMetadata) {
  const doi = meta.doi ?? undefined;
  let prefix: string | undefined;
  let suffix: string | undefined;

  if (doi) {
    const slashIndex = doi.indexOf("/");

    if (slashIndex !== -1) {
      prefix = doi.substring(0, slashIndex);
      suffix = doi.substring(slashIndex + 1);
    }
  }

  const publisher =
    meta.publisher != null && meta.publisher !== ""
      ? { name: meta.publisher }
      : undefined;

  const conference = buildConference(meta);

  const posterContentRaw = meta.posterContent;
  const posterContent = Array.isArray(posterContentRaw)
    ? { sections: posterContentRaw }
    : posterContentRaw;

  const posterJson: Record<string, unknown> = {
    ...(doi && { doi }),
    ...(prefix && { prefix }),
    ...(suffix && { suffix }),
    identifiers: meta.identifiers,
    creators: meta.creators,
    ...(publisher && { publisher }),
    ...(meta.publicationYear && { publicationYear: meta.publicationYear }),
    subjects: meta.subjects,
    ...(meta.language && { language: meta.language }),
    ...(hasItems(meta.relatedIdentifiers) && {
      relatedIdentifiers: meta.relatedIdentifiers,
    }),
    ...(meta.size && { size: meta.size }),
    ...(meta.format && { format: meta.format }),
    ...(meta.version && { version: meta.version }),
    ...(meta.rightsIdentifier && { rightsIdentifier: meta.rightsIdentifier }),
    fundingReferences: meta.fundingReferences,
    ...(conference && { conference }),
    ...(posterContent && { content: posterContent }),
    ...(hasItems(meta.tableCaptions) && { tableCaptions: meta.tableCaptions }),
    ...(hasItems(meta.imageCaptions) && { imageCaptions: meta.imageCaptions }),
    ...(meta.domain && { researchField: meta.domain }),
  };

  return stripEmptyStrings(posterJson) as Record<string, unknown>;
}

function stripEmptyStrings(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripEmptyStrings);
  }

  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === "") continue;
      cleaned[k] = stripEmptyStrings(v);
    }

    return cleaned;
  }

  return value;
}

function buildConference(
  meta: PosterMetadata,
): Record<string, string | number> | undefined {
  const fields: Record<string, string | number | null> = {
    conferenceName: meta.conferenceName,
    conferenceLocation: meta.conferenceLocation,
    conferenceUri: meta.conferenceUri,
    conferenceIdentifier: meta.conferenceIdentifier,
    conferenceIdentifierType: meta.conferenceIdentifierType,
    conferenceYear: meta.conferenceYear,
    conferenceStartDate: meta.conferenceStartDate,
    conferenceEndDate: meta.conferenceEndDate,
    conferenceAcronym: meta.conferenceAcronym,
    conferenceSeries: meta.conferenceSeries,
  };

  const conference: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value != null && value !== "") {
      conference[key] = value;
    }
  }

  return Object.keys(conference).length > 0 ? conference : undefined;
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}
