<template>
  <div id="api-reference" data-url="/_docs/openapi.json" />
</template>

<script setup lang="ts">
definePageMeta({ layout: false });

useHead({
  title: "API Documentation - Posters.science",
  script: [
    {
      src: "https://cdn.jsdelivr.net/npm/@scalar/api-reference",
      defer: true,
    },
  ],
  style: [{ children: "body { margin: 0 }" }],
});
</script>
