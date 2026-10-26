import { z } from "zod";
import {
  PROFILE_AFFILIATION_MAX,
  PROFILE_BIO_MAX,
} from "#shared/utils/profile";
import { isValidOrcidChecksum, validateOrcidExists } from "#shared/utils/orcid";
import { normalizeOrcid } from "#shared/utils/discoverSearch";

const updateUserSchema = z.object({
  // Names can be changed but never cleared.
  givenName: z.string().trim().min(1, "First name is required").optional(),
  familyName: z.string().trim().min(1, "Last name is required").optional(),
  affiliation: z.string().trim().max(PROFILE_AFFILIATION_MAX).optional(),
  bio: z.string().trim().max(PROFILE_BIO_MAX).optional(),
  // A bare iD or an orcid.org link. Empty clears it.
  orcid: z.string().trim().max(100).optional(),
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
    orcid?: string;
    profilePublic?: boolean;
    profileShowLikes?: boolean;
  } = {};

  if (data.givenName !== undefined) updatePayload.givenName = data.givenName;
  if (data.familyName !== undefined) updatePayload.familyName = data.familyName;
  if (data.affiliation !== undefined)
    updatePayload.affiliation = data.affiliation;
  if (data.bio !== undefined) updatePayload.bio = data.bio;
  if (data.orcid !== undefined) {
    updatePayload.orcid = await checkedOrcid(userId, data.orcid);
  }
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
      orcid: true,
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

/**
 * The bare iD to store for `input`, or "" to clear it. Throws a 400 when the
 * iD is malformed, or when it is new and ORCID has no record of it.
 */
async function checkedOrcid(userId: string, input: string): Promise<string> {
  if (!input) return "";

  if (!isValidOrcidChecksum(input)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Enter a valid ORCID iD, such as 0000-0002-1825-0097 or its orcid.org link",
      data: { reason: "orcid_invalid" },
    });
  }

  const orcid = normalizeOrcid(input);

  // Only a changed iD is looked up, so saving the rest of the profile doesn't
  // call ORCID every time.
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { orcid: true },
  });

  if (current?.orcid !== orcid && !(await validateOrcidExists(orcid))) {
    throw createError({
      statusCode: 400,
      statusMessage: `ORCID has no record of ${orcid}. Check the iD and try again.`,
      data: { reason: "orcid_not_found" },
    });
  }

  return orcid;
}
