import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import { isValidOrcidChecksum } from "#shared/utils/orcid";
import { findBulkSubmissionJobForPoster } from "~~/server/utils/bulkExtractionMetadataGate";
import prisma from "~~/server/utils/prisma";

type JsonRecord = Record<string, unknown>;

function cellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function quoteIfSpaced(value: string): string {
  return value.includes(" ") ? `"${value}"` : value;
}

function extractOrcidBare(identifier: string): string | null {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  const bare = trimmed.replace(/.*orcid\.org\//i, "").trim();
  if (!isValidOrcidChecksum(bare)) return null;
  return bare;
}

function hasValidOrcidIdentifier(nameIdentifiers: unknown): boolean {
  for (const entry of asArray(nameIdentifiers)) {
    const record = asRecord(entry);
    const id = cellString(record?.nameIdentifier);
    if (extractOrcidBare(id)) return true;
  }
  return false;
}

function hasRorAffiliationIdentifier(aff: JsonRecord): boolean {
  const id = cellString(aff.affiliationIdentifier).trim();
  if (!id) return false;
  return /ror\.org\//i.test(id) || /^0[0-9a-hj-km-np-tv-z]{6}[0-9]{2}$/i.test(
    id.replace(/.*ror\.org\//i, ""),
  );
}

function parseCreatorNames(creator: JsonRecord): {
  givenName: string;
  familyName: string;
} {
  const given = cellString(creator.givenName).trim();
  const family = cellString(creator.familyName).trim();
  if (given || family) {
    return {
      givenName: given || family,
      familyName: family || given,
    };
  }

  const combined = cellString(creator.name).trim();
  if (!combined) return { givenName: "", familyName: "" };

  if (combined.includes(",")) {
    const [familyPart, givenPart] = combined.split(",", 2);
    return {
      familyName: familyPart?.trim() ?? "",
      givenName: givenPart?.trim() ?? "",
    };
  }

  const parts = combined.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { givenName: parts[0]!, familyName: parts[0]! };
  }

  return {
    givenName: parts[0]!,
    familyName: parts.slice(1).join(" "),
  };
}

async function searchOrcidUrl(
  givenName: string,
  familyName: string,
  affiliation?: string,
): Promise<string | null> {
  if (!givenName.trim() || !familyName.trim()) return null;

  let q = `given-names:${quoteIfSpaced(givenName)} AND family-name:${quoteIfSpaced(familyName)}`;
  if (affiliation?.trim()) {
    q += ` AND affiliation-org-name:${quoteIfSpaced(affiliation.trim())}`;
  }

  try {
    const response = await $fetch<{
      "expanded-result"?: { "orcid-id": string }[] | null;
      "num-found"?: number;
    }>("https://pub.orcid.org/v3.0/expanded-search/", {
      query: { q, rows: 5, start: 0 },
      headers: { Accept: "application/json" },
    });

    const results = response["expanded-result"] ?? [];
    if (results.length === 0) return null;
    if (results.length === 1) {
      return `https://orcid.org/${results[0]!["orcid-id"]}`;
    }

    if (affiliation?.trim()) {
      return `https://orcid.org/${results[0]!["orcid-id"]}`;
    }

    return null;
  } catch {
    return null;
  }
}

async function searchRorUrl(orgName: string): Promise<string | null> {
  const query = orgName.trim();
  if (query.length < 2) return null;

  try {
    const response = await $fetch<{
      items?: { id: string; organization?: { names?: { value: string; types: string[] }[] }; names?: { value: string; types: string[] }[] }[];
    }>("https://api.ror.org/v2/organizations", {
      query: { query, simple: "true" },
    });

    const items = response.items ?? [];
    if (items.length === 0) return null;

    const normalizedQuery = query.toLowerCase();
    const pick = items.find((item) => {
      const org = item.organization ?? item;
      const displayName =
        org.names?.find((n) => n.types.includes("ror_display"))?.value ??
        org.names?.[0]?.value ??
        "";
      return displayName.toLowerCase() === normalizedQuery;
    });

    const chosen = pick ?? (items.length === 1 ? items[0] : null);
    if (!chosen?.id) return null;

    const id = chosen.id.startsWith("https://")
      ? chosen.id
      : `https://ror.org/${chosen.id.replace(/.*ror\.org\//i, "")}`;

    return id;
  } catch {
    return null;
  }
}

