<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
  fitViewport: true,
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Share Posters - Posters.science")}&description=${encodeURIComponent("Choose how you want to share your posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Share Posters",
  description: "Share a single poster, or submit a conference's posters together.",
  ogTitle: "Share Posters - Posters.science",
  ogDescription: "Share a single poster, or submit a conference's posters together.",
  ogImage,
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 pb-8">
    <UPageHeader
      title="How would you like to share?"
      :ui="{ root: 'py-4' }"
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Share Posters', to: '/share' },
          ]"
        />
      </template>
    </UPageHeader>

    <SharePostersChooserCards />
  </div>
</template>
