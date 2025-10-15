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
  runtimeConfig: {
    emailVerificationDomain: process.env.EMAIL_VERIFICATION_DOMAIN || "",
    mailFrom: process.env.MAIL_FROM || "noreply@example.com",
    mailHost: process.env.MAIL_HOST || "smtp.example.com",
    mailPass: process.env.MAIL_PASS || "password",
    mailPort: process.env.MAIL_PORT || "587",
    mailUser: process.env.MAIL_USER || "user",
    public: {
      ENABLE_EMAIL_VERIFICATION: process.env.ENABLE_EMAIL_VERIFICATION
        ? process.env.ENABLE_EMAIL_VERIFICATION === "true"
        : false,
      baseUrl: process.env.NUXT_SITE_URL,
      environment: process.env.NUXT_SITE_ENV,
    },
  },
  eslint: {},
  echarts: {
    charts: ["BarChart", "PieChart"],
    components: [
      "DatasetComponent",
      "GridComponent",
      "TooltipComponent",
      "ToolboxComponent",
      "TitleComponent",
    ],
  },
  image: {
    // Options
  },
});
