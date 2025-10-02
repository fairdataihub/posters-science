<script setup lang="ts">
const colorMode = useColorMode();

useHead({
  htmlAttrs: {
    lang: "en",
  },
  link: [{ href: "/favicon.ico", rel: "icon" }],
  meta: [
    { charset: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
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
