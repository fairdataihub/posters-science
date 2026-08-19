import type { PrismaClient } from "../../shared/generated/client";
import iso6391 from "../../shared/data/iso-639-1.json";
import {
  NULL_CONFERENCE,
  canonicalizeOrg,
  isFunderExcluded,
  isLicenseNoise,
  isSubjectExcluded,
  normalizeLicense,
  normalizeSubject,
} from "./canonicalize";

const languageNames = new Map(iso6391.map((l) => [l.code, l.name]));

// Collapse a distribution to its top N entries plus a single "Other" bucket
function topWithOther(
  items: Array<{ name: string; count: number }>,
  top: number,
): Array<{ name: string; count: number }> {
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, top);
  const otherCount = sorted.slice(top).reduce((sum, i) => sum + i.count, 0);
  if (otherCount > 0) head.push({ name: "Other", count: otherCount });

  return head;
}

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
    domainDistributionRaw,
    languageDistribution,
    licenseDistributionRaw,
    publisherDistribution,
    conferenceYearDistribution,
    topConferencesRaw,
    subjectDistributionRaw,
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
    client.poster.count({
      where: {
        status: "published",
        tombstone: false,
        automated: false,
        isLatestVersion: true,
      },
    }),
    // 2) count of published posters that are auto-indexed
    client.poster.count({
      where: {
        status: "published",
        tombstone: false,
        automated: true,
        isLatestVersion: true,
      },
    }),

    // 3) monthly trend (last 13 months, client fills full 12-month window)
    client.$queryRaw<Array<{ month: Date; count: number }>>`
      SELECT DATE_TRUNC('month', created) AS month, COUNT(*)::int AS count
      FROM "Poster"
      WHERE status = 'published'
        AND tombstone = false
        AND "isLatestVersion" = true
        AND created >= NOW() - INTERVAL '13 months'
      GROUP BY month
      ORDER BY month ASC
    `,

    // 5) top 10 domains
    client.posterMetadata.groupBy({
      by: ["domain"],
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        domain: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { domain: "desc" } },
      take: 10,
    }),

    // 6) full language distribution (collapsed to top 3 + "Other" below)
    client.posterMetadata.groupBy({
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

    // 7) top 50 licenses
    client.posterMetadata.groupBy({
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
      take: 50, // fetch more before normalization merges duplicates
    }),

    // 8) all publishers (merged + canonicalized ordered so the
    // highest-count variant supplies the display name)
    client.posterMetadata.groupBy({
      by: ["publisher"],
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        publisher: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { publisher: "desc" } },
    }),

    // 9) conference year distribution
    client.posterMetadata.groupBy({
      by: ["conferenceYear"],
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        conferenceYear: { not: null },
      },
      _count: { _all: true },
      orderBy: { conferenceYear: "asc" },
    }),

    // 10) top 30 conference names
    client.posterMetadata.groupBy({
      by: ["conferenceName"],
      where: {
        poster: {
          status: "published",
          tombstone: false,
          isLatestVersion: true,
        },
        conferenceName: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { conferenceName: "desc" } },
      take: 30, // fetch more to have enough after filtering
    }),

    // 11) subject distribution (fetch more than the final top 20 so casing
    // variants and "not elsewhere classified" forms below rank 20 can merge in
    // JS before the top-20 slice)
    client.$queryRaw<Array<{ subject: string; count: number }>>`
      SELECT unnest(subjects) AS subject, COUNT(*)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND p.tombstone = false
        AND p."isLatestVersion" = true
        AND subjects IS NOT NULL
        AND array_length(subjects, 1) > 0
      GROUP BY subject
      ORDER BY count DESC
      LIMIT 100
    `,

    // 13) count of distinct institutions from creators[].affiliation JSON.
    // Uniqueness is by name only (case-insensitive, trimmed)
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT lower(trim(institution)))::int AS count
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
          AND p.tombstone = false
          AND p."isLatestVersion" = true
      ) sub
      WHERE institution IS NOT NULL AND institution != ''
        AND trim(institution) !~ '^[0-9]+$'
        AND lower(trim(institution)) NOT IN (
          'institution name', 'null', 'unknown', 'none', 'n/a',
          'not specified', 'notspecified'
        )
    `,

    // 14) top 10 institutions by poster count
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
      LIMIT 10
    `,

    // 15) publication year distribution (published posters)
    client.posterMetadata.groupBy({
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
      orderBy: { publicationYear: "asc" },
    }),

    // 16) count of published posters with a DOI
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND p.tombstone = false
        AND p."isLatestVersion" = true
        AND pm.doi IS NOT NULL
        AND pm.doi <> ''
    `,

    // 17) creator derived stats in a single flatten of creators
    //
    // Author identity rules (Researchers counter):
    //   - If a creator has a non-empty ORCID, that ORCID is the identity.
    //   - Otherwise, identity is the trimmed, lowercased name.
    // This way authors with consistent ORCIDs collapse across posters, and
    // name-only matches no longer split on casing differences.
    client.$queryRaw<
      [
        {
          distinct_authors: number;
          orcid_posters: number;
        },
      ]
    >`
      WITH creators_flat AS (
        SELECT
          p.id AS pid,
          cr,
          NULLIF(lower(trim(cr->>'name')), '') AS name_norm,
          (
            SELECT NULLIF(ni->>'nameIdentifier', '')
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(cr->'nameIdentifiers') = 'array'
                   THEN cr->'nameIdentifiers' ELSE '[]'::jsonb END
            ) AS ni
            WHERE ni->>'nameIdentifierType' = 'ORCID'
            LIMIT 1
          ) AS orcid
        FROM "PosterMetadata" pm
        JOIN "Poster" p ON pm."posterId" = p.id
        CROSS JOIN LATERAL jsonb_array_elements(pm.creators) AS cr
        WHERE p.status = 'published'
          AND p.tombstone = false
          AND p."isLatestVersion" = true
          AND jsonb_typeof(pm.creators) = 'array'
      )
      SELECT
        COUNT(DISTINCT COALESCE('orcid:' || orcid, 'name:' || name_norm)) FILTER (
          WHERE orcid IS NOT NULL OR name_norm IS NOT NULL
        )::int AS distinct_authors,
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
        AND p.tombstone = false
        AND p."isLatestVersion" = true
        AND aff->>'affiliationIdentifierScheme' = 'ROR'
        AND aff->>'affiliationIdentifier' <> ''
    `,

    // 19) distinct (poster, funder) pairs; canonicalized and counted in JS so
    // funder-name variants roll up to one entity. Placeholder values
    // ("not specified", "FUNDER", "no funding", etc.) are filtered out in JS
    // via isFunderExcluded so the denylist stays in one place.
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
        AND p.tombstone = false
        AND p."isLatestVersion" = true
        AND fr->>'funderName' IS NOT NULL
        AND fr->>'funderName' <> ''
    `,

    // 20) count of distinct languages
    client.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT pm.language)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND p.tombstone = false
        AND p."isLatestVersion" = true
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

  // Normalize and merge license variants. isLicenseNoise drops the SPDX
  // denylist plus prose-as-license values (grant text, citations, URLs).
  const licenseMap = new Map<string, number>();
  for (const r of licenseDistributionRaw) {
    if (!r.license) continue;
    const key = normalizeLicense(r.license);
    if (isLicenseNoise(key)) continue;
    licenseMap.set(key, (licenseMap.get(key) ?? 0) + r._count._all);
  }
  const licenses = topWithOther(
    [...licenseMap.entries()].map(([name, count]) => ({ name, count })),
    3,
  );

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
    .slice(0, 10)
    .map(({ displayName, count }) => ({ name: displayName, count }));

  // Strip "not elsewhere classified" suffixes, drop empties, and merge subject
  // case-variants (e.g. "Machine Learning" + "machine learning"). Rows arrive
  // count-desc, so the first (highest-count) casing supplies the display label.
  const subjectMap = new Map<string, { displayName: string; count: number }>();
  for (const r of subjectDistributionRaw) {
    const display = normalizeSubject(r.subject);
    if (isSubjectExcluded(display)) continue;
    const key = display.toLowerCase();
    const existing = subjectMap.get(key);
    if (existing) {
      existing.count += r.count;
    } else {
      subjectMap.set(key, { displayName: display, count: r.count });
    }
  }
  const subjects = [...subjectMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(({ displayName, count }) => ({ subject: displayName, count }));

  // Filter null conference names
  const conferences = topConferencesRaw
    .filter(
      (r) => r.conferenceName && !NULL_CONFERENCE.test(r.conferenceName.trim()),
    )
    .slice(0, 15)
    .map((r) => ({ name: r.conferenceName!, count: r._count._all }));

  // Creator-derived stats (from the single creators flatten)
  const creatorStats = creatorStatsResult[0];

  // Roll up funder-name variants to canonical orgs, counting distinct posters.
  // Drop placeholder funder values ("not specified", "FUNDER", "no funding"
  // etc.) before canonicalization so they don't get rolled into a real org.
  const funderPosters = new Map<string, Set<number>>();
  for (const r of funderPairsRaw) {
    if (isFunderExcluded(r.funder)) continue;
    const name = canonicalizeOrg(r.funder, true);
    if (!name) continue;
    let set = funderPosters.get(name);
    if (!set) {
      set = new Set();
      funderPosters.set(name, set);
    }
    set.add(r.poster_id);
  }
  const funderCount = funderPosters.size;
  const funders = [...funderPosters.entries()]
    .map(([name, set]) => ({ name, count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const publicationYears = publicationYearDistribution.map((r) => ({
    year: r.publicationYear!,
    count: r._count._all,
  }));

  // Top 3 languages plus an "Other" bucket for the donut
  const languages = topWithOther(
    languageDistribution.map((r) => ({
      name: languageNames.get(r.language!.toLowerCase()) ?? r.language!,
      count: r._count._all,
    })),
    3,
  );

  return {
    platform: {
      monthlyTrend: fullTrend,
      manualCount,
      automatedCount,
    },
    world: {
      uniqueInstitutionCount: uniqueInstitutionResult[0]?.count ?? 0,
      languageCount: languageCountResult[0]?.count ?? 0,
      domains,
      languages,
      licenses,
      conferences,
      conferenceYears: conferenceYearDistribution.map((r) => ({
        year: r.conferenceYear!,
        count: r._count._all,
      })),
      publishers,
      subjects,
      institutions: topInstitutions,
      publishedTotal: manualCount + automatedCount,
      publicationYears,
      researcherCount: creatorStats?.distinct_authors ?? 0,
      withDoi: doiResult[0]?.count ?? 0,
      withOrcid: creatorStats?.orcid_posters ?? 0,
      withRor: rorPosterResult[0]?.count ?? 0,
      funderCount,
      funders,
    },
  };
}

// Shape returned by computeMetrics; callers cast the stored JSON snapshot back to
// this so the API response keeps its exact type for the frontend.
export type MetricsPayload = Awaited<ReturnType<typeof computeMetrics>>;
