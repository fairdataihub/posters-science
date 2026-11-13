import { z } from "zod";

// Collections read /collection/<profileId>. The id comes from the same
// generator as user profiles and is parsed the same way (shared/utils/profile.ts).

export const COLLECTION_NAME_MAX = 150;
export const COLLECTION_DESCRIPTION_MAX = 1000;
export const COLLECTION_CONFERENCE_MAX = 200;
/** Posters in one collection. */
export const COLLECTION_POSTER_MAX = 500;
/** Collections one person can own. */
export const COLLECTION_PER_USER_MAX = 100;
/** Ids accepted in one request. */
export const COLLECTION_IDS_PER_REQUEST = 200;

export function collectionPath(profileId: string): string {
  return `/collection/${profileId}`;
}

export const collectionNameSchema = z
  .string()
  .trim()
  .min(1, "Give the collection a name")
  .max(
    COLLECTION_NAME_MAX,
    `Must be at most ${COLLECTION_NAME_MAX} characters`,
  );

export const collectionDetailsSchema = z.object({
  name: collectionNameSchema,
  description: z
    .string()
    .trim()
    .max(
      COLLECTION_DESCRIPTION_MAX,
      `Must be at most ${COLLECTION_DESCRIPTION_MAX} characters`,
    ),
  conference: z
    .string()
    .trim()
    .max(
      COLLECTION_CONFERENCE_MAX,
      `Must be at most ${COLLECTION_CONFERENCE_MAX} characters`,
    ),
});

export type CollectionDetails = z.output<typeof collectionDetailsSchema>;

/** Where a collection was made, for logs and analytics. */
export const COLLECTION_SOURCES = [
  "page",
  "poster_modal",
  "bulk_batch",
] as const;

export type CollectionSource = (typeof COLLECTION_SOURCES)[number];
