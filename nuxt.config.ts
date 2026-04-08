// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          async: true,
          "data-website-id":
            process.env.NUXT_SITE_ENV === "production"
              ? "d158bfbd-fc6c-4707-9fad-5b91d487fcd3"
              : "2af39e23-23fe-4a82-9fb5-dae97dec61b3",
          src: "https://umami.fairdataihub.org/mushroom",
        },
      ],
    },
  },
  compatibilityDate: "2025-01-16",
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  dayjs: {
    defaultLocale: "en",
    defaultTimezone: "America/Los_Angeles",
    plugins: ["relativeTime", "utc", "timezone"],
  },
  modules: [
    "@nuxt/ui",
    "nuxt-auth-utils",
    "dayjs-nuxt",
    "@nuxt/eslint",
    "@nuxt/image",
    "nuxt-echarts",
    "@nuxt/content",
  ],
  // Runtime config values can be overridden at container startup using NUXT_ prefixed env vars.
  // This works because Nuxt scans for NUXT_* env vars when the app starts (not at build time)
  // and automatically maps them to runtimeConfig keys:
  //   - NUXT_POSTER_EXTRACTION_API -> runtimeConfig.posterExtractionApi
  //   - NUXT_ZENODO_CLIENT_ID -> runtimeConfig.zenodoClientId
  // Using process.env.XXX here would bake values at build time, making them unchangeable at runtime.
  runtimeConfig: {
    resendApiKey: "",
    siteUrl: "http://localhost:3000",
    zenodoClientId: "",
    zenodoClientSecret: "",
    zenodoRedirectUri: "",
    zenodoApiEndpoint: "",
    zenodoEndpoint: "",
    posterExtractionApi: "",
    bunnyPrivateStorage: "",
    bunnyPrivateStorageKey: "",
    bunnyPublicStorage: "",
    bunnyPublicStorageKey: "",
    warningDmpApi: "",
    umamiUsername: "",
    umamiPassword: "",
    umamiWebsiteId: "",
    siteEnv: "",
    public: {
      baseUrl: "",
      siteEnv: "",
    },
  },
  eslint: {},
  echarts: {
    charts: ["BarChart", "PieChart", "LineChart"],
    components: [
      "DatasetComponent",
      "GridComponent",
      "TooltipComponent",
      "ToolboxComponent",
      "TitleComponent",
      "LegendComponent",
    ],
  },
  nitro: {
    moduleSideEffects: ["@prisma/client", ".prisma/client"],
    rollupConfig: {
      external: ["@prisma/client", ".prisma/client"],
    },
  },
  image: {
    // Options
  },
});
