<script setup lang="ts">
const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("FAQ - Posters.science")}&description=${encodeURIComponent("Answers to common questions about Posters.science")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "FAQ - Posters.science",
  description:
    "Answers to common questions about finding, sharing and claiming scientific posters on Posters.science.",
  ogTitle: "FAQ - Posters.science",
  ogDescription:
    "Answers to common questions about finding, sharing and claiming scientific posters on Posters.science.",
  ogImage,
});

const { data: faq } = await useAsyncData(() =>
  queryCollection("content").path("/faq").first(),
);

if (!faq.value) {
  throw showError({ statusCode: 404, statusMessage: "Page not found" });
}
</script>

<template>
  <UContainer class="py-12">
    <ContentRenderer :value="faq!" />
  </UContainer>
</template>
