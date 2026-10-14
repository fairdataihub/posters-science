import { z } from "zod";
import {
  PROFILE_AFFILIATION_MAX,
  PROFILE_BIO_MAX,
} from "#shared/utils/profile";

const updateUserSchema = z.object({
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  affiliation: z.string().trim().max(PROFILE_AFFILIATION_MAX).optional(),
  bio: z.string().trim().max(PROFILE_BIO_MAX).optional(),
  profilePublic: z.boolean().optional(),
  profileShowLikes: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;

  const body = await readValidatedBody(event, (b) =>
    updateUserSchema.safeParse(b),
  );

  if (!body.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid profile data",
      data: z.treeifyError(body.error).toString(),
    });
  }

  const { data } = body;
  const updatePayload: {
    givenName?: string;
    familyName?: string;
    affiliation?: string;
    bio?: string;
    profilePublic?: boolean;
    profileShowLikes?: boolean;
  } = {};

  if (data.givenName !== undefined) updatePayload.givenName = data.givenName;
  if (data.familyName !== undefined) updatePayload.familyName = data.familyName;
  if (data.affiliation !== undefined)
    updatePayload.affiliation = data.affiliation;
  if (data.bio !== undefined) updatePayload.bio = data.bio;
  if (data.profilePublic !== undefined)
    updatePayload.profilePublic = data.profilePublic;
  if (data.profileShowLikes !== undefined)
    updatePayload.profileShowLikes = data.profileShowLikes;

  // The profile address is created the first time the profile goes public
  // and then kept, so links people already shared keep working.
  if (data.profilePublic) {
    await ensureProfileId(userId);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updatePayload,
    select: {
      id: true,
      givenName: true,
      familyName: true,
      affiliation: true,
      bio: true,
      profilePublic: true,
      profileShowLikes: true,
      profileId: true,
      created: true,
      updated: true,
    },
  });

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: "User not found",
    });
  }

  return { ...user, profilePath: publicProfilePath(user) };
});
