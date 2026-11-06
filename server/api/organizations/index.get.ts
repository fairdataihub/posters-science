import type { OrganizationRole } from "#shared/types/organization";
import {
  myOrganizationSelect,
  toMyOrganization,
} from "../../utils/organizations";

/** The organizations the signed-in user belongs to, newest first. */
export default defineEventHandler(async (event) => {
  const session = await requireDbUserSession(event);

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: session.user.id },
    orderBy: { created: "desc" },
    select: {
      role: true,
      organization: { select: myOrganizationSelect },
    },
  });

  return {
    organizations: memberships.map((membership) =>
      toMyOrganization(
        membership.organization,
        membership.role as OrganizationRole,
      ),
    ),
  };
});
