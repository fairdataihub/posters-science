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

  const rawSections = posterContentObj?.sections ?? [];
  const filteredSections = Array.isArray(rawSections)
    ? rawSections.filter((s: unknown) => {
        if (typeof s !== "object" || s === null) return false;
        const { sectionTitle, sectionContent } = s as Record<string, unknown>;

        return (
          typeof sectionTitle === "string" &&
          sectionTitle !== "" &&
          typeof sectionContent === "string" &&
          sectionContent !== ""
        );
      })
    : [];

  const contentSections =
    filteredSections.length > 0 ? filteredSections : undefined;
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

  const fundingRefs = Array.isArray(meta.fundingReferences)
    ? (meta.fundingReferences as unknown[]).filter(
        (f): f is Record<string, unknown> => {
          if (typeof f !== "object" || f === null) return false;
          const name = (f as Record<string, unknown>).funderName;

          return typeof name === "string" && name !== "";
        },
      )
    : [];

  const validIdentifiers = filterIdentifiers(meta.identifiers);
  const validRelatedIdentifiers = filterRelatedIdentifiers(
    meta.relatedIdentifiers,
  );
  const validTableCaptions = filterCaptions(meta.tableCaptions);
  const validImageCaptions = filterCaptions(meta.imageCaptions);

  const posterJson: Record<string, unknown> = {
    ...(doi && { doi }),
    ...(prefix && { prefix }),
    ...(suffix && { suffix }),
    ...(titles && { titles }),
    ...(descriptions && { descriptions }),
    ...(validIdentifiers && { identifiers: validIdentifiers }),
    creators: cleanCreators(meta.creators),
    ...(publisher && { publisher }),
    ...(meta.publicationYear && { publicationYear: meta.publicationYear }),
    subjects: (meta.subjects ?? [])
      .filter((s) => s !== "")
      .map((s) => ({ subject: s })),
    ...(meta.language && { language: meta.language }),
    ...(validRelatedIdentifiers && {
      relatedIdentifiers: validRelatedIdentifiers,
    }),
    ...(meta.size && { sizes: [meta.size] }),
    formats: meta.format ? [meta.format] : ["PDF"],
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
    ...(fundingRefs.length > 0 && { fundingReferences: fundingRefs }),
    ...(conference && { conference }),
    ...(content && { content }),
    ...(validTableCaptions.length > 0 && { tableCaptions: validTableCaptions }),
    ...(validImageCaptions.length > 0 && { imageCaptions: validImageCaptions }),
    ...(meta.domain && { researchField: meta.domain }),
  };

  return stripEmptyStrings(posterJson) as Record<string, unknown>;
}

function stripEmptyStrings(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(stripEmptyStrings)
      .filter(
        (v) =>
          v !== "" &&
          v !== null &&
          !(
            typeof v === "object" &&
            v !== null &&
            Object.keys(v as object).length === 0
          ),
      );
  }

  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === "" || v === null) continue;
      const stripped = stripEmptyStrings(v);
      if (Array.isArray(stripped) && stripped.length === 0) continue;
      cleaned[k] = stripped;
    }

    return cleaned;
  }

  return value;
}

/**
 * Cleans creators array for schema compliance:
 * - Picks only schema-allowed fields from nameIdentifiers (removes nameIdentifierType)
 * - Filters nameIdentifiers with blank nameIdentifier
 * - Filters affiliation items with blank name or blank string
 */
function cleanCreators(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((creator) => {
    if (typeof creator !== "object" || creator === null) return creator;
    const c = creator as Record<string, unknown>;

    const nameIdentifiers = Array.isArray(c.nameIdentifiers)
      ? c.nameIdentifiers
          .filter((ni: unknown) => {
            if (typeof ni !== "object" || ni === null) return false;
            const v = (ni as Record<string, unknown>).nameIdentifier;

            return typeof v === "string" && v.trim() !== "";
          })
          .map((ni: unknown) => {
            const { nameIdentifier, nameIdentifierScheme, schemeURI } =
              ni as Record<string, unknown>;

            return { nameIdentifier, nameIdentifierScheme, schemeURI };
          })
      : undefined;

    const affiliation = Array.isArray(c.affiliation)
      ? c.affiliation.filter((aff: unknown) => {
          if (typeof aff === "string") return aff.trim() !== "";
          if (typeof aff === "object" && aff !== null) {
            const name = (aff as Record<string, unknown>).name;

            return typeof name === "string" && name.trim() !== "";
          }

          return false;
        })
      : undefined;

    const { nameIdentifiers: _ni, affiliation: _aff, ...rest } = c;
    void _ni;
    void _aff;

    return {
      ...rest,
      ...(nameIdentifiers && nameIdentifiers.length > 0 && { nameIdentifiers }),
      ...(affiliation && affiliation.length > 0 && { affiliation }),
    };
  });
}

/**
 * Filters identifiers array, removing items with blank identifier or identifierType.
 * Returns undefined if no valid items remain (so the key is omitted).
 */
function filterIdentifiers(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.filter((item) => {
    if (typeof item !== "object" || item === null) return false;
    const { identifier, identifierType } = item as Record<string, unknown>;

    return (
      typeof identifier === "string" &&
      identifier !== "" &&
      typeof identifierType === "string" &&
      identifierType !== ""
    );
  });

  return valid.length > 0 ? valid : undefined;
}

/**
 * Filters relatedIdentifiers array, removing items missing required fields.
 * Returns undefined if no valid items remain.
 */
function filterRelatedIdentifiers(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = raw.filter((item) => {
    if (typeof item !== "object" || item === null) return false;
    const { relatedIdentifier, relatedIdentifierType, relationType } =
      item as Record<string, unknown>;

    return (
      typeof relatedIdentifier === "string" &&
      relatedIdentifier !== "" &&
      typeof relatedIdentifierType === "string" &&
      relatedIdentifierType !== "" &&
      typeof relationType === "string" &&
      relationType !== ""
    );
  });

  return valid.length > 0 ? valid : undefined;
}

/**
 * Filters caption arrays (tableCaptions/imageCaptions), removing items with blank caption.
 */
function filterCaptions(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];

  return raw.filter((item) => {
    if (typeof item !== "object" || item === null) return false;
    const { caption } = item as Record<string, unknown>;

    return typeof caption === "string" && caption !== "";
  });
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
