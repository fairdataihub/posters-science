<script setup lang="ts">
useSeoMeta({
  title: "Terms of Use - Posters.science",
  description:
    "Terms and conditions governing the use of the Posters.science platform and associated services.",
});

const { data: terms } = await useAsyncData(() =>
  queryCollection("content").path("/terms").first(),
);

if (!terms.value) {
  throw showError({ statusCode: 404, statusMessage: "Page not found" });
}
</script>

<template>
  <UContainer class="py-12">
    <ContentRenderer :value="terms!" />
  </UContainer>
</template>
