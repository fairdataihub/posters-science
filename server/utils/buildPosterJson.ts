import type { PosterMetadata } from "@prisma/client";
import licenses from "../../app/assets/data/licenses.json";

/**
 * Transforms PosterMetadata from the database into
 * the poster_schema.json structure for Zenodo upload.
 */
export function buildPosterJson(
  meta: PosterMetadata,
  options?: { title?: string; description?: string },
) {
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

  const licenseEntry = meta.license
    ? (licenses.find((l) => l.licenseId === meta.license) ?? null)
    : null;

  const posterContentRaw = meta.posterContent;
  const posterContentObj = Array.isArray(posterContentRaw)
    ? { sections: posterContentRaw }
    : (posterContentRaw as {
        sections?: unknown[];
        unstructuredContent?: string;
      } | null);

  const contentSections =
    Array.isArray(posterContentObj?.sections) &&
    posterContentObj.sections.length > 0
      ? posterContentObj.sections
      : undefined;
  const unstructuredContent =
    posterContentObj?.unstructuredContent || undefined;
  const content =
    contentSections || unstructuredContent
      ? {
          ...(contentSections && { sections: contentSections }),
          ...(unstructuredContent && { unstructuredContent }),
        }
      : undefined;

  const titles = options?.title ? [{ title: options.title }] : undefined;
  const descriptions = options?.description
    ? [{ description: options.description, descriptionType: "Abstract" }]
    : undefined;

  const posterJson: Record<string, unknown> = {
    ...(doi && { doi }),
    ...(prefix && { prefix }),
    ...(suffix && { suffix }),
    ...(titles && { titles }),
    ...(descriptions && { descriptions }),
    ...(hasItems(meta.identifiers) && { identifiers: meta.identifiers }),
    creators: meta.creators,
    ...(publisher && { publisher }),
    ...(meta.publicationYear && { publicationYear: meta.publicationYear }),
    subjects: (meta.subjects ?? []).map((s) => ({ subject: s })),
    ...(meta.language && { language: meta.language }),
    ...(hasItems(meta.relatedIdentifiers) && {
      relatedIdentifiers: meta.relatedIdentifiers,
    }),
    ...(meta.size && { sizes: [meta.size] }),
    ...(meta.format && { formats: [meta.format] }),
    ...(meta.version && { version: meta.version }),
    ...(meta.license && {
      rightsList: [
        {
          rights: licenseEntry?.name ?? meta.license,
          rightsUri: licenseEntry?.seeAlso?.[0] ?? licenseEntry?.reference,
          rightsIdentifier: meta.license,
          rightsIdentifierScheme: "SPDX",
          schemeUri: "https://spdx.org/licenses/",
        },
      ],
    }),
    fundingReferences: meta.fundingReferences,
    ...(conference && { conference }),
    ...(content && { content }),
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
