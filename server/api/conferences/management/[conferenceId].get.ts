import { getManagedConferenceById } from "~~/server/utils/mockManagedConferences";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const conferenceId = getRouterParam(event, "conferenceId");

  if (!conferenceId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conference id is required",
    });
  }

  const conference = getManagedConferenceById(conferenceId, session.user.id);

  if (!conference) {
    throw createError({
      statusCode: 404,
      statusMessage: "Conference not found",
    });
  }

  return conference;
});
