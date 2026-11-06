import type { OrganizationTeam } from "#shared/types/organization";
import { ORGANIZATION_INVITE_PENDING_MAX } from "#shared/utils/organization";
import { profilePath } from "#shared/utils/profile";
import {
  deleteExpiredOrganizationInvites,
  organizationPersonName,
  organizationSentInviteSelect,
  toOrganizationSentInvite,
} from "../../../../utils/organizationInvites";
import { requireOrgMember } from "../../../../utils/organizations";

/**
 * The members of an organization, for its members. The list is never public.
 * Owners also get email addresses and the pending invites.
 */
export default defineEventHandler(async (event): Promise<OrganizationTeam> => {
  const organizationId = getRouterParam(event, "id") ?? "";
  const { session, role } = await requireOrgMember(event, organizationId);
  const isOwner = role === "owner";

  if (isOwner) await deleteExpiredOrganizationInvites({ organizationId });

  const [members, invites] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { created: "asc" },
      select: {
        role: true,
        created: true,
        user: {
          select: {
            id: true,
            givenName: true,
            familyName: true,
            emailAddress: true,
            profilePublic: true,
            profileId: true,
          },
        },
      },
    }),
    isOwner
      ? prisma.organizationInvite.findMany({
          where: { organizationId },
          orderBy: { created: "asc" },
          select: organizationSentInviteSelect,
        })
      : Promise.resolve([]),
  ]);

  return {
    role,
    ownerCount: members.filter((member) => member.role === "owner").length,
    members: members.map((member) => ({
      userId: member.user.id,
      name: organizationPersonName(member.user),
      emailAddress: isOwner ? member.user.emailAddress : null,
      role: member.role as OrganizationTeam["role"],
      joined: member.created.toISOString(),
      isMe: member.user.id === session.user.id,
      profilePath:
        member.user.profilePublic && member.user.profileId
          ? profilePath(member.user.profileId)
          : null,
    })),
    invites: invites.map(toOrganizationSentInvite),
    inviteLimit: ORGANIZATION_INVITE_PENDING_MAX,
  };
});
