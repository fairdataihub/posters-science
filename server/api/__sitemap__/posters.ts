export default defineSitemapEventHandler(async () => {
  // Fetch all published posters
  console.log("Fetching published posters for sitemap...");
  let posters = [];
  try {
    posters = await prisma.poster.findMany({
      where: { status: "published" },
      select: { id: true },
    });
  } catch (error) {
    console.error("Error fetching posters for sitemap:", error);

    return [];
  }

  console.log(
    `Found ${posters.length} published posters for sitemap generation.`,
  );

  return posters.map((poster) => ({
    loc: `/discover/${poster.id}`,
  }));
});
