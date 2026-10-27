import { Prisma } from "#shared/generated/client";
import type {
  DiscoverSearchField,
  ParsedDiscoverSearch,
} from "#shared/utils/discoverSearch";
import { escapeLike } from "#shared/utils/searchQuery";

// Discover search runs in two layers. Plain columns (title, description, DOI,
// conference) go through Prisma. Values inside JSON arrays (creators,
// affiliations, identifiers, funding, poster text) and subject substrings have
// no Prisma filter, so a raw query collects the matching poster ids first.

type JsonField = Exclude<
  DiscoverSearchField,
  "title" | "description" | "doi" | "conference"
>;

export type DiscoverSearchFilter = {
  /** Prisma conditions, all of which must hold. */
  where: Prisma.PosterWhereInput[];
  /**
   * Poster ids the JSON-backed conditions allow, or null when none applied.
   * An empty array means nothing can match.
   */
  ids: number[] | null;
};

function likePattern(term: string): string {
  return `%${escapeLike(term)}%`;
}

// Array-valued JSON columns occasionally hold null or an object, which
// jsonb_array_elements would reject, so every expansion is guarded.
const creators = Prisma.sql`jsonb_array_elements(
  CASE WHEN jsonb_typeof(pm.creators) = 'array' THEN pm.creators ELSE '[]'::jsonb END
)`;

const affiliationsOf = (creator: Prisma.Sql) => Prisma.sql`jsonb_array_elements(
  CASE WHEN jsonb_typeof(${creator}->'affiliation') = 'array'
       THEN ${creator}->'affiliation' ELSE '[]'::jsonb END
)`;

const fundingReferences = Prisma.sql`jsonb_array_elements(
  CASE WHEN jsonb_typeof(pm."fundingReferences") = 'array'
       THEN pm."fundingReferences" ELSE '[]'::jsonb END
)`;

// Only string leaves are compared, so JSON keys such as "sectionTitle" never
// match a search for "section".
const stringLeavesMatch = (column: Prisma.Sql, pattern: string) => Prisma.sql`
  EXISTS (
    SELECT 1 FROM jsonb_path_query(${column}, 'strict $.**') AS leaf
    WHERE jsonb_typeof(leaf) = 'string' AND leaf #>> '{}' ILIKE ${pattern}
  )`;

/** A per-row condition on `pm` for one JSON-backed field. */
function jsonCondition(field: JsonField, term: string): Prisma.Sql {
  const pattern = likePattern(term);

  switch (field) {
    case "keyword":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM unnest(pm.subjects) AS subject
        WHERE subject ILIKE ${pattern}
      )`;

    case "author":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM ${creators} AS creator
        WHERE creator->>'name' ILIKE ${pattern}
           OR concat_ws(' ', creator->>'givenName', creator->>'familyName') ILIKE ${pattern}
           OR concat_ws(', ', creator->>'familyName', creator->>'givenName') ILIKE ${pattern}
      )`;

    case "affiliation":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM ${creators} AS creator
        CROSS JOIN LATERAL ${affiliationsOf(Prisma.sql`creator`)} AS aff
        WHERE CASE
          WHEN jsonb_typeof(aff) = 'object' THEN aff->>'name'
          WHEN jsonb_typeof(aff) = 'string' THEN aff #>> '{}'
        END ILIKE ${pattern}
      )`;

    // Identifiers are matched on the value alone. Stored rows disagree on
    // whether the scheme lives in nameIdentifierScheme or nameIdentifierType,
    // and the value may be a bare id or a full URL.
    case "orcid":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM ${creators} AS creator
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(creator->'nameIdentifiers') = 'array'
               THEN creator->'nameIdentifiers' ELSE '[]'::jsonb END
        ) AS ni
        WHERE CASE
          WHEN jsonb_typeof(ni) = 'object' THEN ni->>'nameIdentifier'
          WHEN jsonb_typeof(ni) = 'string' THEN ni #>> '{}'
        END ILIKE ${pattern}
      )`;

    case "ror":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM ${creators} AS creator
        CROSS JOIN LATERAL ${affiliationsOf(Prisma.sql`creator`)} AS aff
        WHERE jsonb_typeof(aff) = 'object'
          AND aff->>'affiliationIdentifier' ILIKE ${pattern}
      )`;

    case "funder":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM ${fundingReferences} AS fr
        WHERE fr->>'funderName' ILIKE ${pattern}
      )`;

    case "award":
      return Prisma.sql`EXISTS (
        SELECT 1 FROM ${fundingReferences} AS fr
        WHERE fr->>'awardNumber' ILIKE ${pattern}
           OR fr->>'awardTitle' ILIKE ${pattern}
      )`;

    case "content":
      return Prisma.sql`(
        ${stringLeavesMatch(Prisma.sql`pm."posterContent"`, pattern)}
        OR ${stringLeavesMatch(Prisma.sql`pm."tableCaptions"`, pattern)}
        OR ${stringLeavesMatch(Prisma.sql`pm."imageCaptions"`, pattern)}
      )`;
  }
}

