// What the Figshare publish form needs: how the user can connect, whether
// they are connected, and the licenses and categories their account offers.
import { z } from "zod";
import type {
  FigshareCategory,
  FigshareLicense,
} from "~~/server/utils/figshareClient";

const querySchema = z.object({
  posterId: z.string().regex(/^\d+$/),
});

// figshare.com accounts all see the same licenses and categories, and an
// institution's accounts share theirs, so both are cached per institution.
const OPTIONS_TTL_MS = 60 * 60 * 1000;
const optionsCache = new Map<
  number,
  {
    at: number;
    licenses: FigshareLicense[];
    categories: FigshareCategory[];
  }
>();

async function accountOptions(token: string, institutionId: number) {
  const cached = optionsCache.get(institutionId);

  if (cached && Date.now() - cached.at < OPTIONS_TTL_MS) return cached;

  const client = figshareClientFor(token);
  const licenses = await client.licenses();
  const categories = await client.categories();
  const entry = { at: Date.now(), licenses, categories };

  optionsCache.set(institutionId, entry);

  return entry;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = session.user.id;
  const parsed = querySchema.safeParse(getQuery(event));

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Missing poster" });
  }

  const posterId = Number(parsed.data.posterId);
  const poster = await prisma.poster.findFirst({
    where: { id: posterId, userId },
    include: {
      posterMetadata: true,
      figshareDeposition: true,
      zenodoDepositions: { select: { status: true } },
    },
  });

  if (!poster) {
    throw createError({ statusCode: 404, statusMessage: "Poster not found" });
  }

  // Versions stay in the repository their family is in.
  let familyRepository: "zenodo" | "figshare" | null = null;
  let familyArticleId: number | undefined;

  if (poster.versionRootId) {
    const latest = await prisma.poster.findFirst({
      where: {
        status: "published",
        versionSequence: { lt: poster.versionSequence },
        ...posterFamilyWhere(poster.versionRootId),
      },
      orderBy: { versionSequence: "desc" },
      select: {
        figshareDeposition: { select: { articleId: true } },
        zenodoDepositions: { select: { depositionId: true } },
      },
    });

    if (latest?.figshareDeposition) {
      familyRepository = "figshare";
      familyArticleId = latest.figshareDeposition.articleId;
    } else if (latest?.zenodoDepositions) {
      familyRepository = "zenodo";
    }
  }

  const paused = await isUnderMaintenance("figshare");
  const configured = isFigshareConfigured();
  const base = {
    configured,
    paused,
    oauthAvailable: configured && !paused && isFigshareOAuthConfigured(),
    tokenSignIn: configured && !paused,
    // Outside production, publishing stops at a private draft.
    draftOnly: isFigshareDraftOnly(),
    applicationsUrl: figshareApplicationsUrl(),
    familyRepository,
    isVersion: !!poster.versionRootId,
    linked: poster.figshareDeposition
      ? {
          articleId: poster.figshareDeposition.articleId,
          status: poster.figshareDeposition.status,
          url: poster.figshareDeposition.publicUrl,
        }
      : null,
  };

  if (!configured || paused) {
    return { ...base, connected: false };
  }

  const status = await getFigshareConnectionStatus(userId);
  const { token, rawAccount, ...connection } = status;

  if (!status.connected || !token || !rawAccount) {
    return { ...base, ...connection };
  }

  let licenses: FigshareLicense[] = [];
  let categories: FigshareCategory[] = [];

  try {
    ({ licenses, categories } = await accountOptions(
      token,
      rawAccount.institution_id ?? 0,
    ));
  } catch (error) {
    console.warn(
      `[Figshare] Could not load licenses or categories: ${error instanceof Error ? error.message : error}`,
    );

    return {
      ...base,
      ...connection,
      optionsError:
        "We couldn't load your Figshare licenses and categories. Please try again in a few minutes.",
    };
  }

  // A new version starts from the categories the item already has.
  let suggestedCategoryIds: number[] = [];

  if (familyArticleId || poster.figshareDeposition) {
    try {
      const article = (await figshareClientFor(token).getArticle(
        poster.figshareDeposition?.articleId ?? familyArticleId!,
      )) as { categories?: { id: number }[] } | null;

      suggestedCategoryIds = (article?.categories ?? []).map(
        (category) => category.id,
      );
    } catch {
      // Only a suggestion.
    }
  }

  const suggestedLicense = matchFigshareLicense(
    poster.posterMetadata?.license,
    licenses,
  );

  // What the poster's metadata still lacks for Figshare. The license and
  // categories are chosen in the form, so they are filled in here.
  const missing = poster.posterMetadata
    ? buildFigshareArticle(poster, poster.posterMetadata, {
        categoryIds: [0],
        licenseId: 1,
      }).missing
    : ["The poster's metadata"];

  return {
    ...base,
    ...connection,
    licenses: licenses.map(({ value, name, url }) => ({ value, name, url })),
    categories: categories.map((category) => ({
      id: category.id,
      title: category.title,
      parentId: category.parent_id ?? null,
      path: category.path ?? null,
      selectable: category.is_selectable !== false,
    })),
    suggestedLicenseId: suggestedLicense?.value ?? null,
    suggestedCategoryIds,
    missing,
  };
});
