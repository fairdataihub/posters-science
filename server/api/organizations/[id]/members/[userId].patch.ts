import { z } from "zod";
import { logwatch } from "../../../../utils/logwatch";
import {
  ORGANIZATION_LAST_OWNER_MESSAGE,
  requireOrgOwner,
  withOrganizationOwnersLocked,
} from "../../../../utils/organizations";

const bodySchema = z.object({ role: z.enum(["owner", "member"]) });

/** An owner makes a member an owner, or an owner a member, themselves included. */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const targetUserId = getRouterParam(event, "userId") ?? "";
  const { session } = await requireOrgOwner(event, organizationId);

  const body = await readValidatedBody(event, (b) => bodySchema.safeParse(b));

  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: "Choose a role" });
  }

  const { role } = body.data;

  const previousRole = await withOrganizationOwnersLocked(
    organizationId,
    async (tx, ownerCount) => {
      const member = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: targetUserId },
        },
        select: { id: true, role: true },
      });

      if (!member) {
        throw createError({
          statusCode: 404,
          statusMessage: "This person isn't a member of the organization",
        });
      }

      if (member.role === role) return member.role;

      if (member.role === "owner" && ownerCount <= 1) {
        throw createError({
          statusCode: 409,
          statusMessage: ORGANIZATION_LAST_OWNER_MESSAGE,
        });
      }

      await tx.organizationMember.update({
        where: { id: member.id },
        data: { role },
      });

      return member.role;
    },
  );

  if (previousRole !== role) {
    logwatch.info({
      action: "organization.member.role",
      message: "Organization member role changed",
      userId: session.user.id,
      organizationId,
      targetUserId,
      from: previousRole,
      to: role,
    });
  }

  return { role };
});
