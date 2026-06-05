export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const [totalUsers, postersByStatus, pendingJobs] = await Promise.all([
    prisma.user.count(),
    prisma.poster.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.extractionJob.count({
      where: { status: { in: ["pending-extraction", "processing"] } },
    }),
  ]);

  const posterCounts = {
    total: postersByStatus.reduce((sum, g) => sum + g._count.id, 0),
    draft: 0,
    downloaded: 0,
    published: 0,
  } as Record<string, number>;

  for (const group of postersByStatus) {
    posterCounts[group.status] = group._count.id;
  }

  return { totalUsers, posters: posterCounts, pendingJobs };
});
