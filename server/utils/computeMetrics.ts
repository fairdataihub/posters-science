import type { PrismaClient } from "../../shared/generated/client";
import iso6391 from "../../shared/data/iso-639-1.json";

const languageNames = new Map(iso6391.map((l) => [l.code, l.name]));

// Rights statements that aren't real licenses; excluded from the distribution.
const EXCLUDED_LICENSES = new Set([
  "in copyright",
  "copyright not evaluated",
  "all rights reserved",
  "other-at",
]);

function normalizeLicense(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (/cc0|cc-zero|public-domain/.test(s)) return "CC0-1.0";
  if (/^cc-by-nc-nd-4/.test(s) || s === "cc-by-nc-nd") return "CC-BY-NC-ND-4.0";
  if (/^cc-by-nc-sa-4/.test(s) || s === "cc-by-nc-sa") return "CC-BY-NC-SA-4.0";
  if (/^cc-by-nc-4/.test(s) || s === "cc-by-nc") return "CC-BY-NC-4.0";
  if (/^cc-by-nd-4/.test(s) || s === "cc-by-nd") return "CC-BY-ND-4.0";
  if (/^cc-by-sa-4/.test(s) || s === "cc-by-sa") return "CC-BY-SA-4.0";
  if (/^cc-by-4/.test(s) || s === "cc-by") return "CC-BY-4.0";
  if (/apache-?2/.test(s)) return "Apache-2.0";
  if (s === "mit") return "MIT";

  return raw.trim();
}

// Strip trailing qualifiers so publisher variants merge into one entry,
// e.g. "Figshare (United Kingdom)" / "figshare.com" / "Figshare" -> "Figshare".
function cleanPublisherName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, "") // drop trailing "(United Kingdom)", "(EPA)", etc.
    .replace(/\.(com|org|net|io|edu|gov)$/i, "") // drop trailing TLD, e.g. "figshare.com"
    .trim();

  return cleaned || raw.trim();
}

// Canonical names for organizations that show up under many name variants in
// source metadata, so a chart doesn't split one entity across many bars. Rules
// marked funderOnly are only safe in a funding context: "NSF <grant#>" means the
// agency, but "NSF Unidata" as a publisher is a distinct program, not the agency.
type OrgAlias = {
  canonical: string;
  pattern: RegExp;
  exclude?: RegExp;
  funderOnly?: boolean;
};

const ORG_ALIASES: OrgAlias[] = [
  {
    canonical: "U.S. Environmental Protection Agency",
    pattern: /environmental protection agency/i,
  },
  {
    canonical: "U.S. National Science Foundation",
    pattern: /national science foundation|\bnsf\b|^directorate for /i,
    // Keep other countries' science foundations and NSF-named events separate.
    exclude:
      /swiss|swedish|china|chinese|korea|natural science|meeting|conference|workshop|symposium/i,
    funderOnly: true,
  },
];

function canonicalizeOrg(raw: string, isFunder = false): string {
  const cleaned = cleanPublisherName(raw);
  for (const alias of ORG_ALIASES) {
    if (alias.funderOnly && !isFunder) continue;
    if (alias.pattern.test(cleaned) && !alias.exclude?.test(cleaned)) {
      return alias.canonical;
    }
  }

  return cleaned;
}

const NULL_CONFERENCE =
  /^(not\s+specified|n\/a|no\s+specified|sin\s+especif[ia]r|none|unknown|not\s+available|unspecified|-)$/i;

