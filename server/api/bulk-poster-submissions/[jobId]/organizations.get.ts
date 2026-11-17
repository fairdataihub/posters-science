import type { BulkBatchOrganizations } from "#shared/types/bulkSubmissionCompletion";
import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import { posterIdsFromBulkSubmissionSummary } from "~~/server/utils/bulkImportDashboard";

/**
 * The person's organizations for one of their bulk uploads, with how many of
 * the upload's posters each one already shows. Adding goes through
 * POST /api/organizations/[id]/posters, which checks every poster again.
 */
export default defineEventHandler(
  async (event): Promise<BulkBatchOrganizations> => {
    const session = await requireDbUserSession(event);
    const userId = session.user.id;
    const jobId = getRouterParam(event, "jobId") ?? "";

    const job = await prisma.bulkSubmission.findFirst({
      where: { id: jobId, userId },
      select: { submissionSummary: true },
    });

    if (!job) {
      throw createError({
        statusCode: 404,
        statusMessage: "Bulk upload not found",
      });
    }

    const ids = posterIdsFromBulkSubmissionSummary(job.submissionSummary);

    const [posters, listable, memberships] = await Promise.all([
      ids.length === 0
        ? []
        : prisma.poster.findMany({
            where: { id: { in: ids }, userId },
            select: { id: true, versionRootId: true },
          }),
      listablePosterRoots(userId),
      prisma.organizationMember.findMany({
        where: { userId },
        orderBy: { created: "asc" },
        select: {
          organization: {
            select: {
              id: true,
              profileId: true,
              name: true,
              profilePublic: true,
              hiddenAt: true,
            },
          },
        },
      }),
    ]);

    const rootIds = [
      ...new Set(posters.map((poster) => posterFamilyRootId(poster))),
    ];
    const posterIds = rootIds.filter((id) => listable.has(id));
    const organizationIds = memberships.map(
      ({ organization }) => organization.id,
    );

    const listed =
      posterIds.length === 0 || organizationIds.length === 0
        ? []
        : await prisma.organizationPoster.groupBy({
            by: ["organizationId"],
            where: {
              organizationId: { in: organizationIds },
              posterId: { in: posterIds },
            },
            _count: { _all: true },
          });
    const listedCount = new Map(
      listed.map((row) => [row.organizationId, row._count._all]),
    );

    return {
      posterIds,
      skippedCount: rootIds.length - posterIds.length,
      organizations: memberships.map(({ organization }) => {
        const hidden = organization.hiddenAt !== null;

        return {
          id: organization.id,
          name: organization.name,
          path: organizationPath(organization.profileId),
          avatarUrl: organizationAvatarUrl(organization.profileId),
          isPublic: organization.profilePublic && !hidden,
          hidden,
          listedCount: listedCount.get(organization.id) ?? 0,
        };
      }),
    };
  },
);
