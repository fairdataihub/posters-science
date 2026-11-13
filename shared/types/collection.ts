import type { OrganizationListingRole, OrganizationRole } from "./organization";

/** A cover thumbnail on a collection card. */
export type CollectionCover = { posterId: number; imageUrl: string };

/** A collection as its owner sees it. */
export type MyCollection = {
  id: string;
  path: string;
  name: string;
  description: string;
  conference: string;
  isPublic: boolean;
  hidden: boolean;
  hiddenReason: string;
  /** Posters that are public right now. Retired ones stay in but aren't counted. */
  posterCount: number;
  /** Up to four, newest additions first. */
  covers: CollectionCover[];
  /** The bulk upload it was made from, if any. */
  sourceBulkSubmissionId: string | null;
  created: string;
  updated: string;
};

/** A public collection, as cards on profiles, organizations and Discover show it. */
export type CollectionSummary = {
  id: string;
  path: string;
  name: string;
  description: string;
  conference: string;
  posterCount: number;
  covers: CollectionCover[];
  owner: {
    name: string;
    /** Set only when the owner's own profile is public. */
    profilePath: string | null;
  };
  created: string;
  updated: string;
};

/** A poster in a collection, as its owner manages it. */
export type CollectionListedPoster = {
  posterId: number;
  title: string;
  imageUrl: string;
  addedAt: string;
};

/** One of the owner's posters that isn't in the collection yet. */
export type CollectionAvailablePoster = {
  posterId: number;
  title: string;
  imageUrl: string;
  role: OrganizationListingRole;
  publishedAt: string | null;
};

export type CollectionPosters = {
  listed: CollectionListedPoster[];
  available: CollectionAvailablePoster[];
  /** How many more posters fit. */
  remaining: number;
};

/** One of the signed-in person's collections, as the poster picker shows it. */
export type PosterCollectionChoice = {
  id: string;
  name: string;
  path: string;
  isPublic: boolean;
  hidden: boolean;
  /** The poster is in this collection. */
  listed: boolean;
  /** No room for another poster. */
  full: boolean;
};

export type PosterCollectionChoices = {
  /** Always the version root. */
  posterId: number;
  /** False when the poster isn't published, is retired, or isn't theirs. */
  canAdd: boolean;
  /** False once the person has as many collections as allowed. */
  canCreate: boolean;
  collections: PosterCollectionChoice[];
};

/** One of the owner's organizations, as the collection's Organizations tab shows it. */
export type CollectionOrganizationChoice = {
  id: string;
  name: string;
  path: string;
  avatarUrl: string;
  /** Null once the owner has left. They can still take the collection off. */
  role: OrganizationRole | null;
  isPublic: boolean;
  hidden: boolean;
  /** The collection is on this organization's page. */
  listed: boolean;
};

export type CollectionOrganizationChoices = {
  organizations: CollectionOrganizationChoice[];
};

/** A collection on an organization's page, as its members manage them. */
export type OrganizationListedCollection = {
  collectionId: string;
  name: string;
  path: string;
  /** Members can already see each other's names on the Members tab. */
  ownerName: string;
  isMine: boolean;
  /** Public and not hidden, so visitors see it on the page. */
  isPublic: boolean;
  posterCount: number;
  addedAt: string;
  canRemove: boolean;
};

/** One of the member's own collections that isn't on the page yet. */
export type OrganizationAvailableCollection = {
  collectionId: string;
  name: string;
  isPublic: boolean;
  posterCount: number;
};

export type OrganizationCollections = {
  listed: OrganizationListedCollection[];
  available: OrganizationAvailableCollection[];
};

/** A new collection prefilled from one of the person's bulk uploads. */
export type CollectionDraft = {
  details: { name: string; description: string; conference: string };
  /** Version roots of the upload's posters that can be added now. */
  posterIds: number[];
  /** Posters in the upload that aren't published yet, or don't fit. */
  skippedCount: number;
  /** Set when the upload already has a collection. */
  existingCollection: { id: string; path: string; name: string } | null;
};

/** Why a collection matched a search. */
export type CollectionMatchReason = "name" | "details" | "posters";

export type CollectionSearchSort = "relevance" | "newest" | "name" | "posters";

/** A collection in Discover results. */
export type CollectionSearchResult = CollectionSummary & {
  /** Null when there is no search. */
  reason: CollectionMatchReason | null;
  /** Posters inside that match the search. */
  matchingPosterCount: number;
};

export type CollectionSearchResponse = {
  collections: CollectionSearchResult[];
  total: number;
  page: number;
  limit: number;
};
