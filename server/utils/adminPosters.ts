import type { Prisma } from "#shared/generated/client";
import {
  parsePosterSearch,
  searchTermAsPosterId,
  type PosterSearchField,
} from "#shared/utils/adminSearch";
import { escapeLike } from "#shared/utils/searchQuery";

import { userSearchWhere } from "./adminUserSearch";

export const SORT_FIELDS = [
  "created",
  "updated",
  "id",
  "title",
  "status",
] as const;

export type SortField = (typeof SORT_FIELDS)[number];

export function isSortField(value: string): value is SortField {
  return (SORT_FIELDS as readonly string[]).includes(value);
}

export function buildPosterAdminWhere(query: {
  search?: string;
  status?: string;
  doi?: string;
  automated?: string;
  extraction?: string;
}): Prisma.PosterWhereInput {
  const parsed = parsePosterSearch(query.search);

  // Filters are collected into AND because several of them contribute their own
  // OR clause, which would otherwise overwrite each other in a flat object.
  const filters: Prisma.PosterWhereInput[] = [];

  if (parsed.term) {
    const { term, field } = parsed;
    const posterId = searchTermAsPosterId(term);
    const contains = {
      contains: escapeLike(term),
      mode: "insensitive" as const,
    };
    const wants = (candidate: PosterSearchField) =>
      !field || field === candidate;

    const clauses: Prisma.PosterWhereInput[] = [];

    // Admins routinely paste a bare poster id from a script or support thread.
    if (wants("id") && posterId !== null) {
      clauses.push({ id: posterId });
    }

    if (wants("title")) {
      clauses.push({ title: contains });
    }

    if (wants("owner")) {
      clauses.push({ user: userSearchWhere(term) });
    }

    if (wants("doi")) {
      clauses.push({
        posterMetadata: { doi: contains },
      });
    }

    // `id:not-a-number` has no representable match, so return nothing rather
    // than silently widening back out to every poster.
    filters.push(clauses.length > 0 ? { OR: clauses } : { id: { in: [] } });
  }

  if (query.status === "tombstoned") {
    filters.push({ tombstone: true });
  } else if (query.status) {
    filters.push({ status: query.status });
  }

  // Some rows store a blank string rather than null, so both count as no DOI.
  if (query.doi === "has") {
    filters.push({
      posterMetadata: { doi: { not: null } },
      NOT: { posterMetadata: { doi: "" } },
    });
  } else if (query.doi === "none") {
    filters.push({
      OR: [
        { posterMetadata: { is: null } },
        { posterMetadata: { doi: null } },
        { posterMetadata: { doi: "" } },
      ],
    });
  }

  if (query.automated === "true") {
    filters.push({ automated: true });
  } else if (query.automated === "false") {
    filters.push({ automated: false });
  }

  if (query.extraction === "none") {
    filters.push({ extractionJob: { is: null } });
  } else if (query.extraction) {
    filters.push({ extractionJob: { status: query.extraction } });
  }

  return filters.length > 0 ? { AND: filters } : {};
}

export const POSTER_ADMIN_SELECT = {
  id: true,
  title: true,
  status: true,
  tombstone: true,
  tombedReason: true,
  automated: true,
  imageUrl: true,
  publishedAt: true,
  created: true,
  updated: true,
  versionRootId: true,
  versionSequence: true,
  isLatestVersion: true,
  user: {
    select: {
      id: true,
      givenName: true,
      familyName: true,
      emailAddress: true,
    },
  },
  posterMetadata: {
    select: {
      doi: true,
      license: true,
      publisher: true,
      publicationYear: true,
      version: true,
    },
  },
  extractionJob: {
    select: {
      id: true,
      status: true,
      error: true,
      fileName: true,
      updated: true,
    },
  },
  zenodoDepositions: {
    select: {
      depositionId: true,
      status: true,
      lastPublishedZenodoDoi: true,
    },
  },
  _count: { select: { likes: true } },
} satisfies Prisma.PosterSelect;
