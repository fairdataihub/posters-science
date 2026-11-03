<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Share Posters - Posters.science")}&description=${encodeURIComponent("Choose how many posters you want to share")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Share Posters",
  description: "Choose whether to share one poster or upload a batch.",
  ogTitle: "Share Posters - Posters.science",
  ogDescription: "Choose whether to share one poster or upload a batch.",
  ogImage,
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-12">
    <UPageHeader title="How many posters will you be sharing?">
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
