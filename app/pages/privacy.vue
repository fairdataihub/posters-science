<script setup lang="ts">
useSeoMeta({
  title: "Privacy Policy - Posters.Science",
  description:
    "How the Posters.Science platform collects, uses, and protects personal information related to the use of the platform.",
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
