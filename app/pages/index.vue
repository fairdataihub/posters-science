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