/** Prisma condition for a plain-column field. */
function columnCondition(
  field: Exclude<DiscoverSearchField, JsonField>,
  term: string,
): Prisma.PosterWhereInput {
  const contains = {
    contains: escapeLike(term),
    mode: "insensitive" as const,
  };

  switch (field) {
    case "title":
      return { title: contains };
    case "description":
      return { description: contains };
    case "doi":
      return { posterMetadata: { is: { doi: contains } } };
    case "conference":
      return {
        posterMetadata: {
          is: {
            OR: [
              { conferenceName: contains },
              { conferenceAcronym: contains },
              { conferenceSeries: contains },
            ],
          },
        },
      };
  }
}

const COLUMN_FIELDS = new Set<DiscoverSearchField>([
  "title",
  "description",
  "doi",
  "conference",
]);

function isColumnField(
  field: DiscoverSearchField,
): field is Exclude<DiscoverSearchField, JsonField> {
  return COLUMN_FIELDS.has(field);
}

async function postersMatching(conditions: Prisma.Sql[]): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ poster_id: number }>>`
    SELECT p.id AS poster_id
    FROM "PosterMetadata" pm
    JOIN "Poster" p ON pm."posterId" = p.id
    WHERE p.status = 'published'
      AND p.tombstone = false
      AND p."isLatestVersion" = true
      AND ${Prisma.join(conditions, " AND ")}
  `;

  return rows.map((r) => Number(r.poster_id));
}

export async function buildDiscoverSearchFilter(
  parsed: ParsedDiscoverSearch,
): Promise<DiscoverSearchFilter> {
  const where: Prisma.PosterWhereInput[] = [];
  const jsonConditions: Prisma.Sql[] = [];

  for (const { field, term } of parsed.clauses) {
    if (isColumnField(field)) {
      where.push(columnCondition(field, term));
    } else {
      jsonConditions.push(jsonCondition(field, term));
    }
  }

  const ids =
    jsonConditions.length > 0 ? await postersMatching(jsonConditions) : null;

  if (parsed.freeText) {
    const term = parsed.freeText;
    const jsonIds = await postersMatching([
      Prisma.sql`(${Prisma.join(
        [
          jsonCondition("keyword", term),
          jsonCondition("author", term),
          jsonCondition("affiliation", term),
        ],
        " OR ",
      )})`,
    ]);

    const anyOf: Prisma.PosterWhereInput[] = [
      columnCondition("title", term),
      columnCondition("description", term),
      columnCondition("doi", term),
      columnCondition("conference", term),
    ];

    if (jsonIds.length > 0) anyOf.push({ id: { in: jsonIds } });

    where.push({ OR: anyOf });
  }

  return { where, ids };
}
