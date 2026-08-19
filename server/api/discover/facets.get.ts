import iso6391 from "../../../shared/data/iso-639-1.json";
import {
  canonicalizeOrg,
  isFunderExcluded,
  isInstitutionExcluded,
  isLicenseNoise,
  normalizeInstitution,
  normalizeLicense,
} from "../../utils/canonicalize";

// Returns all dropdown options that power the search-page filters.
// Values match the same canonicalization used by /metrics so the dropdown
// labels line up with the chart buckets users see there.
//
// Cached for 5 minutes via Cache-Control; the underlying data only changes
// when new posters publish, so freshness lag is acceptable for filter lists.

const languageNames = new Map(iso6391.map((l) => [l.code, l.name]));

const INSTITUTION_LIMIT = 500;
const FUNDER_LIMIT = 500;

type FacetOption = {
  value: string;
  label: string;
  count: number;
};

type YearFacetOption = {
  value: number;
  label: string;
  count: number;
};

type FacetsResponse = {
  languages: FacetOption[];
  licenses: FacetOption[];
  publicationYears: YearFacetOption[];
  institutions: FacetOption[];
  funders: FacetOption[];
};

export default defineEventHandler(async (event): Promise<FacetsResponse> => {
  const currentYear = new Date().getFullYear();

  const [
    languageRows,
    licenseRows,
    publicationYearRows,
    institutionRows,
    funderRows,
  ] = await Promise.all([
    prisma.posterMetadata.groupBy({
      by: ["language"],
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        language: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { language: "desc" } },
    }),

    prisma.posterMetadata.groupBy({
      by: ["license"],
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        license: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { license: "desc" } },
    }),

    prisma.posterMetadata.groupBy({
      by: ["publicationYear"],
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        publicationYear: { not: null, gte: 2000, lte: currentYear },
      },
      _count: { _all: true },
      orderBy: { publicationYear: "desc" },
    }),

    prisma.$queryRaw<Array<{ institution: string; poster_count: number }>>`
      SELECT institution, poster_count FROM (
        SELECT
          CASE
            WHEN jsonb_typeof(aff) = 'object' THEN aff->>'name'
            WHEN jsonb_typeof(aff) = 'string' THEN aff#>>'{}'
          END AS institution,
          COUNT(DISTINCT p.id)::int AS poster_count
        FROM "PosterMetadata" pm
        JOIN "Poster" p ON pm."posterId" = p.id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN pm.creators IS NOT NULL AND jsonb_typeof(pm.creators) = 'array'
               THEN pm.creators ELSE '[]'::jsonb END
        ) AS creator
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(creator->'affiliation') = 'array'
               THEN creator->'affiliation' ELSE '[]'::jsonb END
        ) AS aff
        WHERE p.status = 'published'
          AND p.tombstone = false
          AND p."isLatestVersion" = true
        GROUP BY institution
      ) sub
      WHERE institution IS NOT NULL AND institution != ''
        AND trim(institution) !~ '^[0-9]+$'
        AND lower(trim(institution)) NOT IN (
          'institution name', 'null', 'unknown', 'none', 'n/a',
          'not specified', 'notspecified'
        )
      ORDER BY poster_count DESC
      LIMIT ${INSTITUTION_LIMIT}
    `,

    prisma.$queryRaw<Array<{ poster_id: number; funder: string }>>`
      SELECT DISTINCT p.id AS poster_id, fr->>'funderName' AS funder
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN pm."fundingReferences" IS NOT NULL
              AND jsonb_typeof(pm."fundingReferences") = 'array'
             THEN pm."fundingReferences" ELSE '[]'::jsonb END
      ) AS fr
      WHERE p.status = 'published'
        AND p.tombstone = false
        AND p."isLatestVersion" = true
        AND fr->>'funderName' IS NOT NULL
        AND fr->>'funderName' <> ''
    `,
  ]);

  // Languages: keep the ISO code as the filter value, show the human name.
  const languages: FacetOption[] = languageRows
    .filter((r) => r.language && r.language.trim() !== "")
    .map((r) => {
      const code = r.language!;
      const name = languageNames.get(code.toLowerCase()) ?? code;

      return { value: code, label: name, count: r._count._all };
    });

  // Licenses: normalize, drop "other-*" / placeholder strings and prose-as-
  // license values (grant text, citations, URLs), then merge variants.
  const licenseMap = new Map<string, number>();
  for (const r of licenseRows) {
    if (!r.license) continue;
    const canonical = normalizeLicense(r.license);
    if (isLicenseNoise(canonical)) continue;
    licenseMap.set(canonical, (licenseMap.get(canonical) ?? 0) + r._count._all);
  }
  const licenses: FacetOption[] = [...licenseMap.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count);

  // Publication years: simple scalar list.
  const publicationYears: YearFacetOption[] = publicationYearRows
    .filter((r) => r.publicationYear != null)
    .map((r) => ({
      value: r.publicationYear!,
      label: String(r.publicationYear),
      count: r._count._all,
    }));

  // Institutions: dedupe by lower(trim()), pick highest-count variant as display.
  const institutionMap = new Map<
    string,
    { displayName: string; count: number }
  >();
  for (const r of institutionRows) {
    if (!r.institution || isInstitutionExcluded(r.institution)) continue;
    const key = normalizeInstitution(r.institution);
    const existing = institutionMap.get(key);
    if (existing) {
      if (r.poster_count > existing.count) {
        existing.displayName = r.institution.trim();
      }
      existing.count += r.poster_count;
    } else {
      institutionMap.set(key, {
        displayName: r.institution.trim(),
        count: r.poster_count,
      });
    }
  }
  const institutions: FacetOption[] = [...institutionMap.entries()]
    .map(([value, { displayName, count }]) => ({
      value,
      label: displayName,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Funders: canonicalize and count distinct posters per canonical name.
  // Placeholder funder names ("FUNDER", "not specified", etc.) are dropped
  // before canonicalization so they don't get rolled into a real org.
  const funderPosters = new Map<string, Set<number>>();
  for (const r of funderRows) {
    if (isFunderExcluded(r.funder)) continue;
    const canonical = canonicalizeOrg(r.funder, true);
    if (!canonical) continue;
    let set = funderPosters.get(canonical);
    if (!set) {
      set = new Set();
      funderPosters.set(canonical, set);
    }
    set.add(r.poster_id);
  }
  const funders: FacetOption[] = [...funderPosters.entries()]
    .map(([value, set]) => ({ value, label: value, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, FUNDER_LIMIT);

  event.node.res.setHeader(
    "Cache-Control",
    "public, max-age=300, stale-while-revalidate=600",
  );

  return {
    languages,
    licenses,
    publicationYears,
    institutions,
    funders,
  };
});
