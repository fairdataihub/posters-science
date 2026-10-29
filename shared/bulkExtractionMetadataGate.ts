/**
 * Strip bulk-extracted poster fields that exceed the batch extraction level.
 * Uses the same rules as workbook prefill (shared/bulkReviewWorkbookPrefill.ts).
 */
import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import {
  bulkReviewShouldPersistExtractedField,
  bulkReviewShouldPersistPosterCaption,
  getBulkReviewWorkbookPrefillPolicy,
} from "#shared/bulkReviewWorkbookPrefill";

type JsonRecord = Record<string, unknown>;

export type BulkExtractionGatedPosterSnapshot = {
  title: string;
  description: string;
  subjects: string[];
  language: string | null;
  domain: string | null;
  version: string | null;
  doi: string | null;
  publisher: string | null;
  publicationYear: number | null;
  creators: unknown;
  fundingReferences: unknown;
  relatedIdentifiers: unknown;
  posterContent: unknown;
  imageCaptions: unknown;
  tableCaptions: unknown;
  dates: unknown;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function cellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function isPostersScienceDiscoverUrl(relatedIdentifier: string) {
  try {
    const url = new URL(relatedIdentifier);
    return (
      (url.hostname === "posters.science" ||
        url.hostname === "sandbox.posters.science") &&
      url.pathname.startsWith("/discover/")
    );
  } catch {
    return false;
  }
}

function gateRelatedIdentifiers(
  raw: unknown,
  extractionMethod: BulkSubmissionExtractionMethod,
) {
  const policy = getBulkReviewWorkbookPrefillPolicy(extractionMethod);
  const entries = asArray(raw) as JsonRecord[];

  if (policy.includeLinksAndFunding) {
    return entries;
  }

  return entries.filter((entry) => {
    const id = cellString(entry.relatedIdentifier);
    if (!id) return false;
    return isPostersScienceDiscoverUrl(id);
  });
}

function gateFundingReferences(
  raw: unknown,
  extractionMethod: BulkSubmissionExtractionMethod,
) {
  const policy = getBulkReviewWorkbookPrefillPolicy(extractionMethod);
  if (policy.includeLinksAndFunding) {
    return asArray(raw);
  }
  return [];
}

function gateAffiliationEntry(
  aff: unknown,
  extractionMethod: BulkSubmissionExtractionMethod,
) {
  if (typeof aff === "string") {
    return bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "affiliation_name",
    )
      ? aff
      : "";
  }

  const record = asRecord(aff);
  if (!record) return aff;

  const name = cellString(record.name);
  const identifier = cellString(record.affiliationIdentifier);
  return {
    ...record,
    name: bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "affiliation_name",
    )
      ? name
      : "",
    affiliationIdentifier: bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "affiliation_identifier",
    )
      ? identifier
      : "",
  };
}

function gateCreators(raw: unknown, extractionMethod: BulkSubmissionExtractionMethod) {
  const creators = asArray(raw) as JsonRecord[];

  return creators.map((creator) => {
    const givenName = cellString(creator.givenName);
    const familyName = cellString(creator.familyName);
    const nameType = cellString(creator.nameType) || "Personal";
    const name = cellString(creator.name);

    const nextGiven = bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "given_name",
    )
      ? givenName
      : "";
    const nextFamily = bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "family_name",
    )
      ? familyName
      : "";
    const nextNameType = bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "name_type",
    )
      ? nameType
      : "Personal";

    let nextName = name;
    if (!bulkReviewShouldPersistExtractedField(extractionMethod, "given_name")) {
      nextName = "";
    } else if (name && !nextGiven && !nextFamily) {
      nextName = name;
    } else if (nextGiven || nextFamily) {
      nextName = [nextGiven, nextFamily].filter(Boolean).join(", ");
    }

    const nameIdentifiers = bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "name_identifier",
    )
      ? asArray(creator.nameIdentifiers)
      : [];

    const affiliationRaw = asArray(creator.affiliation);
    const affiliation = affiliationRaw
      .map((aff) => gateAffiliationEntry(aff, extractionMethod))
      .filter((aff) => {
        if (typeof aff === "string") return aff.trim().length > 0;
        const record = asRecord(aff);
        return Boolean(record && cellString(record.name).trim());
      });

    return {
      ...creator,
      givenName: nextGiven,
      familyName: nextFamily,
      nameType: nextNameType,
      name: nextName,
      nameIdentifiers,
      affiliation,
    };
  });
}

