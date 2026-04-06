<script setup lang="ts">
const colorMode = useColorMode();

useHead({
  htmlAttrs: {
    lang: "en",
  },
  script: [
    {
      defer: true,
      src: "https://umami.fairdataihub.org/mushroom",
      "data-website-id": "2af39e23-23fe-4a82-9fb5-dae97dec61b3",
      "data-exclude-search": true,
    },
  ],
  link: [
    { href: "/favicon.ico", rel: "shortcut icon" },
    { href: "/favicon-96x96.png", rel: "icon", sizes: "96x96" },
    { href: "/favicon.svg", rel: "icon", type: "image/svg+xml" },
    {
      href: "/apple-touch-icon.png",
      rel: "apple-touch-icon",
      sizes: "180x180",
    },
    { href: "/site.webmanifest", rel: "manifest" },
  ],
  meta: [
    { charset: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "apple-mobile-web-app-title", content: "Posters.science" },
    {
      name: "theme-color",
      content: colorMode.value === "dark" ? "#111827" : "white",
      key: "theme-color",
    },
  ],
});

useSeoMeta({
  ogImage:
    "https://kalai.fairdataihub.org/api/generate?title=Hello&description=This%20is%20a%20Nuxt%20starter%20template&app=fairdataihub&org=fairdataihub",
  titleTemplate: "%s - Posters.science",
  twitterCard: "summary_large_image",
  twitterImage:
    "https://kalai.fairdataihub.org/api/generate?title=Hello&description=This%20is%20a%20Nuxt%20starter%20template&app=fairdataihub&org=fairdataihub",
});
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
