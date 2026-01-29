<script setup lang="ts">
useSeoMeta({
  title: "Coming Summer 2026",
});

const links = ref([
  {
    label: "Find Posters",
    to: "/docs/getting-started",
    size: "xl" as const,
    trailingIcon: "ic:outline-saved-search",
  },
  {
    label: "Share a Poster",
    to: "/login",
    size: "xl" as const,
    trailingIcon: "line-md:file-upload",
    variant: "outline" as const,
  },
]);
</script>

<template>
  <section>
    <UPageHero
      title="About the Project"
      description="Posters.science is a platform for discovering and sharing posters on a variety of topics. It is a project of the FAIR Data Innovations Hub."
      :links="links"
    />
  </section>
</template>