function normalizePosterContent(raw: unknown) {
  if (Array.isArray(raw)) {
    return { sections: raw, unstructuredContent: "", submissionAbstract: "" };
  }
  const record = asRecord(raw);
  return {
    sections: asArray(record?.sections),
    unstructuredContent: cellString(record?.unstructuredContent),
    submissionAbstract: cellString(record?.submissionAbstract),
  };
}

function gatePosterContent(
  raw: unknown,
  extractionMethod: BulkSubmissionExtractionMethod,
) {
  const policy = getBulkReviewWorkbookPrefillPolicy(extractionMethod);
  const content = normalizePosterContent(raw);

  const submissionAbstract = bulkReviewShouldPersistExtractedField(
    extractionMethod,
    "submission_abstract",
  )
    ? content.submissionAbstract
    : "";

  const sections = policy.posterContentKinds.includes("section")
    ? (asArray(content.sections) as JsonRecord[]).map((section) => ({
        ...section,
        sectionTitle: bulkReviewShouldPersistExtractedField(
          extractionMethod,
          "title",
          { contentKind: "section" },
        )
          ? cellString(section.sectionTitle)
          : "",
        sectionContent: bulkReviewShouldPersistExtractedField(
          extractionMethod,
          "body",
          { contentKind: "section" },
        )
          ? cellString(section.sectionContent)
          : "",
      }))
    : [];

  const unstructuredContent = bulkReviewShouldPersistExtractedField(
    extractionMethod,
    "body",
    { contentKind: "section" },
  )
    ? content.unstructuredContent
    : "";

  return {
    sections,
    unstructuredContent,
    submissionAbstract,
  };
}

function gateCaptionArray(
  raw: unknown,
  extractionMethod: BulkSubmissionExtractionMethod,
  contentKind: "figure" | "table",
) {
  if (!bulkReviewShouldPersistPosterCaption(extractionMethod, contentKind)) {
    return [];
  }

  return (asArray(raw) as JsonRecord[]).map((entry) => ({
    ...entry,
    caption: cellString(entry.caption),
    id: bulkReviewShouldPersistExtractedField(extractionMethod, "item_id", {
      contentKind,
    })
      ? cellString(entry.id)
      : "",
  }));
}

function gateDates(raw: unknown, extractionMethod: BulkSubmissionExtractionMethod) {
  if (
    bulkReviewShouldPersistExtractedField(extractionMethod, "presented_date")
  ) {
    return asArray(raw);
  }

  return (asArray(raw) as JsonRecord[]).filter(
    (entry) => cellString(entry.dateType) !== "Presented",
  );
}

/** Returns a gated copy; `full` extraction returns the input unchanged. */
export function gateBulkExtractedPosterSnapshot(
  extractionMethod: BulkSubmissionExtractionMethod,
  snapshot: BulkExtractionGatedPosterSnapshot,
): BulkExtractionGatedPosterSnapshot {
  if (extractionMethod === "full") {
    return snapshot;
  }

  return {
    ...snapshot,
    title: bulkReviewShouldPersistExtractedField(extractionMethod, "title")
      ? snapshot.title
      : "",
    description: bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "description",
    )
      ? snapshot.description
      : "",
    subjects: bulkReviewShouldPersistExtractedField(extractionMethod, "keywords")
      ? snapshot.subjects
      : [],
    language: bulkReviewShouldPersistExtractedField(extractionMethod, "language")
      ? snapshot.language
      : null,
    domain: bulkReviewShouldPersistExtractedField(extractionMethod, "domain")
      ? snapshot.domain
      : null,
    version: bulkReviewShouldPersistExtractedField(extractionMethod, "version")
      ? snapshot.version
      : null,
    doi: bulkReviewShouldPersistExtractedField(extractionMethod, "doi")
      ? snapshot.doi
      : null,
    publisher: bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "publisher",
    )
      ? snapshot.publisher
      : null,
    publicationYear: bulkReviewShouldPersistExtractedField(
      extractionMethod,
      "publication_year",
    )
      ? snapshot.publicationYear
      : null,
    creators: gateCreators(snapshot.creators, extractionMethod),
    fundingReferences: gateFundingReferences(
      snapshot.fundingReferences,
      extractionMethod,
    ),
    relatedIdentifiers: gateRelatedIdentifiers(
      snapshot.relatedIdentifiers,
      extractionMethod,
    ),
    posterContent: gatePosterContent(snapshot.posterContent, extractionMethod),
    imageCaptions: gateCaptionArray(
      snapshot.imageCaptions,
      extractionMethod,
      "figure",
    ),
    tableCaptions: gateCaptionArray(
      snapshot.tableCaptions,
      extractionMethod,
      "table",
    ),
    dates: gateDates(snapshot.dates, extractionMethod),
  };
}
