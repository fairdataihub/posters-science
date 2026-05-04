import iso6391 from "../../../app/assets/data/iso-639-1.json";

const languageNames = new Map(iso6391.map((l) => [l.code, l.name]));

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

const NULL_CONFERENCE =
  /^(not\s+specified|n\/a|no\s+specified|sin\s+especif[ia]r|none|unknown|not\s+available|unspecified|-)$/i;

export default defineEventHandler(async () => {
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
  ] = await Promise.all([
    // 1
    prisma.poster.count({ where: { status: "published", automated: false } }),
    // 2
    prisma.poster.count({ where: { status: "published", automated: true } }),

    // 3 — monthly trend (last 13 months, client fills full 12-month window)
    prisma.$queryRaw<Array<{ month: Date; count: number }>>`
      SELECT DATE_TRUNC('month', created) AS month, COUNT(*)::int AS count
      FROM "Poster"
      WHERE status = 'published'
        AND created >= NOW() - INTERVAL '13 months'
      GROUP BY month
      ORDER BY month ASC
    `,

    // 4 — posters with at least one funding reference
    prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      WHERE p.status = 'published'
        AND pm."fundingReferences" IS NOT NULL
        AND jsonb_array_length(pm."fundingReferences"::jsonb) > 0
    `,

    // 5
    prisma.posterMetadata.groupBy({
      by: ["domain"],
      where: { poster: { status: "published" }, domain: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { domain: "desc" } },
      take: 10,
    }),

    // 6
    prisma.posterMetadata.groupBy({
      by: ["language"],
      where: { poster: { status: "published" }, language: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { language: "desc" } },
      take: 10,
    }),

    // 7
    prisma.posterMetadata.groupBy({
      by: ["license"],
      where: { poster: { status: "published" }, license: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { license: "desc" } },
      take: 50, // fetch more before normalization merges duplicates
    }),

    // 8
    prisma.posterMetadata.groupBy({
      by: ["publisher"],
      where: { poster: { status: "published" }, publisher: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { publisher: "desc" } },
      take: 50,
    }),

    // 9
    prisma.posterMetadata.groupBy({
      by: ["conferenceYear"],
      where: {
        poster: { status: "published" },
        conferenceYear: { not: null },
      },
      _count: { _all: true },
      orderBy: { conferenceYear: "asc" },
    }),

    // 10
    prisma.posterMetadata.groupBy({
      by: ["conferenceName"],
      where: {
        poster: { status: "published" },
        conferenceName: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { conferenceName: "desc" } },
      take: 30, // fetch more to have enough after filtering
    }),

    // 11 — top 20 subjects via unnest
    prisma.$queryRaw<Array<{ subject: string; count: number }>>`
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

    // 12 — count of distinct subjects across all published posters
    prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT s)::int AS count
      FROM "PosterMetadata" pm
      JOIN "Poster" p ON pm."posterId" = p.id
      CROSS JOIN LATERAL unnest(pm.subjects) AS s
      WHERE p.status = 'published'
        AND pm.subjects IS NOT NULL
        AND s != ''
    `,

    // 13 — count of distinct institution names from creators[].affiliation JSON
    prisma.$queryRaw<[{ count: number }]>`
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
    `,

    // 14 — top 20 institutions by poster count
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
        GROUP BY institution
      ) sub
      WHERE institution IS NOT NULL AND institution != ''
      ORDER BY poster_count DESC
      LIMIT 20
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

  // Normalize and merge publisher name variants (e.g. "figshare" + "Figshare" → one entry)
  const publisherMap = new Map<string, { displayName: string; count: number }>();
  for (const r of publisherDistribution) {
    const key = r.publisher!.trim().toLowerCase();
    const existing = publisherMap.get(key);
    if (existing) {
      existing.count += r._count._all;
    } else {
      publisherMap.set(key, { displayName: r.publisher!.trim(), count: r._count._all });
    }
  }
  const publishers = [...publisherMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(({ displayName, count }) => ({ name: displayName, count }));

  // Filter null-equivalent conference names
  const conferences = topConferencesRaw
    .filter(
      (r) => r.conferenceName && !NULL_CONFERENCE.test(r.conferenceName.trim()),
    )
    .slice(0, 15)
    .map((r) => ({ name: r.conferenceName!, count: r._count._all }));

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
      languageCount: languageDistribution.length,
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
    },
  };
});
