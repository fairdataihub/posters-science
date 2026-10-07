<script setup lang="ts">

import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";

import { normalizeBulkImportWizardStep } from "#shared/types/bulkImportWizard";

import ConferenceBulkImport from "~/components/conferences/ConferenceBulkImport.vue";



definePageMeta({

  middleware: ["auth"],

});



const route = useRoute();

const router = useRouter();



const jobIdFromQuery = computed(() => {

  const raw = route.query.jobId;

  const value = Array.isArray(raw) ? raw[0] : raw;

  return typeof value === "string" && value.length > 0 ? value : null;

});



const { data: resumeJob, status: resumeStatus } =

  await useFetch<BulkPosterSubmissionJob>(

    () =>

      jobIdFromQuery.value

        ? `/api/bulk-poster-submissions/${jobIdFromQuery.value}`

        : null,

    { watch: [jobIdFromQuery] },

  );



/** Drop stale job ids (e.g. after a dev server restart clears the mock store). */

watch(

  () => [jobIdFromQuery.value, resumeStatus.value] as const,

  ([jobId, status]) => {

    if (jobId && status === "error") {

      void router.replace("/share/new-bulk");

    }

  },

  { immediate: true },

);



const resumeLoading = computed(

  () => Boolean(jobIdFromQuery.value) && resumeStatus.value === "pending",

);



const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Share Posters in bulk - Posters.science")}&description=${encodeURIComponent("Import multiple posters with license metadata")}&app=posters-science&org=fairdataihub`;



useSeoMeta({

  title: "Share Posters in bulk",

  description:

    "Import multiple poster files with license metadata on Posters.science.",

  ogTitle: "Share Posters in bulk - Posters.science",

  ogDescription:

    "Import multiple poster files with license metadata on Posters.science.",

  ogImage,

});

</script>



<template>

  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 pb-12">

    <UPageHeader

      title="Share Posters in bulk"

      description="Name your import, upload posters to storage, add license metadata, review, then run extraction. Conference details can be added later."

    >

      <template #headline>

        <UBreadcrumb

          :items="[

            { label: 'Dashboard', to: '/dashboard' },

            { label: 'Share Posters in bulk', to: '/share/new-bulk' },

          ]"

        />

      </template>

    </UPageHeader>



    <p

      v-if="resumeLoading"

      class="text-muted text-center text-sm"

      aria-live="polite"

    >

      Loading bulk import…

    </p>



    <ConferenceBulkImport

      :initial-job-id="resumeJob?.id"

      :initial-import-name="resumeJob?.name"

      :initial-step="normalizeBulkImportWizardStep(resumeJob?.wizardStep)"

      :initial-staged-posters="resumeJob?.stagedPosters ?? []"

      :initial-license-metadata-uploaded="Boolean(resumeJob?.licenseMetadataFilePath)"

    />

  </div>

</template>