function emptyNameIdentifiers(): JsonRecord[] {
  return [];
}

function stripCreatorsOrcidRor(creators: JsonRecord[]): JsonRecord[] {
  return creators.map((creator) => {
    const nameType = cellString(creator.nameType) || "Personal";
    const affiliationRaw = asArray(creator.affiliation);
    const affiliation = affiliationRaw.map((aff) => {
      if (typeof aff === "string") return aff;
      const record = asRecord(aff);
      if (!record) return aff;
      return {
        ...record,
        affiliationIdentifier: "",
      };
    });

    return {
      ...creator,
      nameIdentifiers:
        nameType === "Personal" ? emptyNameIdentifiers() : emptyNameIdentifiers(),
      affiliation,
    };
  });
}

async function enrichCreatorsOrcidRor(
  creators: JsonRecord[],
): Promise<JsonRecord[]> {
  const next: JsonRecord[] = [];

  for (const creator of creators) {
    const nameType = cellString(creator.nameType) || "Personal";
    const { givenName, familyName } = parseCreatorNames(creator);
    let nameIdentifiers = asArray(creator.nameIdentifiers) as JsonRecord[];

    if (nameType === "Personal" && !hasValidOrcidIdentifier(nameIdentifiers)) {
      const affiliations = asArray(creator.affiliation)
        .map((aff) => (typeof aff === "string" ? aff : cellString(asRecord(aff)?.name)))
        .filter(Boolean);
      const orcidUrl = await searchOrcidUrl(
        givenName,
        familyName,
        affiliations[0],
      );
      if (orcidUrl) {
        nameIdentifiers = [
          {
            nameIdentifier: orcidUrl,
            nameIdentifierScheme: "ORCID",
            schemeURI: "https://orcid.org",
          },
        ];
      }
    }

    const affiliationRaw = asArray(creator.affiliation);
    const affiliation = await Promise.all(
      affiliationRaw.map(async (aff) => {
        if (typeof aff === "string") return aff;
        const record = asRecord(aff);
        if (!record) return aff;

        const name = cellString(record.name).trim();
        let affiliationIdentifier = cellString(record.affiliationIdentifier);

        if (!hasRorAffiliationIdentifier(record) && name) {
          const rorUrl = await searchRorUrl(name);
          if (rorUrl) {
            affiliationIdentifier = rorUrl;
          }
        }

        return {
          ...record,
          affiliationIdentifier,
        };
      }),
    );

    next.push({
      ...creator,
      nameIdentifiers,
      affiliation,
    });
  }

  return next;
}

async function loadAutomateOrcidRorLookups(
  userId: string,
  posterId: number,
): Promise<boolean | null> {
  const bulkJob = await findBulkSubmissionJobForPoster(userId, posterId);
  if (!bulkJob) return null;

  const job = await prisma.bulkSubmission.findFirst({
    where: { id: bulkJob.id, userId },
    select: { submissionSummary: true },
  });

  const summary = (job?.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  if (summary.automateOrcidRorLookups === true) return true;
  if (summary.automateOrcidRorLookups === false) return false;
  return false;
}

/**
 * Applies bulk ORCID/ROR automation after extraction: enrich when enabled,
 * strip extracted identifiers when disabled.
 */
export async function applyBulkOrcidRorAutomationForPoster(
  userId: string,
  posterId: number,
): Promise<boolean> {
  const automate = await loadAutomateOrcidRorLookups(userId, posterId);
  if (automate === null) return false;

  const poster = await prisma.poster.findFirst({
    where: { id: posterId, userId },
    include: { posterMetadata: true },
  });

  if (!poster?.posterMetadata) return false;

  const before = poster.posterMetadata.creators;
  const creatorsRaw = asArray(before) as JsonRecord[];
  if (creatorsRaw.length === 0) return false;

  const after = automate
    ? await enrichCreatorsOrcidRor(creatorsRaw)
    : stripCreatorsOrcidRor(creatorsRaw);

  if (JSON.stringify(before) === JSON.stringify(after)) return false;

  await prisma.posterMetadata.update({
    where: { posterId },
    data: { creators: after as never },
  });

  return true;
}
