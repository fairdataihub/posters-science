import type { H3Event } from "h3";
import type { User } from "#shared/generated/client";

type SessionUserSource = Pick<
  User,
  "id" | "emailAddress" | "emailVerified" | "familyName" | "givenName" | "role"
>;

/**
 * Starts a session for a user who has already proven who they are. Every
 * sign-in method (password today, ORCID next) goes through here so the session
 * always carries the same fields.
 */
export async function createUserSession(
  event: H3Event,
  user: SessionUserSource,
) {
  await setUserSession(event, {
    loggedInAt: new Date(),
    user: {
      id: user.id,
      emailAddress: user.emailAddress,
      emailVerified: user.emailVerified,
      familyName: user.familyName,
      givenName: user.givenName,
      role: user.role,
    },
    userSessionField: "",
  });
}
