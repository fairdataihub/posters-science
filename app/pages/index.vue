<script setup lang="ts">
useSeoMeta({
  title: "Coming Summer 2026",
});

const links = ref([
  {
    label: "Find Posters",
    to: "/discover",
    size: "xl" as const,
    trailingIcon: "ic:outline-saved-search",
  },
  {
    label: "Share a Poster",
    to: "/share/new",
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
      description="Posters.science is a platform for discovering and sharing scientific posters."
      headline="Releasing in Summer 2026"
      orientation="horizontal"
      :links="links"
    >
      <div class="relative inline-block">
        <img src="/assets/images/fairy.png" alt="Logo" class="block pl-16" />
        <!-- Glow effect behind the image -->
        <div
          class="bg-primary/20 absolute inset-0 -z-10 animate-pulse rounded-xl blur-3xl"
        />
      </div>
    </UPageHero>

    <p class="text-muted mx-auto mt-8 max-w-2xl text-center text-sm">
      The development of posters.science is supported by a grant from
      <a
        href="https://www.navigation.org/"
        target="_blank"
        class="text-primary hover:underline"
        >The Navigation Fund</a
      >
      (additional details about the grant can be found in the
      <a
        href="https://commons.datacite.org/doi.org/10.71707/rk36-9x79"
        target="_blank"
        class="text-primary hover:underline"
        >DataCite Commons grant record</a
      >).
    </p>
  </section>
</template>

<style scoped>
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
</style>
