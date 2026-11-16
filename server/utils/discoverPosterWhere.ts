import type { Prisma } from "#shared/generated/client";
import { parseDiscoverSearch } from "#shared/utils/discoverSearch";
import { escapeLike } from "#shared/utils/searchQuery";
import { canonicalizeOrg, normalizeLicense } from "./canonicalize";
import { buildDiscoverSearchFilter } from "./discoverSearch";

// Filters arrive as repeated query params (?institution=a&institution=b), so
// h3's getQuery yields a string (single value) or string[] (repeated). Each
// entry is one whole value: never split on commas, because institution and
// funder names legitimately contain them.
function parseList(value: unknown): string[] {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];

  return arr.map((s) => String(s).trim()).filter(Boolean);
}

/**
 * The poster filter behind /discover: the search box (prefixes and free text)
 * plus the sidebar filters, read from the same query params. Returns null when
 * nothing can match. Collection search uses it too, so a collection matches on
 * exactly the posters Discover would show.
 *
 * `markStep` records timings for the Server-Timing header.
 */
export async function buildDiscoverPosterWhere(
  query: Record<string, unknown>,
  markStep: (step: string) => void = () => {},
): Promise<Prisma.PosterWhereInput | null> {
  const {
    search,
    source,
    language,
    license,
    publicationYear,
    institution,
    funder,
  } = query;

  const searchFilter = await buildDiscoverSearchFilter(
    parseDiscoverSearch(typeof search === "string" ? search : ""),
  );
  if (searchFilter.ids?.length === 0) return null;
  markStep("search-filter");

  const validSources = ["zenodo", "figshare", "user_submitted"];
  const sourceValues = parseList(source)
    .map((s) => s.toLowerCase())
    .filter((s) => validSources.includes(s));

  const isFigshare = {
    OR: [
      {
        imageUrl: {
          contains: escapeLike("/figshare_"),
          mode: "insensitive" as const,
        },
      },
      {
        posterMetadata: {
          doi: { startsWith: "10.6084/", mode: "insensitive" as const },
        },
      },
    ],
  };

  const sourceConditions: Prisma.PosterWhereInput[] = [];
  if (sourceValues.includes("figshare")) sourceConditions.push(isFigshare);
  if (sourceValues.includes("zenodo"))
    sourceConditions.push({ automated: true, NOT: isFigshare });
  if (sourceValues.includes("user_submitted"))
    sourceConditions.push({ automated: false });

  const sourceFilter: Prisma.PosterWhereInput | null =
    sourceConditions.length > 0 ? { OR: sourceConditions } : null;
  markStep("source-filter");

  // ---- New metadata filters ------------------------------------------------
  // Scalar filters apply via posterMetadata.is.<field>.in. License and publisher
  // need canonicalization: the user picks a canonical bucket (matching what
  // /metrics shows), and we expand it to the raw DB values that normalize to
  // that bucket. Institution and funder are inside JSON arrays, so they need
  // raw SQL prefetches that return matching poster IDs.

  const languageValues = parseList(language);
  const licenseCanonicalValues = parseList(license);
  const publicationYearValues = parseList(publicationYear)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  const institutionValues = parseList(institution).map((s) =>
    s.trim().toLowerCase(),
  );
  const funderCanonicalValues = parseList(funder);

  const metadataWhere: Prisma.PosterMetadataWhereInput = {};

  if (languageValues.length > 0) {
    metadataWhere.language = { in: languageValues };
  }
  if (publicationYearValues.length > 0) {
    metadataWhere.publicationYear = { in: publicationYearValues };
  }

  if (licenseCanonicalValues.length > 0) {
    const rawLicenses = await prisma.posterMetadata.findMany({
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        license: { not: null },
      },
      select: { license: true },
      distinct: ["license"],
    });
    const wanted = new Set(licenseCanonicalValues);
    const matching = rawLicenses
      .map((r) => r.license!)
      .filter((raw) => wanted.has(normalizeLicense(raw)));
    if (matching.length === 0) return null;
    metadataWhere.license = { in: matching };
  }
  markStep("license-filter");

  let institutionPosterIds: number[] | null = null;
  if (institutionValues.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ poster_id: number }>>`
      SELECT DISTINCT p.id AS poster_id
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
        AND lower(trim(
          CASE
            WHEN jsonb_typeof(aff) = 'object' THEN aff->>'name'
            WHEN jsonb_typeof(aff) = 'string' THEN aff#>>'{}'
          END
        )) = ANY(${institutionValues}::text[])
    `;
    institutionPosterIds = rows.map((r) => Number(r.poster_id));
    if (institutionPosterIds.length === 0) return null;
  }
  markStep("institution-filter");

  let funderPosterIds: number[] | null = null;
  if (funderCanonicalValues.length > 0) {
    // Fetch distinct (poster, raw funder) pairs in a single scan and
    // canonicalize in JS, collecting the poster IDs whose funder maps to a
    // wanted bucket. Mirrors the pattern used by /api/discover/facets.
    const funderRows = await prisma.$queryRaw<
      Array<{ poster_id: number; funder: string }>
    >`
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
    `;
    const wanted = new Set(funderCanonicalValues);
    const matchingIds = new Set<number>();
    for (const row of funderRows) {
      if (wanted.has(canonicalizeOrg(row.funder, true))) {
        matchingIds.add(Number(row.poster_id));
      }
    }
    if (matchingIds.size === 0) return null;
    funderPosterIds = [...matchingIds];
  }
  markStep("funder-filter");

  // Intersect every JSON-derived poster ID set that is active.
  const idSets = [
    searchFilter.ids,
    institutionPosterIds,
    funderPosterIds,
  ].filter((ids): ids is number[] => ids !== null);

  let idFilter: number[] | null = null;
  for (const ids of idSets) {
    if (idFilter === null) {
      idFilter = ids;
      continue;
    }
    const allowed = new Set(ids);
    idFilter = idFilter.filter((id) => allowed.has(id));
  }
  if (idFilter !== null && idFilter.length === 0) return null;

  // Conditions are collected into AND because the search and source filters
  // each bring their own OR, which would overwrite each other in a flat object.
  const conditions: Prisma.PosterWhereInput[] = [...searchFilter.where];
  if (sourceFilter) conditions.push(sourceFilter);
  if (Object.keys(metadataWhere).length > 0) {
    conditions.push({ posterMetadata: { is: metadataWhere } });
  }
  if (idFilter !== null) conditions.push({ id: { in: idFilter } });

  const whereClause: Prisma.PosterWhereInput = {
    status: "published",
    tombstone: false,
    isLatestVersion: true,
    ...(conditions.length > 0 && { AND: conditions }),
  };

  return whereClause;
}
