export default defineSitemapEventHandler(async () => {
  const {
    public: { siteEnv },
  } = useRuntimeConfig();

  if (siteEnv === "staging") {
    return [];
  }

  try {
    const posters = await prisma.poster.findMany({
      where: {
        status: "published",
        tombstone: false,
        isLatestVersion: true,
      },
      select: {
        id: true,
        updated: true,
        imageUrl: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    return posters.map((poster) => ({
      loc: `/discover/${poster.id}`,
      ...(poster.updated && {
        lastmod: poster.updated.toISOString(),
      }),
      ...(poster.imageUrl && {
        images: [
          {
            loc: poster.imageUrl,
          },
        ],
      }),
    }));
  } catch (error) {
    console.error("Failed to generate poster sitemap:", error);

    return [];
  }
});
