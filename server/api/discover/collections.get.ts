import type {
  CollectionSearchResponse,
  CollectionSearchSort,
} from "#shared/types/collection";
import { searchCollections } from "../../utils/collectionSearch";

const SORTS: CollectionSearchSort[] = [
  "relevance",
  "newest",
  "name",
  "posters",
];

function list(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Public collections for Discover. Takes the same search and filter params as
 * /api/discover, plus:
 *
 * - `match`: details, posters or both (the default), comma separated.
 * - `sortBy`: relevance (the default when searching), newest, name or posters.
 *
 * The Discover band asks for limit=3. The collections page pages through all.
 */
export default defineEventHandler(
  async (event): Promise<CollectionSearchResponse> => {
    const query = getQuery(event);

    const page = Math.max(
      1,
      Number.parseInt(String(query.page ?? "1"), 10) || 1,
    );
    const limit = Math.min(
      48,
      Math.max(1, Number.parseInt(String(query.limit ?? "12"), 10) || 12),
    );

    const match = new Set(list(query.match));
    const matchAll = match.size === 0;
    const sort = SORTS.find((s) => s === query.sortBy) ?? null;

    const { collections, total } = await searchCollections(query, {
      details: matchAll || match.has("details"),
      posters: matchAll || match.has("posters"),
      sort,
      page,
      limit,
    });

    return { collections, total, page, limit };
  },
);
