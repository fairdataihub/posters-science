import { organizationDetailsSchema } from "#shared/utils/organization";
import { logwatch } from "../../utils/logwatch";
import {
  myOrganizationSelect,
  toMyOrganization,
  withNewOrganizationProfileId,
} from "../../utils/organizations";

const createSchema = organizationDetailsSchema.partial({
  description: true,
  websiteUrl: true,
});

/**
 * Creates an organization with the signed-in user as its owner. It stays private
 * until an owner makes it public, and a person can own any number of them.
 */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) => createSchema.safeParse(b));

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage:
        body.error.issues[0]?.message ?? "Invalid organization details",
    });
  }

  const organization = await withNewOrganizationProfileId((profileId) =>
    prisma.organization.create({
      data: {
        profileId,
        name: body.data.name,
        description: body.data.description ?? "",
        websiteUrl: body.data.websiteUrl ?? "",
        members: { create: { userId, role: "owner" } },
      },
      select: myOrganizationSelect,
    }),
  );

  logwatch.info({
    action: "organization.create",
    message: "Organization created",
    userId,
    organizationId: organization.id,
  });

  return toMyOrganization(organization, "owner");
});
