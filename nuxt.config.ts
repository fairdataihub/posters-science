// https://nuxt.com/docs/api/configuration/nuxt-config
// Protected routes that should not be indexed by search engines or crawlers.
const PROTECTED_ROUTES = [
  "/admin",
  "/api",
  "/dashboard",
  "/forgot-password",
  "/liked",
  "/login",
  "/profile",
  "/reset-password",
  "/share/new",
  "/signup",
  "/verify-email",
  "/zenodo-auth-error",
  "/404",
];

export default defineNuxtConfig({
  compatibilityDate: "2025-01-16",
  css: ["~/assets/css/main.css"],
  dayjs: {
    defaultLocale: "en",
    defaultTimezone: "America/Los_Angeles",
    plugins: ["relativeTime", "utc", "timezone"],
  },
  devtools: { enabled: true },
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
  eslint: {},
  icon: {
    collections: [
      "heroicons",
      "lucide",
      "material-symbols",
      "simple-icons",
      "vscode-icons",
    ],
  },
  image: {
    // Options
  },
  modules: [
    "@nuxt/ui",
    "nuxt-auth-utils",
    "dayjs-nuxt",
    "@nuxt/eslint",
    "@nuxt/image",
    "nuxt-echarts",
    "@nuxt/content",
    "@nuxtjs/robots",
    "@nuxtjs/sitemap",
    "nuxt-schema-org",
  ],
  nitro: {
    moduleSideEffects: ["@prisma/client", ".prisma/client"],
    rollupConfig: {
      external: ["@prisma/client", ".prisma/client"],
    },
    experimental: {
      openAPI: true,
    },
    openAPI: {
      meta: {
        title: "Posters.science API Documentation",
        description: "API Documentation for Posters.science",
      },
      route: "/_docs/openapi.json",
    },
  },
  robots: {
    groups: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PROTECTED_ROUTES,
        contentUsage: {
          bots: "y",
          "train-ai": "n",
          "ai-output": "n",
          search: "y",
        },
        contentSignal: {
          search: "yes",
          "ai-input": "no",
          "ai-train": "no",
        },
      },
    ],
  },
  site: {
    url: process.env.NUXT_SITE_URL || "http://localhost:3000",
    name: "Posters.science",
  },
  sitemap: {
    sitemaps: {
      pages: {
        includeAppSources: true,
        exclude: PROTECTED_ROUTES,
      },
      posters: {
        sources: ["/api/__sitemap__/posters"],
        chunks: 10000, // Chunk size should be increased to 25000 once total poster count exceeds 100k
      },
    },
    experimental: {
      openAPI: true,
    },
    openAPI: {
      meta: {
        title: "Posters.science API Documentation",
        description: "API Documentation for Posters.science",
      },
      route: "/_docs/openapi.json",
    },
  },
  // Runtime config values can be overridden at container startup using NUXT_ prefixed env vars.
  // This works because Nuxt scans for NUXT_* env vars when the app starts (not at build time)
  // and automatically maps them to runtimeConfig keys:
  //   - NUXT_POSTER_EXTRACTION_API -> runtimeConfig.posterExtractionApi
  //   - NUXT_ZENODO_CLIENT_ID -> runtimeConfig.zenodoClientId
  // Using process.env.XXX here would bake values at build time, making them unchangeable at runtime.
  runtimeConfig: {
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || "",
      maxAge: 60 * 60 * 24 * 7, // 1 week in seconds
    },
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
  vite: {
    optimizeDeps: {
      include: [
        "@inspira-ui/plugins", // CJS
        "@internationalized/date",
        "clsx",
        "dayjs", // CJS
        "dayjs/plugin/relativeTime", // CJS
        "dayjs/plugin/timezone", // CJS
        "dayjs/plugin/updateLocale", // CJS
        "dayjs/plugin/utc", // CJS
        "motion-v",
        "vue3-lottie",
        "zod",
      ],
    },
  },
});
