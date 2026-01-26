import { z } from "zod";

const {
  ZENODO_ENDPOINT,
  ZENODO_CLIENT_ID,
  ZENODO_CLIENT_SECRET,
  ZENODO_REDIRECT_URI,
} = process.env;

if (
  !ZENODO_ENDPOINT ||
  !ZENODO_CLIENT_ID ||
  !ZENODO_CLIENT_SECRET ||
  !ZENODO_REDIRECT_URI
) {
  throw new Error("Zenodo OAuth configuration is missing");
}

const payloadSchema = z.object({
  posterId: z.string(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const query = getQuery(event);
  const { posterId } = payloadSchema.parse(query);

  const { user } = session;
  const userId = user.id;

  // Provide URL to initiate OAuth flow
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ZENODO_CLIENT_ID,
    redirect_uri: ZENODO_REDIRECT_URI,
    state: posterId,
    scope: "deposit:write deposit:actions",
  });

  const zenodoLoginURL = `${ZENODO_ENDPOINT}/oauth/authorize?${params.toString()}`;
  const { zenodoToken, message, existingDepositions } =
    await validateZenodoToken(userId);

  return { zenodoLoginURL, zenodoToken, message, existingDepositions };
});
