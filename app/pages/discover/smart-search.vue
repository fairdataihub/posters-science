<script setup lang="ts">
useSeoMeta({
  title: "Smart Search",
  description: "Smart search for posters",
});
</script>

<template>
  <div
    class="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-6 px-6 py-16"
  >
    <UPageCTA
      title="Smart Search"
      description="Find answers to your research questions using natural language. This feature is coming soon!"
      variant="naked"
    >
      <template #body>
        <div class="flex flex-col items-center gap-4">
          <UBadge color="primary" variant="soft" size="lg" icon="si:ai-fill">
            Coming soon
          </UBadge>

          <p class="max-w-md text-center text-sm text-gray-500">
            We are working on a smart search feature that uses AI to instantly
            answer your research questions using content from the most relevant
            posters.
          </p>
        </div>
      </template>
    </UPageCTA>
  </div>
</template>
