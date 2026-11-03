import { requireFeature } from "../../utils/features";

// TEMPORARY SHOWCASE: remove this route after done testing
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "private, no-store");
  await requireUserSession(event);
  requireFeature("bulk_extraction", event);

  const config = useRuntimeConfig(event);
  const environment = config.siteEnv || config.public.siteEnv || "development";

  return {
    feature: "bulk_extraction",
    environment,
    temporary: true,
    message: `Hello world! Bulk extraction is enabled for ${environment}.`,
  };
});
