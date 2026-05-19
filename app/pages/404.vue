<script setup lang="ts">
const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Page Not Found - Posters.science")}&description=${encodeURIComponent("The requested Posters.science page could not be found")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Page Not Found",
  description: "The requested Posters.science page could not be found.",
  ogTitle: "Page Not Found - Posters.science",
  ogDescription: "The requested Posters.science page could not be found.",
  ogImage,
});
</script>

<template>
  <div class="p-6">
    <h1 class="mb-4 text-2xl font-bold">404</h1>

    <p>Page not found</p>
  </div>
</template>
