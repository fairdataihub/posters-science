import { isIP } from "node:net";

type FigshareArticle = {
  figshare_url?: string;
  url_public_html?: string;
};

function trustedFigshareUrl(value: string | undefined, articleId: string) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "443") ||
      hostname === "localhost" ||
      !hostname.includes(".") ||
      isIP(hostname) !== 0 ||
      !url.pathname.endsWith(`/${articleId}`)
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const articleId = getRouterParam(event, "id")?.trim() ?? "";
  if (!/^\d+$/.test(articleId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid Figshare article ID",
    });
  }

  let article: FigshareArticle;
  try {
    article = await $fetch<FigshareArticle>(
      `https://api.figshare.com/v2/articles/${articleId}`,
      { retry: 1, timeout: 10_000 },
    );
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: "Unable to resolve the Figshare record",
    });
  }

  const publicUrl =
    trustedFigshareUrl(article.url_public_html, articleId) ??
    trustedFigshareUrl(article.figshare_url, articleId);
  if (!publicUrl) {
    throw createError({
      statusCode: 502,
      statusMessage: "Figshare did not provide a trusted public record URL",
    });
  }

  setResponseHeader(event, "Cache-Control", "public, max-age=86400");

  return sendRedirect(event, publicUrl, 302);
});
