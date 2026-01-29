import { z } from "zod";

const config = useRuntimeConfig();

const payloadSchema = z.object({
  posterId: z.string(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  // Read query parameters for GET requests
  const query = getQuery(event);
  const { posterId } = payloadSchema.parse(query as Record<string, unknown>);

  const { user } = session;
  const userId = user.id;

  // Check if Zenodo is configured
  if (
    !config.zenodoClientId ||
    !config.zenodoEndpoint ||
    !config.zenodoApiEndpoint
  ) {
    console.log("[Zenodo] Missing config:", {
      hasClientId: !!config.zenodoClientId,
      hasEndpoint: !!config.zenodoEndpoint,
      hasApiEndpoint: !!config.zenodoApiEndpoint,
    });

    return {
      zenodoLoginURL: null,
      zenodoToken: false,
      message: "Zenodo integration is not configured",
      existingDepositions: [],
    };
  }

  // Provide URL to initiate OAuth flow
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.zenodoClientId,
    redirect_uri: config.zenodoRedirectUri,
    state: posterId,
    scope: "deposit:write deposit:actions",
  });

  const zenodoLoginURL = `${config.zenodoEndpoint}/oauth/authorize?${params.toString()}`;

  try {
    const { zenodoToken, message, existingDepositions } =
      await validateZenodoToken(userId);

    return {
      zenodoLoginURL,
      zenodoToken,
      message,
      existingDepositions,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[Zenodo] Error validating token:", errorMessage, error);

    return {
      zenodoLoginURL,
      zenodoToken: false,
      message: "Error connecting to Zenodo",
      existingDepositions: [],
    };
  }
});
