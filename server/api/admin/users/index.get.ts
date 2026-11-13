import { userSearchWhere } from "../../../utils/adminUserSearch";

export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const search = (query.search as string | undefined)?.trim() || "";
  const role = (query.role as string | undefined) || "";
  const verified = (query.verified as string | undefined) || "";

  const where = {
    ...(search ? userSearchWhere(search) : {}),
    ...(role ? { role } : {}),
    ...(verified === "true"
      ? { emailVerified: true }
      : verified === "false"
        ? { emailVerified: false }
        : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        givenName: true,
        familyName: true,
        emailAddress: true,
        role: true,
        emailVerified: true,
        created: true,
        orcid: true,
        // Read only to say whether one is set; never sent to the browser.
        password: true,
        linkedAccounts: {
          where: { provider: "orcid" },
          select: { providerAccountId: true },
        },
        _count: { select: { Poster: true, organizationMemberships: true } },
      },
      orderBy: { created: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  // A linked iD wins over a typed one, the same as on the public profile.
  const data = users.map(
    ({ password, linkedAccounts, orcid: typedOrcid, ...user }) => {
      const linkedOrcid = linkedAccounts[0]?.providerAccountId;

      return {
        ...user,
        orcid: linkedOrcid
          ? { id: linkedOrcid, verified: true }
          : typedOrcid
            ? { id: typedOrcid, verified: false }
            : null,
        hasPassword: password !== null,
      };
    },
  );

  return { data, total, page, limit };
});