// Computes the full metrics payload from the database. Takes a PrismaClient so
// it can run both inside Nitro (the API route, with the auto-imported singleton)
// and from a standalone tsx script (the scheduled snapshot job, with its own
// client instance). Preserves the original request-time aggregation exactly.
export async function computeMetrics(client: PrismaClient) {
  const currentYear = new Date().getFullYear();

  const [
    manualCount,
    automatedCount,
    monthlyTrend,
    fundedResult,
    domainDistributionRaw,
    languageDistribution,
    licenseDistributionRaw,
    publisherDistribution,
    conferenceYearDistribution,
    topConferencesRaw,
    topSubjects,
    uniqueSubjectResult,
    uniqueInstitutionResult,
    topInstitutions,
    publicationYearDistribution,
    doiResult,
    creatorStatsResult,
    rorPosterResult,
    funderPairsRaw,
    languageCountResult,
  ] = await Promise.all([
    // 1) count of published posters that are manually shared
    client.poster.count({ where: { status: "published", automated: false } }),
    // 2) count of published posters that are auto-indexed
    client.poster.count({ where: { status: "published", automated: true } }),

    // 3) monthly trend (last 13 months, client fills full 12-month window)
    client.$queryRaw<Array<{ month: Date; count: number }>>`
      SELECT DATE_TRUNC('month', created) AS month, COUNT(*)::int AS count
      FROM "Poster"
      WHERE status = 'published'
        AND created >= NOW() - INTERVAL '13 months'
      GROUP BY month
      ORDER BY month ASC
    `,

    // 4) posters with at least one funding reference
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND pm."fundingReferences" IS NOT NULL
        AND jsonb_array_length(pm."fundingReferences"::jsonb) > 0
    `,

    // 5) top 10 domains
    client.posterMetadata.groupBy({
      by: ["domain"],
      where: { poster: { status: "published" }, domain: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { domain: "desc" } },
      take: 10,
    }),

    // 6) top 10 languages
    client.posterMetadata.groupBy({
      by: ["language"],
      where: { poster: { status: "published" }, language: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { language: "desc" } },
      take: 10,
    }),

    // 7) top 50 licenses
    client.posterMetadata.groupBy({
      by: ["license"],
      where: { poster: { status: "published" }, license: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { license: "desc" } },
      take: 50, // fetch more before normalization merges duplicates
    }),

    // 8) all publishers (merged + canonicalized in JS; ordered so the
    //    highest-count variant supplies the display name)
    client.posterMetadata.groupBy({
      by: ["publisher"],
      where: { poster: { status: "published" }, publisher: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { publisher: "desc" } },
    }),

    // 9) conference year distribution
    client.posterMetadata.groupBy({
      by: ["conferenceYear"],
      where: {
        poster: { status: "published" },
        conferenceYear: { not: null },
      },
      _count: { _all: true },
      orderBy: { conferenceYear: "asc" },
    }),

    // 10) top 30 conference names
    client.posterMetadata.groupBy({
      by: ["conferenceName"],
      where: {
        poster: { status: "published" },
        conferenceName: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { conferenceName: "desc" } },
      take: 30, // fetch more to have enough after filtering
    }),

    // 11) top 20 subjects
    client.$queryRaw<Array<{ subject: string; count: number }>>`
      SELECT unnest(subjects) AS subject, COUNT(*)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND subjects IS NOT NULL
        AND array_length(subjects, 1) > 0
      GROUP BY subject
      ORDER BY count DESC
      LIMIT 20
    `,

    // 12) count of distinct subjects across all published posters
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT s)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      CROSS JOIN LATERAL unnest(pm.subjects) AS s
      WHERE p.status = 'published'
        AND pm.subjects IS NOT NULL
        AND s != ''
    `,

    // 13) count of distinct institution names from creators[].affiliation JSON
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT institution)::int AS count
      FROM (
        SELECT
          CASE
            WHEN jsonb_typeof(aff) = 'object' THEN aff->>'name'
            WHEN jsonb_typeof(aff) = 'string' THEN aff#>>'{}'
          END AS institution
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
      ) sub
      WHERE institution IS NOT NULL AND institution != ''
        AND trim(institution) !~ '^[0-9]+$'
        AND lower(trim(institution)) <> 'institution name'
    `,

    // 14) top 20 institutions by poster count
    client.$queryRaw<Array<{ institution: string; poster_count: number }>>`
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
        GROUP BY institution
      ) sub
      WHERE institution IS NOT NULL AND institution != ''
        AND trim(institution) !~ '^[0-9]+$'
        AND lower(trim(institution)) <> 'institution name'
      ORDER BY poster_count DESC
      LIMIT 20
    `,

    // 15) publication year distribution
    client.posterMetadata.groupBy({
      by: ["publicationYear"],
      where: {
        poster: { status: "published" },
        publicationYear: { not: null, gte: 2000, lte: currentYear },
      },
      _count: { _all: true },
      orderBy: { publicationYear: "asc" },
    }),

    // 16) count of published posters with a DOI
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND pm.doi IS NOT NULL
        AND pm.doi <> ''
    `,

    // 17) creator derived stats in a single flatten of creators
    client.$queryRaw<
      [
        {
          mentions: number;
          posters_with_authors: number;
          distinct_authors: number;
          orcid_posters: number;
        },
      ]
    >`
      WITH creators_flat AS (
        SELECT p.id AS pid, jsonb_array_elements(pm.creators) AS cr
        FROM "PosterMetadata" pm
        JOIN "Poster" p ON pm."posterId" = p.id
        WHERE p.status = 'published'
          AND jsonb_typeof(pm.creators) = 'array'
      )
      SELECT
        COUNT(*)::int AS mentions,
        COUNT(DISTINCT pid)::int AS posters_with_authors,
        COUNT(DISTINCT cr->>'name') FILTER (WHERE cr->>'name' <> '')::int AS distinct_authors,
        COUNT(DISTINCT pid) FILTER (
          WHERE cr->'nameIdentifiers' @> '[{"nameIdentifierType": "ORCID"}]'::jsonb
        )::int AS orcid_posters
      FROM creators_flat
    `,

    // 18) count of published posters with >=1 ROR-identified affiliation
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT p.id)::int AS count
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
        AND aff->>'affiliationIdentifierScheme' = 'ROR'
        AND aff->>'affiliationIdentifier' <> ''
    `,

    // 19) distinct (poster, funder) pairs; canonicalized and counted in JS so
    // funder-name variants (NSF directorates, grant#s) roll up to one entity
    // without double-counting posters that cite the same funder twice
    client.$queryRaw<Array<{ poster_id: number; funder: string }>>`
      SELECT DISTINCT p.id AS poster_id, fr->>'funderName' AS funder
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN pm."fundingReferences" IS NOT NULL
              AND jsonb_typeof(pm."fundingReferences") = 'array'
             THEN pm."fundingReferences" ELSE '[]'::jsonb END
      ) AS fr
      WHERE p.status = 'published'
        AND fr->>'funderName' IS NOT NULL
        AND fr->>'funderName' <> ''
        AND lower(fr->>'funderName') <> 'unknown funder'
    `,

    // 20) true count of distinct languages (the languages query above is
    // limited to the top 10 for the chart, so its length under-reports)
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT pm.language)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND pm.language IS NOT NULL
        AND pm.language <> ''
    `,
  ]);

  // Build a full 12-month window, filling in zeros for months with no data
  const now = new Date();
  const trendMap = new Map(
    monthlyTrend.map((r) => [r.month.toISOString().slice(0, 7), r.count]),
  );
  const fullTrend = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    return { month: key, count: trendMap.get(key) ?? 0 };
  });

  // Normalize and merge license variants
  const licenseMap = new Map<string, number>();
  for (const r of licenseDistributionRaw) {
    const key = normalizeLicense(r.license!);
    if (EXCLUDED_LICENSES.has(key.toLowerCase())) continue;
    licenseMap.set(key, (licenseMap.get(key) ?? 0) + r._count._all);
  }
  const licenses = [...licenseMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // Filter empty-string domains
  const domains = domainDistributionRaw
    .filter((r) => r.domain && r.domain.trim() !== "")
    .map((r) => ({ name: r.domain!, count: r._count._all }));

  // Normalize and merge publisher name variants (e.g. "figshare" + "Figshare" into one entry)
  const publisherMap = new Map<
    string,
    { displayName: string; count: number }
  >();
  for (const r of publisherDistribution) {
    const displayName = canonicalizeOrg(r.publisher!);
    const key = displayName.toLowerCase();
    const existing = publisherMap.get(key);
    if (existing) {
      existing.count += r._count._all;
    } else {
      publisherMap.set(key, {
        displayName,
        count: r._count._all,
      });
    }
  }
  const publishers = [...publisherMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(({ displayName, count }) => ({ name: displayName, count }));

  // Filter null conference names
  const conferences = topConferencesRaw
    .filter(
      (r) => r.conferenceName && !NULL_CONFERENCE.test(r.conferenceName.trim()),
    )
    .slice(0, 15)
    .map((r) => ({ name: r.conferenceName!, count: r._count._all }));

  // Creator-derived stats (from the single creators flatten)
  const creatorStats = creatorStatsResult[0];
  const avgAuthorsPerPoster = creatorStats?.posters_with_authors
    ? Math.round(
        (creatorStats.mentions / creatorStats.posters_with_authors) * 100,
      ) / 100
    : 0;

  // Roll up funder-name variants to canonical orgs, counting distinct posters.
  const funderPosters = new Map<string, Set<number>>();
  for (const r of funderPairsRaw) {
    const name = canonicalizeOrg(r.funder, true);
    if (!name) continue;
    let set = funderPosters.get(name);
    if (!set) {
      set = new Set();
      funderPosters.set(name, set);
    }
    set.add(r.poster_id);
  }
  const funders = [...funderPosters.entries()]
    .map(([name, set]) => ({ name, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const publicationYears = publicationYearDistribution.map((r) => ({
    year: r.publicationYear!,
    count: r._count._all,
  }));

  return {
    platform: {
      monthlyTrend: fullTrend,
      manualCount,
      automatedCount,
    },
    world: {
      funded: fundedResult[0]?.count ?? 0,
      uniqueSubjectCount: uniqueSubjectResult[0]?.count ?? 0,
      uniqueInstitutionCount: uniqueInstitutionResult[0]?.count ?? 0,
      languageCount: languageCountResult[0]?.count ?? 0,
      domains,
      languages: languageDistribution.map((r) => ({
        name: languageNames.get(r.language!.toLowerCase()) ?? r.language!,
        count: r._count._all,
      })),
      licenses,
      conferences,
      conferenceYears: conferenceYearDistribution.map((r) => ({
        year: r.conferenceYear!,
        count: r._count._all,
      })),
      publishers,
      subjects: topSubjects,
      institutions: topInstitutions,
      publishedTotal: manualCount + automatedCount,
      publicationYears,
      researcherCount: creatorStats?.distinct_authors ?? 0,
      avgAuthorsPerPoster,
      withDoi: doiResult[0]?.count ?? 0,
      withOrcid: creatorStats?.orcid_posters ?? 0,
      withRor: rorPosterResult[0]?.count ?? 0,
      funders,
    },
  };
}

// Shape returned by computeMetrics; callers cast the stored JSON snapshot back to
// this so the API response keeps its exact type for the frontend.
export type MetricsPayload = Awaited<ReturnType<typeof computeMetrics>>;
