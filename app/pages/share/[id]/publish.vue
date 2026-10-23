<script setup lang="ts">
import PosterPublishPanel from "~/components/share/PosterPublishPanel.vue";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const { id } = route.params as { id: string };

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Submit Poster - Posters.science")}&description=${encodeURIComponent("Archive your scientific poster on a trusted open repository")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Submit Poster - Posters.science",
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
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 pb-10">
    <UPageHeader
      title="Submit Poster"
      description="Submit your poster for publication on a trusted repository."
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            ...(posterData?.versionRootId
              ? []
              : [{ label: 'Upload Poster', to: '/share/new' }]),
            { label: 'Review Metadata', to: `/share/${id}` },
            { label: 'Submit Poster' },
          ]"
        />
      </template>

      <template #actions>
        <UButton
          variant="outline"
          icon="i-lucide-arrow-left"
          :to="`/share/${id}`"
        >
          Back to Edit
        </UButton>
      </template>
    </UPageHeader>

    <PosterPublishPanel :poster-id="id" />
  </div>
</template>
