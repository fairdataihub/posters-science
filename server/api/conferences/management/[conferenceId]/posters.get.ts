import { listConferencePostersForUser } from "~~/server/utils/mockConferencePosters";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const conferenceId = getRouterParam(event, "conferenceId");

  if (!conferenceId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conference id is required",
    });
  }

  const posters = listConferencePostersForUser(
    conferenceId,
    session.user.id,
  );

  return { data: posters };
});
