import {
  listManagedConferencesForUser,
} from "~~/server/utils/mockManagedConferences";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const conferences = listManagedConferencesForUser(session.user.id);

  return { data: conferences };
});
