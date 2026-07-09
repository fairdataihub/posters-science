export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const [totalUsers, postersByStatus, tombstonedCount, pendingJobs] =
    await Promise.all([
      prisma.user.count(),
      // Live posters only. Tombstoned (retired) posters keep their underlying
      // status, so they are excluded here and counted separately below.
      prisma.poster.groupBy({
        by: ["status"],
        where: { tombstone: false },
        _count: { id: true },
      }),
      prisma.poster.count({ where: { tombstone: true } }),
      prisma.extractionJob.count({
        where: { status: { in: ["pending-extraction", "processing"] } },
      }),
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

  return { totalUsers, posters: posterCounts, pendingJobs };
});
