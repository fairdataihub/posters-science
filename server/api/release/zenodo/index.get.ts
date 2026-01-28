import { z } from "zod";

const config = useRuntimeConfig();

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
    client_id: config.zenodoClientId,
    redirect_uri: config.zenodoRedirectUri,
    state: posterId,
    scope: "deposit:write deposit:actions",
  });

  const zenodoLoginURL = `${config.zenodoEndpoint}/oauth/authorize?${params.toString()}`;
  const { zenodoToken, message, existingDepositions } =
    await validateZenodoToken(userId);

  return { zenodoLoginURL, zenodoToken, message, existingDepositions };
});
