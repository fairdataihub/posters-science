import { z } from "zod";
import { organizationDetailsSchema } from "#shared/utils/organization";
import { logwatch } from "../../../utils/logwatch";
import {
  myOrganizationSelect,
  requireOrgOwner,
  toMyOrganization,
} from "../../../utils/organizations";

const updateSchema = organizationDetailsSchema.partial().extend({
  profilePublic: z.boolean().optional(),
  showMemberCount: z.boolean().optional(),
});

/**
 * Updates an organization's details, its visibility, or whether its public
 * page shows the member count. An admin's hide wins over profilePublic, so an
 * owner can't bring a hidden page back by toggling it.
 */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const { session, role } = await requireOrgOwner(event, organizationId);

  const body = await readValidatedBody(event, (b) => updateSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        body.error.issues[0]?.message ?? "Invalid organization details",
    });
  }

  const { name, description, websiteUrl, profilePublic, showMemberCount } =
    body.data;

  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(websiteUrl !== undefined && { websiteUrl }),
      ...(profilePublic !== undefined && { profilePublic }),
      ...(showMemberCount !== undefined && { showMemberCount }),
    },
    select: myOrganizationSelect,
  });

  if (profilePublic !== undefined) {
    logwatch.info({
      action: "organization.visibility",
      message: profilePublic
        ? "Organization made public"
        : "Organization made private",
      userId: session.user.id,
      organizationId,
    });
  }

  if (showMemberCount !== undefined) {
    logwatch.info({
      action: "organization.member_count",
      message: showMemberCount
        ? "Member count shown on the public page"
        : "Member count hidden from the public page",
      userId: session.user.id,
      organizationId,
    });
  }

  return toMyOrganization(organization, role);
});
