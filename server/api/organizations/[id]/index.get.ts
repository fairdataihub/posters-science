import {
  myOrganizationSelect,
  requireOrgMember,
  toMyOrganization,
} from "../../../utils/organizations";

/** One organization, for its members. */
export default defineEventHandler(async (event) => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const { role } = await requireOrgMember(event, organizationId);

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: myOrganizationSelect,
  });

  return toMyOrganization(organization, role);
});
