import { logwatch } from "../../../utils/logwatch";
import { requireOrgOwner } from "../../../utils/organizations";

/**
 * Deletes an organization along with its members, invites and listings. Posters
 * are untouched, because they belong to the people who shared them. A hidden
 * organization can't be deleted, so a moderation decision stays on record.
 */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const { session } = await requireOrgOwner(event, organizationId);

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { hiddenAt: true },
  });

  if (organization.hiddenAt) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "This organization was hidden by the Posters.science team. Contact us if you need it removed.",
    });
  }

  await prisma.organization.delete({ where: { id: organizationId } });

  logwatch.info({
    action: "organization.delete",
    message: "Organization deleted by an owner",
    userId: session.user.id,
    organizationId,
  });

  return { success: true };
});
