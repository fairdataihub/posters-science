<script setup lang="ts">
useSeoMeta({
  title: "Terms of Use - Posters.Science",
  description:
    "Terms and conditions governing the use of the Posters.Science platform and associated services.",
});

const { data: terms } = await useAsyncData(() =>
  queryCollection("content").path("/terms").first(),
);
</script>

<template>
  <UContainer class="py-12">
    <ContentRenderer v-if="terms" :value="terms" />

    <div v-else>Document not found</div>
  </UContainer>
</template>
