import { escapeLike } from "#shared/utils/searchQuery";

/**
 * Every poster claim, newest first. Claims are approved the moment they are
 * made, so this list is where an admin spots and revokes a bad one.
 *
 * `q` matches a poster id exactly, or the poster title or the claimant's
 * email and name as a substring.
 */
export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const q = (query.q as string | undefined)?.trim() || "";

  const contains = { contains: escapeLike(q), mode: "insensitive" as const };
  const posterId = /^\d+$/.test(q) ? Number(q) : null;

  const where = q
    ? {
        OR: [
          ...(posterId !== null ? [{ posterId }] : []),
          { poster: { title: contains } },
          { user: { emailAddress: contains } },
          { user: { givenName: contains } },
          { user: { familyName: contains } },
        ],
      }
    : {};

  const [claims, total] = await Promise.all([
    prisma.posterClaim.findMany({
      where,
      select: {
        id: true,
        posterId: true,
        role: true,
        created: true,
        poster: { select: { title: true, tombstone: true } },
        user: {
          select: {
            id: true,
            givenName: true,
            familyName: true,
            emailAddress: true,
          },
        },
      },
      orderBy: { created: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.posterClaim.count({ where }),
  ]);

  return { data: claims, total, page, limit };
});
