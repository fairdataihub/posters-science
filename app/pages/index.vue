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
      title="The best way to discover and share posters"
      description="Posters.Science is a platform for discovering and sharing posters on a variety of topics."
      headline="Releasing in Summer 2026"
      orientation="horizontal"
      :links="links"
    >
      <img
        src="https://picsum.photos/1000/1000"
        alt="App screenshot"
        class="ring-default rounded-lg shadow-2xl ring"
      />
    </UPageHero>
  </section>
</template>
