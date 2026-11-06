<script setup lang="ts">
import type { BulkSubmissionCompletionResponse } from "#shared/types/bulkSubmissionCompletion";
import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";
import ConferenceBulkImport from "~/components/conferences/ConferenceBulkImport.vue";
import { normalizeBulkImportWizardStep } from "#shared/types/bulkImportWizard";
import {
  SHARE_BULK_IMPORT_STEP_QUERY,
  shareBulkCompletionPath,
} from "~/utils/sharePaths";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();

const jobIdFromQuery = computed(() => {
  const raw = route.query.jobId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.length > 0 ? value : null;
});

// A new import creates its job on the first upload and then adds ?jobId to
// the URL. That wizard already has the job, so it must not remount or reload
// mid-upload: only a jobId it did not create counts as a resume.
const createdJobId = ref<string | null>(null);
const resumeJobId = computed(() =>
  jobIdFromQuery.value && jobIdFromQuery.value !== createdJobId.value
    ? jobIdFromQuery.value
    : null,
);
const wizardKey = ref(jobIdFromQuery.value ?? "new-bulk");

watch(jobIdFromQuery, (id) => {
  if (id && id === createdJobId.value) return;
  createdJobId.value = null;
  wizardKey.value = id ?? `new-bulk-${Date.now()}`;
});

// The reactive key refetches when the resumed jobId changes.
const { data: resumeJob, status: resumeStatus } = await useAsyncData(
  () => `bulk-import-resume-${resumeJobId.value ?? "new"}`,
  () =>
    resumeJobId.value
      ? $fetch<BulkPosterSubmissionJob>(
          `/api/bulk-poster-submissions/${resumeJobId.value}`,
        )
      : Promise.resolve(null),
);

const resumeLoading = computed(
  () => Boolean(resumeJobId.value) && resumeStatus.value === "pending",
);

const wizardStepFromQuery = computed(() => {
  const raw = route.query[SHARE_BULK_IMPORT_STEP_QUERY];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return normalizeBulkImportWizardStep(
    typeof value === "string" ? value : undefined,
  );
});

const initialWizardStep = computed(
  () =>
    wizardStepFromQuery.value ??
    normalizeBulkImportWizardStep(resumeJob.value?.wizardStep),
);

watch(
  () => resumeJob.value?.status,
  async (status) => {
    const id = resumeJobId.value;
    if (status !== "completed" || !id) return;

    try {
      const completion = await $fetch<BulkSubmissionCompletionResponse>(
        `/api/bulk-poster-submissions/${id}/completion`,
      );
      if (completion.awaitingEmbargoRelease) return;
      if (completion.completedAt) {
        void navigateTo(shareBulkCompletionPath(id));
      }
    } catch {
      // Resume wizard on publish step instead.
    }
  },
  { immediate: true },
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
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 pt-8 pb-12">
    <ConferenceBulkImport
      v-if="!resumeJobId || resumeStatus !== 'pending'"
      :key="wizardKey"
      :initial-job-id="resumeJobId ?? undefined"
      :initial-import-name="resumeJob?.name"
      :initial-step="initialWizardStep"
      :resume-loading="resumeLoading"
      @job-created="createdJobId = $event"
    />

    <div
      v-else
      class="flex flex-col items-center justify-center gap-3 py-16"
      aria-live="polite"
      aria-busy="true"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-10 animate-spin text-primary"
      />
      <p class="text-muted text-sm">Loading bulk import…</p>
    </div>
  </div>
</template>

