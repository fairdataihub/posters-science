<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
  appShell: true,
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Share Posters - Posters.science")}&description=${encodeURIComponent("Choose how you want to share your posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Share Posters",
  description:
    "Share a single poster, or submit a conference's posters together.",
  ogTitle: "Share Posters - Posters.science",
  ogDescription:
    "Share a single poster, or submit a conference's posters together.",
  ogImage,
});
</script>

<template>
  <DashboardPage
    title="Share Posters"
    description="How would you like to share?"
  >
    <div class="mx-auto w-full max-w-4xl">
      <SharePostersChooserCards />
    </div>
  </DashboardPage>
</template>
