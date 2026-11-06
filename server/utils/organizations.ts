import type { H3Event } from "h3";
import type { Prisma } from "#shared/generated/client";
import type { OrganizationRole } from "#shared/types/organization";
import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import { generateProfileId } from "#shared/utils/profile";

const ADDRESS_ATTEMPTS = 5;

/**
 * Runs a create with a new organization address. Ids are random, so a collision
 * is astronomically unlikely, but the unique index is the real guard and a clash
 * just draws a new id.
 */
export async function withNewOrganizationProfileId<T>(
  create: (profileId: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < ADDRESS_ATTEMPTS; attempt++) {
    try {
      return await create(generateProfileId());
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }

  throw createError({
    statusCode: 500,
    statusMessage:
      "Could not create an organization address. Please try again.",
  });
}

/**
 * The signed-in user's role in an organization. Someone outside it gets the same
 * 404 as an unknown id, so a private organization's existence is never revealed.
 */
export async function requireOrgMember(event: H3Event, organizationId: string) {
  const session = await requireDbUserSession(event);

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
    select: { role: true },
  });

  if (!membership) {
    throw createError({
      statusCode: 404,
      statusMessage: "Organization not found",
    });
  }

  return { session, role: membership.role as OrganizationRole };
}

export async function requireOrgOwner(event: H3Event, organizationId: string) {
  const access = await requireOrgMember(event, organizationId);

  if (access.role !== "owner") {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an owner of this organization can do this",
    });
  }

  return access;
}

export const myOrganizationSelect = {
  id: true,
  profileId: true,
  name: true,
  description: true,
  websiteUrl: true,
  profilePublic: true,
  hiddenAt: true,
  hiddenReason: true,
  created: true,
  _count: {
    select: {
      members: true,
      // Retired posters stay listed but are off the page, so they aren't counted.
      posters: { where: { poster: { tombstone: false } } },
    },
  },
} as const;

type MyOrganizationRow = {
  id: string;
  profileId: string;
  name: string;
  description: string;
  websiteUrl: string;
  profilePublic: boolean;
  hiddenAt: Date | null;
  hiddenReason: string;
  created: Date;
  _count: { members: number; posters: number };
};

export function toMyOrganization(
  organization: MyOrganizationRow,
  role: OrganizationRole,
) {
  return {
    id: organization.id,
    path: organizationPath(organization.profileId),
    avatarUrl: organizationAvatarUrl(organization.profileId),
    name: organization.name,
    description: organization.description,
    websiteUrl: organization.websiteUrl,
    profilePublic: organization.profilePublic,
    hidden: organization.hiddenAt !== null,
    hiddenReason: organization.hiddenReason,
    role,
    memberCount: organization._count.members,
    posterCount: organization._count.posters,
    created: organization.created,
  };
}

/**
 * Runs a change to an organization's members while holding its row, so two
 * owners stepping down at once can't leave it with none. The change gets the
 * owner count as it stands under the lock.
 */
export async function withOrganizationOwnersLocked<T>(
  organizationId: string,
  change: (tx: Prisma.TransactionClient, ownerCount: number) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;

    const ownerCount = await tx.organizationMember.count({
      where: { organizationId, role: "owner" },
    });

    return change(tx, ownerCount);
  });
}

export const ORGANIZATION_LAST_OWNER_MESSAGE =
  "An organization needs at least one owner. Make another member an owner first, or delete the organization.";
