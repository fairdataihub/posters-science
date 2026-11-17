import { z } from "zod";
import { isProfileId } from "./profile";

// Collections read /collection/<profileId>, or /collection/<slug> when the
// owner picks a custom link. The id comes from the same generator as user
// profiles and is parsed the same way (shared/utils/profile.ts).

export const COLLECTION_NAME_MAX = 150;
export const COLLECTION_DESCRIPTION_MAX = 1000;
export const COLLECTION_CONFERENCE_MAX = 200;
/** Posters in one collection. */
export const COLLECTION_POSTER_MAX = 500;
/** Collections one person can own. */
export const COLLECTION_PER_USER_MAX = 100;
/** Ids accepted in one request. */
export const COLLECTION_IDS_PER_REQUEST = 200;

export const COLLECTION_SLUG_MIN = 3;
export const COLLECTION_SLUG_MAX = 60;

const COLLECTION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The custom link wins over the id once it's set. */
export function collectionPath(
  profileId: string,
  slug?: string | null,
): string {
  return `/collection/${slug || profileId}`;
}

/**
 * A custom link: lower case letters, numbers and single hyphens. Ten letters
 * and numbers with no hyphen is how ids look, so that shape is refused.
 */
export const collectionSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(
    COLLECTION_SLUG_MIN,
    `Must be at least ${COLLECTION_SLUG_MIN} characters`,
  )
  .max(COLLECTION_SLUG_MAX, `Must be at most ${COLLECTION_SLUG_MAX} characters`)
  .regex(
    COLLECTION_SLUG_PATTERN,
    "Use letters, numbers and single hyphens, with no hyphen at the start or end",
  )
  .refine(
    (value) => !isProfileId(value),
    "Exactly 10 letters and numbers is how collection ids look. Add a hyphen or change the length.",
  );

/** Which column a /collection/<handle> address points at. */
export function parseCollectionHandle(
  param: string,
): { profileId: string } | { slug: string } | null {
  const value = param.trim().toLowerCase();

  if (isProfileId(value)) return { profileId: value };

  return collectionSlugSchema.safeParse(value).success ? { slug: value } : null;
}

/** A starting point for a custom link, made from the collection's name. */
export function suggestCollectionSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, COLLECTION_SLUG_MAX)
    .replace(/-+$/, "");
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
