<script setup lang="ts">
const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("About - Posters.science")}&description=${encodeURIComponent("Posters.science is a platform for discovering and sharing scientific posters, a project by the FAIR Data Innovations Hub.")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "About - Posters.science",
  description:
    "Posters.science is a platform for discovering and sharing scientific posters, a project by the FAIR Data Innovations Hub.",
  ogTitle: "About - Posters.science",
  ogDescription:
    "Posters.science is a platform for discovering and sharing scientific posters, a project by the FAIR Data Innovations Hub.",
  ogImage,
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
