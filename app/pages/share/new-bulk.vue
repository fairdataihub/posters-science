<script setup lang="ts">
import type { BulkPosterSubmissionJob } from "#shared/types/bulkPosterSubmissionJob";
import ConferenceBulkImport from "~/components/conferences/ConferenceBulkImport.vue";
import { normalizeBulkImportWizardStep } from "#shared/types/bulkImportWizard";
import {
  SHARE_BULK_IMPORT_STEP_QUERY,
  shareBulkCompletionPath,
  shareNewBulkPath,
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

const { data: resumeJob, status: resumeStatus } =
  await useFetch<BulkPosterSubmissionJob>(
    () =>
      jobIdFromQuery.value
        ? `/api/bulk-poster-submissions/${jobIdFromQuery.value}`
        : null,
    { watch: [jobIdFromQuery] },
  );

const resumeLoading = computed(
  () => Boolean(jobIdFromQuery.value) && resumeStatus.value === "pending",
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
  (status) => {
    if (status === "completed" && jobIdFromQuery.value) {
      void navigateTo(shareBulkCompletionPath(jobIdFromQuery.value));
    }
  },
  { immediate: true },
);

const bulkBreadcrumbTo = computed(() =>
  jobIdFromQuery.value
    ? shareNewBulkPath({ jobId: jobIdFromQuery.value })
    : "/share/new-bulk",
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
    <UPageHeader title="Share Posters in bulk">
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Share Posters in bulk', to: bulkBreadcrumbTo },
          ]"
        />
      </template>
    </UPageHeader>

    <ConferenceBulkImport
      v-if="!jobIdFromQuery || resumeStatus !== 'pending'"
      :key="jobIdFromQuery ?? 'new-bulk'"
      :initial-job-id="jobIdFromQuery ?? resumeJob?.id ?? undefined"
      :initial-import-name="resumeJob?.name"
      :initial-step="initialWizardStep"
      :initial-extraction-method="resumeJob?.extractionMethod"
      :resume-loading="resumeLoading"
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

