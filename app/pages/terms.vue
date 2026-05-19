<script setup lang="ts">
const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Terms of Use - Posters.science")}&description=${encodeURIComponent("Terms and conditions for using the Posters.science platform")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Terms of Use - Posters.science",
  description:
    "Terms and conditions governing the use of the Posters.science platform and associated services.",
  ogTitle: "Terms of Use - Posters.science",
  ogDescription:
    "Terms and conditions governing the use of the Posters.science platform and associated services.",
  ogImage,
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
