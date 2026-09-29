export type PosterFilters = {
  status?: string;
  doi?: string;
  automated?: string;
  extraction?: string;
};

export type ExtractionFilters = { status?: string };

export type UserFilters = { role?: string; verified?: string };

/** A tab plus the filters that make its table match the tile that was clicked. */
export type AdminView = {
  tab: string;
  posters?: PosterFilters;
  extraction?: ExtractionFilters;
  users?: UserFilters;
};

/**
 * Filters pushed into a table from outside. The token changes on every request
 * so clicking the same tile twice still reapplies it.
 */
export type FilterPreset<T> = { token: number; filters: T };

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

export type AdminStats = {
  totalUsers: number;
  adminUsers: number;
  unverifiedUsers: number;
  newUsersLast30Days: number;
  newPostersLast30Days: number;
  posters: {
    total: number;
    draft: number;
    downloaded: number;
    published: number;
    tombstoned: number;
  };
  postersWithDoi: number;
  zenodoPublished: number;
  jobs: {
    byStatus: Record<string, number>;
    pending: number;
    failed: number;
  };
  pendingJobs: number;
};

export type AdminUserRow = {
  id: string;
  givenName: string;
  familyName: string;
  emailAddress: string;
  role: string;
  emailVerified: boolean;
  created: string;
  _count: { Poster: number };
};

export type PosterOwner = {
  id: string;
  givenName: string;
  familyName: string;
  emailAddress: string;
};

export type AdminPosterRow = {
  id: number;
  title: string;
  status: string;
  tombstone: boolean;
  tombedReason: string;
  automated: boolean;
  imageUrl: string;
  publishedAt: string | null;
  created: string;
  updated: string;
  versionRootId: number | null;
  versionSequence: number;
  isLatestVersion: boolean;
  user: PosterOwner;
  posterMetadata: {
    doi: string | null;
    license: string | null;
    publisher: string | null;
    publicationYear: number | null;
    version: string | null;
  } | null;
  extractionJob: {
    id: string;
    status: string;
    error: string | null;
    fileName: string;
    updated: string;
  } | null;
  zenodoDepositions: {
    depositionId: number;
    status: string;
    lastPublishedZenodoDoi: string | null;
  } | null;
  _count: { likes: number };
};

export type AdminExtractionJobRow = {
  id: string;
  fileName: string;
  status: string;
  completed: boolean;
  error: string | null;
  created: string;
  updated: string;
  poster: {
    id: number;
    title: string;
    status: string;
    automated: boolean;
    user: { emailAddress: string };
  };
};

export type AdminAuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  created: string;
  adminUser: PosterOwner;
};

export type AdminMaintenanceRow = {
  key: string;
  enabled: boolean;
  message: string;
  previewMessage: string;
  enabledAt: string | null;
  updated: string | null;
  updatedBy: PosterOwner | null;
};
