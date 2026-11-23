<script setup lang="ts">
import dayjs from "dayjs";
import type { DashboardBulkSubmission } from "#shared/types/dashboardFeed";
import BulkImportBatchOrganizations from "~/components/conferences/BulkImportBatchOrganizations.vue";

// The top of a finished batch's panel on Published: what the batch summary
// page says about it, and its actions that the card's menu doesn't have.

const props = defineProps<{
  bulk: DashboardBulkSubmission;
}>();

const organizationsOpen = ref(false);

const summary = computed(() => {
  const count = props.bulk.posterCount ?? 0;
  const published =
    count === 1
      ? "1 poster published on Zenodo."
      : `All ${count.toLocaleString()} posters published on Zenodo.`;

  return props.bulk.completedAt
    ? `${published} Completed ${dayjs(props.bulk.completedAt).format("MMMM D, YYYY")}.`
    : published;
});
</script>

<template>
  <div
    class="border-default bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
  >
    <p class="flex items-center gap-2 text-sm">
      <UIcon
        name="i-lucide-circle-check"
        class="text-success size-4 shrink-0"
      />
      {{ summary }}
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        color="neutral"
        variant="subtle"
        size="xs"
        icon="i-lucide-building-2"
        label="Add to organization"
        @click="organizationsOpen = true"
      />

      <UButton
        v-if="bulk.collection"
        color="neutral"
        variant="subtle"
        size="xs"
        icon="i-lucide-library-big"
        label="View collection"
        :to="`/collections/${bulk.collection.id}`"
      />

      <UButton
        v-else
        color="primary"
        variant="subtle"
        size="xs"
        icon="i-lucide-library-big"
        label="Create collection from this batch"
        :to="{
          path: '/collections',
          query: { new: '1', fromBatch: bulk.id },
        }"
      />
    </div>

    <BulkImportBatchOrganizations
      v-model:open="organizationsOpen"
      :job-id="bulk.id"
    />
  </div>
</template>
