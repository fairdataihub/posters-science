export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const [
    totalUsers,
    adminUsers,
    unverifiedUsers,
    postersByStatus,
    tombstonedCount,
    jobsByStatus,
    withDoi,
    zenodoLinked,
    newUsersLast30Days,
    newPostersLast30Days,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.user.count({ where: { emailVerified: false } }),
    // Live posters only. Tombstoned posters keep their underlying
    // status, so they are excluded here and counted separately below.
    prisma.poster.groupBy({
      by: ["status"],
      where: { tombstone: false },
      _count: { id: true },
    }),
    prisma.poster.count({ where: { tombstone: true } }),
    prisma.extractionJob.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.poster.count({ where: { posterMetadata: { doi: { not: null } } } }),
    prisma.zenodoDeposition.count({ where: { status: "published" } }),
    prisma.user.count({ where: { created: { gte: thirtyDaysAgo() } } }),
    prisma.poster.count({ where: { created: { gte: thirtyDaysAgo() } } }),
  ]);

  const posterCounts = {
    total: 0,
    draft: 0,
    downloaded: 0,
    published: 0,
    tombstoned: tombstonedCount,
  } as Record<string, number>;

  let liveTotal = 0;
  for (const group of postersByStatus) {
    posterCounts[group.status] = group._count.id;
    liveTotal += group._count.id;
  }

  // Total counts every poster that still exists, tombstoned included.
  posterCounts.total = liveTotal + tombstonedCount;

  const jobCounts: Record<string, number> = {};
  for (const group of jobsByStatus) {
    jobCounts[group.status] = group._count.id;
  }

  const pendingJobs = Object.entries(jobCounts).reduce(
    (sum, [status, count]) =>
      isInFlightExtractionStatus(status) ? sum + count : sum,
    0,
  );

  return {
    totalUsers,
    adminUsers,
    unverifiedUsers,
    newUsersLast30Days,
    newPostersLast30Days,
    posters: posterCounts,
    postersWithDoi: withDoi,
    zenodoPublished: zenodoLinked,
    jobs: {
      byStatus: jobCounts,
      pending: pendingJobs,
      failed: jobCounts.failed ?? 0,
    },
    // Kept for the existing consumers of this endpoint.
    pendingJobs,
  };
});

function thirtyDaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 30);

  return date;
}
