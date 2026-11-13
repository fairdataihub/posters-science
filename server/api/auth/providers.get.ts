import { orcidSignInConfig } from "../../utils/orcidSignIn";

// Public. Tells the login, signup and Settings pages which sign-in methods are
// set up here, so a button only shows when it can work. Pauses are separate,
// in /api/maintenance.
export default defineEventHandler(() => {
  return { orcid: orcidSignInConfig() !== null };
});
