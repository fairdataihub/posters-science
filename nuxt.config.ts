// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
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
  ],
  // Runtime config values can be overridden at container startup using NUXT_ prefixed env vars.
  // This works because Nuxt scans for NUXT_* env vars when the app starts (not at build time)
  // and automatically maps them to runtimeConfig keys:
  //   - NUXT_POSTER_EXTRACTION_API -> runtimeConfig.posterExtractionApi
  //   - NUXT_ZENODO_CLIENT_ID -> runtimeConfig.zenodoClientId
  // Using process.env.XXX here would bake values at build time, making them unchangeable at runtime.
  runtimeConfig: {
    emailVerificationDomain: "",
    mailFrom: "noreply@example.com",
    mailHost: "smtp.example.com",
    mailPass: "",
    mailPort: "587",
    mailUser: "",
    zenodoClientId: "",
    zenodoClientSecret: "",
    zenodoRedirectUri: "",
    zenodoApiEndpoint: "",
    zenodoEndpoint: "",
    posterExtractionApi: "",
    warningDmpApi: "",
    public: {
      enableEmailVerification: false,
      baseUrl: "",
      environment: "",
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
  image: {
    // Options
  },
});
