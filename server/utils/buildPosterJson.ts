import type { PosterMetadata } from "@prisma/client";

/**
 * Transforms PosterMetadata from the database into
 * the poster_schema.json structure for Zenodo upload.
 */
export function buildPosterJson(meta: PosterMetadata) {
  // Parse DOI into prefix/suffix
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

  // publisher is stored as array in DB, schema expects single object
  const publisherArray = meta.publisher as Record<string, unknown>[];
  const publisher = publisherArray?.[0] ?? undefined;

  // types is stored as array in DB, schema expects single object
  const typesArray = meta.types as Record<string, unknown>[];
  const types = typesArray?.[0] ?? undefined;

  // Assemble conference object from flat DB columns
  const conference = buildConference(meta);

  // posterContent is stored as sections array in DB, schema expects { sections: [...] }
  const posterContentRaw = meta.posterContent;
  const posterContent = Array.isArray(posterContentRaw)
    ? { sections: posterContentRaw }
    : posterContentRaw;

  // ethicsApproval in DB → ethicsApprovals in schema
  const ethicsApprovals = meta.ethicsApproval as unknown[];

  const posterJson: Record<string, unknown> = {
    ...(doi && { doi }),
    ...(prefix && { prefix }),
    ...(suffix && { suffix }),
    identifiers: meta.identifiers,
    ...(hasItems(meta.alternateIdentifiers) && {
      alternateIdentifiers: meta.alternateIdentifiers,
    }),
    creators: meta.creators,
    titles: meta.titles,
    ...(publisher && { publisher }),
    ...(meta.publicationYear && { publicationYear: meta.publicationYear }),
    subjects: meta.subjects,
    dates: meta.dates,
    ...(meta.language && { language: meta.language }),
    ...(types && { types }),
    ...(hasItems(meta.relatedIdentifiers) && {
      relatedIdentifiers: meta.relatedIdentifiers,
    }),
    ...(meta.sizes.length > 0 && { sizes: meta.sizes }),
    formats: meta.formats,
    ...(meta.version && { version: meta.version }),
    rightsList: meta.rightsList,
    descriptions: meta.descriptions,
    fundingReferences: meta.fundingReferences,
    ...(hasItems(ethicsApprovals) && { ethicsApprovals }),
    ...(conference && { conference }),
    ...(posterContent && { content: posterContent }),
    ...(hasItems(meta.tableCaption) && { tableCaptions: meta.tableCaption }),
    ...(hasItems(meta.imageCaption) && { imageCaptions: meta.imageCaption }),
    ...(meta.domain && { researchField: meta.domain }),
  };

  return stripEmptyStrings(posterJson) as Record<string, unknown>;
}

/**
 * Recursively removes properties with empty string values from objects
 * and arrays. The poster schema enforces minLength: 1 on optional string
 * fields, so empty strings must be omitted entirely.
 */
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
): Record<string, string> | undefined {
  const fields: Record<string, string | null> = {
    conferenceName: meta.conferenceName,
    conferenceLocation: meta.conferenceLocation,
    conferenceUri: meta.conferenceUri,
    conferenceIdentifier: meta.conferenceIdentifier,
    conferenceIdentifierType: meta.conferenceIdentifierType,
    conferenceSchemaUri: meta.conferenceSchemaUri,
    conferenceStartDate: meta.conferenceStartDate,
    conferenceEndDate: meta.conferenceEndDate,
    conferenceAcronym: meta.conferenceAcronym,
    conferenceSeries: meta.conferenceSeries,
  };

  const conference: Record<string, string> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value) {
      conference[key] = value;
    }
  }

  return Object.keys(conference).length > 0 ? conference : undefined;
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}
