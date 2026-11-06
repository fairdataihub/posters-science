import type { Prisma } from "#shared/generated/client";
import { escapeLike } from "#shared/utils/searchQuery";
import { userSearchWhere } from "../../../utils/adminUserSearch";

/** Organizations for the admin Users tab, searchable by name or owner. */
export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const search = (query.search as string | undefined)?.trim() || "";
  const visibility = (query.visibility as string | undefined) || "";

  const visibilityWhere: Prisma.OrganizationWhereInput =
    visibility === "public"
      ? { profilePublic: true, hiddenAt: null }
      : visibility === "private"
        ? { profilePublic: false, hiddenAt: null }
        : visibility === "hidden"
          ? { hiddenAt: { not: null } }
          : {};

  const where: Prisma.OrganizationWhereInput = {
    ...visibilityWhere,
    ...(search
      ? {
          OR: [
            { name: { contains: escapeLike(search), mode: "insensitive" } },
            {
              members: {
                some: { role: "owner", user: userSearchWhere(search) },
              },
            },
          ],
        }
      : {}),
  };

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      select: {
        id: true,
        profileId: true,
        name: true,
        profilePublic: true,
        hiddenAt: true,
        hiddenReason: true,
        created: true,
        members: {
          where: { role: "owner" },
          orderBy: { created: "asc" },
          select: {
            user: {
              select: {
                id: true,
                givenName: true,
                familyName: true,
                emailAddress: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            posters: { where: { poster: { tombstone: false } } },
          },
        },
      },
      orderBy: { created: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.organization.count({ where }),
  ]);

  return { data: organizations, total, page, limit };
});
