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

  // Check if Zenodo is configured
  // redirectUri is checked too: without it Zenodo rejects the authorize request
  // with a bare "invalid_request" that gives no hint about the cause.
  if (
    !config.zenodoClientId ||
    !config.zenodoEndpoint ||
    !config.zenodoApiEndpoint ||
    !config.zenodoRedirectUri
  ) {
    console.log("[Zenodo] Missing config:", {
      hasClientId: !!config.zenodoClientId,
      hasEndpoint: !!config.zenodoEndpoint,
      hasApiEndpoint: !!config.zenodoApiEndpoint,
      hasRedirectUri: !!config.zenodoRedirectUri,
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

  console.log(`[Zenodo] Authorize URL: ${zenodoLoginURL}`);

  try {
    const { zenodoToken, message, existingDepositions } =
      await validateZenodoToken(userId);

    return {
      zenodoLoginURL,
      zenodoToken,
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
      zenodoLoginURL,
      zenodoToken: false,
      message: "Error connecting to Zenodo",
      existingDepositions: [],
    };
  }
});
