<script setup lang="ts">
const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Privacy Policy - Posters.science")}&description=${encodeURIComponent("How Posters.science collects, uses, and protects personal information")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Privacy Policy - Posters.science",
  description:
    "How the Posters.science platform collects, uses, and protects personal information related to the use of the platform.",
  ogTitle: "Privacy Policy - Posters.science",
  ogDescription:
    "How the Posters.science platform collects, uses, and protects personal information related to the use of the platform.",
  ogImage,
});

const { data: privacy } = await useAsyncData(() =>
  queryCollection("content").path("/privacy").first(),
);

if (!privacy.value) {
  throw showError({ statusCode: 404, statusMessage: "Page not found" });
}
</script>

<template>
  <UContainer class="py-12">
    <ContentRenderer :value="privacy!" />
  </UContainer>
</template>
