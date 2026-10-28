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
  const posterIdInt = Number.parseInt(posterId, 10);
  const poster = Number.isFinite(posterIdInt)
    ? await prisma.poster.findFirst({
        where: { id: posterIdInt, userId },
        select: {
          id: true,
          versionRootId: true,
          versionSequence: true,
          zenodoDepositions: { select: { depositionId: true, status: true } },
        },
      })
    : null;
  const previousVersion = poster?.versionRootId
    ? await prisma.poster.findFirst({
        where: {
          userId,
          status: "published",
          versionSequence: { lt: poster.versionSequence },
          ...posterFamilyWhere(poster.versionRootId),
        },
        orderBy: { versionSequence: "desc" },
        select: { posterMetadata: { select: { license: true } } },
      })
    : null;
  const suggestedLicense =
    previousVersion?.posterMetadata?.license ?? undefined;
  let linkedDepositionId =
    poster?.zenodoDepositions?.status === "draft"
      ? poster.zenodoDepositions.depositionId
      : undefined;
  let linkedDeposition:
    | {
        id: number;
        title: string;
        version?: string;
        doi?: string;
        url: string;
        isDraft: boolean;
      }
    | undefined;

  if (linkedDepositionId && poster) {
    const posterDetails = await prisma.poster.findUnique({
      where: { id: poster.id },
      select: {
        title: true,
        posterMetadata: { select: { version: true, doi: true } },
      },
    });
    linkedDeposition = {
      id: linkedDepositionId,
      title: posterDetails?.title ?? "Poster version draft",
      ...(posterDetails?.posterMetadata?.version && {
        version: posterDetails.posterMetadata.version,
      }),
      ...(posterDetails?.posterMetadata?.doi && {
        doi: posterDetails.posterMetadata.doi,
      }),
      url: `${config.zenodoEndpoint}/uploads/${linkedDepositionId}`,
      isDraft: true,
    };
  }

  if (!linkedDepositionId && poster?.versionRootId) {
    const predecessor = await prisma.poster.findFirst({
      where: {
        userId,
        status: "published",
        versionSequence: { lt: poster.versionSequence },
        ...posterFamilyWhere(poster.versionRootId),
      },
      orderBy: { versionSequence: "desc" },
      select: {
        title: true,
        posterMetadata: { select: { version: true, doi: true } },
        zenodoDepositions: {
          select: {
            depositionId: true,
            lastPublishedZenodoDoi: true,
          },
        },
      },
    });
    linkedDepositionId = predecessor?.zenodoDepositions?.depositionId;
    if (linkedDepositionId && predecessor) {
      linkedDeposition = {
        id: linkedDepositionId,
        title: predecessor.title,
        ...(predecessor.posterMetadata?.version && {
          version: predecessor.posterMetadata.version,
        }),
        ...((predecessor.zenodoDepositions?.lastPublishedZenodoDoi ??
          predecessor.posterMetadata?.doi) && {
          doi:
            predecessor.zenodoDepositions?.lastPublishedZenodoDoi ??
            predecessor.posterMetadata?.doi ??
            undefined,
        }),
        url: `${config.zenodoEndpoint}/records/${linkedDepositionId}`,
        isDraft: false,
      };
    }
  }

  // Check if Zenodo is configured. Both ways of connecting need the endpoints
  // and the key stored tokens are encrypted with.
  if (
    !config.zenodoEndpoint ||
    !config.zenodoApiEndpoint ||
    !isZenodoTokenEncryptionConfigured()
  ) {
    console.log("[Zenodo] Missing config:", {
      hasEndpoint: !!config.zenodoEndpoint,
      hasApiEndpoint: !!config.zenodoApiEndpoint,
      hasTokenEncryptionKey: isZenodoTokenEncryptionConfigured(),
    });

    return {
      zenodoConfigured: false,
      zenodoLoginURL: null,
      zenodoTokenSignIn: false,
      zenodoNewTokenUrl: null,
      zenodoTokensUrl: null,
      zenodoToken: false,
      message: "Zenodo integration is not configured",
      existingDepositions: [],
    };
  }

  // Each way of signing in has its own maintenance switch, so an admin can
  // pause OAuth while Zenodo's code exchange is failing
  // (zenodo/zenodo-rdm#1484) and leave personal access tokens on. Pausing both
  // turns Zenodo off, and the publish page then disables Zenodo altogether.
  const paused = new Set(
    (await getActiveMaintenance()).map((entry) => entry.key),
  );
  const zenodoTokenSignIn = !paused.has("zenodoToken");
  let zenodoLoginURL: string | null = null;

  if (paused.has("zenodoOAuth")) {
    console.log("[Zenodo] OAuth sign-in is paused for maintenance");
  } else if (!config.zenodoClientId || !config.zenodoRedirectUri) {
    // redirectUri is checked too: without it Zenodo rejects the authorize
    // request with a bare "invalid_request" that gives no hint about the cause.
    console.log("[Zenodo] OAuth sign-in unavailable, missing config:", {
      hasClientId: !!config.zenodoClientId,
      hasRedirectUri: !!config.zenodoRedirectUri,
    });
  } else {
    // Provide URL to initiate OAuth flow
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.zenodoClientId,
      redirect_uri: config.zenodoRedirectUri,
      state: posterId,
      scope: "deposit:write deposit:actions",
    });

    zenodoLoginURL = `${config.zenodoEndpoint}/oauth/authorize?${params.toString()}`;

    console.log(`[Zenodo] Authorize URL: ${zenodoLoginURL}`);
  }

  // Points at sandbox or production to match the API the token will be used
  // with, since a token from one is rejected by the other.
  const zenodoNewTokenUrl = `${config.zenodoEndpoint}/account/settings/applications/tokens/new/`;
  // Where the user deletes a personal access token on Zenodo
  const zenodoTokensUrl = `${config.zenodoEndpoint}/account/settings/applications/`;

  try {
    const {
      zenodoToken,
      message,
      existingDepositions,
      expiresAt,
      tokenType,
      personalTokenExpired,
    } = await validateZenodoToken(userId);

    return {
      zenodoConfigured: true,
      zenodoLoginURL,
      zenodoTokenSignIn,
      zenodoNewTokenUrl,
      zenodoTokensUrl,
      zenodoToken,
      // When we delete a connected personal access token, so the page can say so
      zenodoPersonalTokenExpiresAt:
        zenodoToken && tokenType === "personal" ? expiresAt : null,
      // True when this request deleted the user's expired personal token
      zenodoPersonalTokenExpired: personalTokenExpired ?? false,
      message,
      existingDepositions,
      linkedDepositionId,
      linkedDeposition,
      suggestedLicense,
      isVersion: Boolean(poster?.versionRootId),
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[Zenodo] Error validating token:", errorMessage, error);

    return {
      zenodoConfigured: true,
      zenodoLoginURL,
      zenodoTokenSignIn,
      zenodoNewTokenUrl,
      zenodoTokensUrl,
      zenodoToken: false,
      message: "Error connecting to Zenodo",
      existingDepositions: [],
    };
  }
});
