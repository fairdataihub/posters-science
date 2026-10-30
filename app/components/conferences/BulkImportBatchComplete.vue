<script setup lang="ts">
import type { BulkSubmissionCompletionResponse } from "#shared/types/bulkSubmissionCompletion";
import dayjs from "dayjs";

const props = defineProps<{
  jobId: string;
}>();

const { data, error, status } =
  await useFetch<BulkSubmissionCompletionResponse>(
    () => `/api/bulk-poster-submissions/${props.jobId}/completion`,
  );

const loading = computed(() => status.value === "pending");

const completedLabel = computed(() => {
  const at = data.value?.completedAt ?? data.value?.zenodoBatchCompletedAt;
  if (!at) return null;
  return dayjs(at).format("MMMM D, YYYY");
});

useSeoMeta({
  title: () =>
    data.value?.name
      ? `${data.value.name} — bulk import complete`
      : "Bulk import complete",
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-lg flex-col gap-6 px-6 pb-12">
    <UPageHeader title="Bulk import complete">
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Batch summary' },
          ]"
        />
      </template>
      <template #description>
        <span v-if="data?.name" class="font-medium">{{ data.name }}</span>
        <span v-if="completedLabel" class="text-muted">
          · Completed {{ completedLabel }}
        </span>
      </template>
    </UPageHeader>

    <div
      v-if="loading"
      class="flex flex-col items-center justify-center gap-3 py-16"
      aria-busy="true"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-10 animate-spin text-primary"
      />
      <p class="text-muted text-sm">Loading batch summary…</p>
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Could not load batch summary"
      description="This bulk import may not exist or you may not have access."
    />

    <template v-else-if="data">
      <UAlert
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        title="All posters published"
        description="Each poster in this batch is on Zenodo and listed on Posters.science Discover."
      />

      <div class="border-default overflow-hidden rounded-xl border">
        <table class="w-full text-left text-sm">
          <thead
            class="border-default border-b bg-gray-50/80 dark:bg-gray-900/40"
          >
            <tr>
              <th class="px-4 py-3 font-medium">Poster</th>
              <th class="px-4 py-3 font-medium">Links</th>
            </tr>
          </thead>
          <tbody class="divide-default divide-y">
            <tr v-for="poster in data.posters" :key="poster.posterId">
              <td class="px-4 py-3 align-top">
                <span class="line-clamp-2 font-medium" :title="poster.title">
                  {{ poster.title }}
                </span>
                <span class="text-muted block text-xs">{{
                  poster.fileName
                }}</span>
                <span
                  v-if="poster.doi"
                  class="text-muted mt-1 block max-w-md truncate text-xs"
                  :title="poster.doi"
                >
                  DOI: {{ poster.doi }}
                </span>
              </td>
              <td class="px-4 py-3 align-top">
                <div class="flex flex-col items-start gap-2">
                  <UButton
                    v-if="poster.zenodoUrl"
                    color="primary"
                    variant="soft"
                    size="sm"
                    icon="i-simple-icons-zenodo"
                    label="View on Zenodo"
                    :to="poster.zenodoUrl"
                    target="_blank"
                  />
                  <UButton
                    v-if="poster.discoverUrl"
                    color="primary"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-telescope"
                    label="View on Posters.science"
                    :to="poster.discoverUrl"
                    target="_blank"
                  />
                  <p
                    v-if="!poster.zenodoUrl && !poster.discoverUrl"
                    class="text-muted text-xs"
                  >
                    Links are not available yet.
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap gap-3">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-layout-dashboard"
          label="Back to dashboard"
          to="/dashboard"
        />
      </div>
    </template>
  </div>
</template>
