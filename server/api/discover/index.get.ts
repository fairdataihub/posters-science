import { canonicalizeOrg, normalizeLicense } from "../../utils/canonicalize";

// Filters arrive as repeated query params (?institution=a&institution=b), so
// h3's getQuery yields a string (single value) or string[] (repeated). Each
// entry is one whole value: never split on commas, because institution and
// funder names legitimately contain them.
function parseList(value: unknown): string[] {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];

  return arr.map((s) => String(s).trim()).filter(Boolean);
}

const EMPTY_RESPONSE = { posters: [] as never[], total: 0 };

export default defineEventHandler(async (event) => {
  const requestStartedAt = Date.now();
  let previousStepAt = requestStartedAt;
  const timings: Record<string, number> = {};

  const markStep = (step: string) => {
    const now = Date.now();
    timings[step] = now - previousStepAt;
    previousStepAt = now;
  };

  const {
    search,
    page,
    limit,
    sortBy,
    source,
    language,
    license,
    publicationYear,
    institution,
    funder,
  } = getQuery(event);

  const pageNum = Math.max(1, parseInt(String(page || "1")));
  const limitNum = Math.min(50, Math.max(1, parseInt(String(limit || "9"))));
  const skip = (pageNum - 1) * limitNum;
  markStep("query-parse");

  const searchFilter = search
    ? {
        OR: [
          {
            title: {
              contains: String(search),
              mode: "insensitive" as const,
            },
          },
          {
            description: {
              contains: String(search),
              mode: "insensitive" as const,
            },
          },
        ],
      }
    : {};
  markStep("search-filter");

  const sortByStr = String(sortBy || "Newest First");
  const isSortByViews = sortByStr === "Most Viewed";

  type PrismaOrderBy =
    | { publishedAt: "asc" | "desc" }
    | { createdAt: "asc" | "desc" }
    | { likes: { _count: "asc" | "desc" } };

  const orderBy: PrismaOrderBy = (() => {
    switch (sortByStr) {
      case "Oldest First":
        return { publishedAt: "asc" };
      case "Most Liked":
        return { likes: { _count: "desc" } };
      case "Newest First":
      default:
        return { publishedAt: "desc" };
    }
  })();
  markStep("sort-setup");

  const validSources = ["zenodo", "figshare", "user_submitted"];
  const sourceValues = parseList(source)
    .map((s) => s.toLowerCase())
    .filter((s) => validSources.includes(s));

  const isFigshare = {
    OR: [
      { imageUrl: { contains: "/figshare_", mode: "insensitive" as const } },
      {
        posterMetadata: {
          doi: { startsWith: "10.6084/", mode: "insensitive" as const },
        },
      },
    ],
  };

  const sourceConditions: Record<string, unknown>[] = [];
  if (sourceValues.includes("figshare")) sourceConditions.push(isFigshare);
  if (sourceValues.includes("zenodo"))
    sourceConditions.push({ automated: true, NOT: isFigshare });
  if (sourceValues.includes("user_submitted"))
    sourceConditions.push({ automated: false });

  const sourceFilter =
    sourceConditions.length > 0 ? { OR: sourceConditions } : {};
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

  const metadataWhere: Record<string, unknown> = {};

  if (languageValues.length > 0) {
    metadataWhere.language = { in: languageValues };
  }
  if (publicationYearValues.length > 0) {
    metadataWhere.publicationYear = { in: publicationYearValues };
  }

  if (licenseCanonicalValues.length > 0) {
    const rawLicenses = await prisma.posterMetadata.findMany({
      where: {
        poster: { status: "published", tombstone: false },
        license: { not: null },
      },
      select: { license: true },
      distinct: ["license"],
    });
    const wanted = new Set(licenseCanonicalValues);
    const matching = rawLicenses
      .map((r) => r.license!)
      .filter((raw) => wanted.has(normalizeLicense(raw)));
    if (matching.length === 0) return EMPTY_RESPONSE;
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
        AND lower(trim(
          CASE
            WHEN jsonb_typeof(aff) = 'object' THEN aff->>'name'
            WHEN jsonb_typeof(aff) = 'string' THEN aff#>>'{}'
          END
        )) = ANY(${institutionValues}::text[])
    `;
    institutionPosterIds = rows.map((r) => Number(r.poster_id));
    if (institutionPosterIds.length === 0) return EMPTY_RESPONSE;
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
    if (matchingIds.size === 0) return EMPTY_RESPONSE;
    funderPosterIds = [...matchingIds];
  }
  markStep("funder-filter");

  // Intersect JSON-derived poster ID sets when both filters are active.
  let idFilter: { in: number[] } | undefined;
  if (institutionPosterIds !== null && funderPosterIds !== null) {
    const funderSet = new Set(funderPosterIds);
    const intersection = institutionPosterIds.filter((id) => funderSet.has(id));
    if (intersection.length === 0) return EMPTY_RESPONSE;
    idFilter = { in: intersection };
  } else if (institutionPosterIds !== null) {
    idFilter = { in: institutionPosterIds };
  } else if (funderPosterIds !== null) {
    idFilter = { in: funderPosterIds };
  }

  const metadataFilter =
    Object.keys(metadataWhere).length > 0
      ? { posterMetadata: { is: metadataWhere } }
      : {};

  const idClause = idFilter ? { id: idFilter } : {};

  const whereClause = {
    status: "published",
    tombstone: false,
    ...searchFilter,
    ...sourceFilter,
    ...metadataFilter,
    ...idClause,
  };

  const rawPosters =
    (await prisma.poster.findMany({
      where: whereClause,
      orderBy: isSortByViews ? { publishedAt: "desc" } : orderBy,
      skip,
      take: limitNum,
      include: {
        posterMetadata: {
          select: {
            subjects: true,
          },
        },
        _count: {
          select: { likes: true },
        },
      },
    })) || [];
  markStep("db-findMany");

  const count = await prisma.poster.count({
    where: whereClause,
  });
  markStep("db-count");

  const posters = rawPosters.map(({ posterMetadata, _count, ...poster }) => ({
    ...poster,
    keywords: posterMetadata?.subjects ?? [],
    likes: _count?.likes ?? 0,
  }));
  markStep("poster-map");

  const totalDurationMs = Date.now() - requestStartedAt;
  event.node.res.setHeader(
    "Server-Timing",
    Object.entries(timings)
      .map(([name, duration]) => `${name};dur=${duration}`)
      .join(", "),
  );

  console.info("[discover:index.get] timings", {
    ...timings,
    total: totalDurationMs,
    posters: rawPosters.length,
  });

  return {
    posters,
    total: count,
  };
});
