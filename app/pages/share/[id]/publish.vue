<script setup lang="ts">
import PosterPublishPanel from "~/components/share/PosterPublishPanel.vue";

definePageMeta({
  middleware: ["auth"],
  appShell: true,
});

const route = useRoute();
const { id } = route.params as { id: string };

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Submit Poster - Posters.science")}&description=${encodeURIComponent("Archive your scientific poster on a trusted open repository")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Submit Poster",
  description: "Archive your poster on a trusted repository.",
  ogTitle: "Submit Poster - Posters.science",
  ogDescription: "Archive your scientific poster on a trusted open repository.",
  ogImage,
});

const { data: posterData } = await useFetch(`/api/poster/${id}`, {
  headers: useRequestHeaders(["cookie"]),
  method: "GET",
});
</script>

<template>
  <DashboardPage
    title="Submit Poster"
    :breadcrumb="[
      ...(posterData?.versionRootId
        ? []
        : [{ label: 'Upload Poster', to: '/share/new' }]),
      { label: 'Review Metadata', to: `/share/${id}` },
    ]"
    description="Submit your poster for publication on a trusted repository."
  >
    <template #actions>
      <UButton
        variant="outline"
        icon="i-lucide-arrow-left"
        :to="`/share/${id}`"
      >
        Back to Edit
      </UButton>
    </template>

    <div class="mx-auto w-full max-w-screen-xl">
      <PosterPublishPanel :poster-id="id" />
    </div>
  </DashboardPage>
</template>
