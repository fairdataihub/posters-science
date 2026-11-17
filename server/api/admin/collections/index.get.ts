import type { Prisma } from "#shared/generated/client";
import { collectionPath } from "#shared/utils/collection";
import { escapeLike } from "#shared/utils/searchQuery";
import { userSearchWhere } from "../../../utils/adminUserSearch";
import { collectionPosterStats } from "../../../utils/collections";

/** Collections for the admin Users tab, searchable by name or owner. */
export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const search = (query.search as string | undefined)?.trim() || "";
  const visibility = (query.visibility as string | undefined) || "";

  const visibilityWhere: Prisma.CollectionWhereInput =
    visibility === "public"
      ? { isPublic: true, hiddenAt: null }
      : visibility === "private"
        ? { isPublic: false, hiddenAt: null }
        : visibility === "hidden"
          ? { hiddenAt: { not: null } }
          : {};

  const where: Prisma.CollectionWhereInput = {
    ...visibilityWhere,
    ...(search
      ? {
          OR: [
            { name: { contains: escapeLike(search), mode: "insensitive" } },
            { owner: userSearchWhere(search) },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      select: {
        id: true,
        profileId: true,
        slug: true,
        name: true,
        conference: true,
        isPublic: true,
        hiddenAt: true,
        hiddenReason: true,
        created: true,
        owner: {
          select: {
            id: true,
            givenName: true,
            familyName: true,
            emailAddress: true,
          },
        },
        _count: { select: { organizationListings: true } },
      },
      orderBy: { created: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.collection.count({ where }),
  ]);

  const stats = await collectionPosterStats(rows.map((row) => row.id));

  const data = rows.map(({ profileId, slug, _count, ...row }) => ({
    ...row,
    path: collectionPath(profileId, slug),
    posterCount: stats.get(row.id)?.posterCount ?? 0,
    organizationCount: _count.organizationListings,
  }));

  return { data, total, page, limit };
});
