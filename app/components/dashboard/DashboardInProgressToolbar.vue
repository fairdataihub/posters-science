<script setup lang="ts">
import {
  DASHBOARD_BATCH_STATUS_OPTIONS,
  type DashboardBatchStatus,
} from "~/utils/dashboardBatchStatus";
import type {
  InProgressFilter,
  InProgressFilterOption,
} from "~/types/dashboard";

defineProps<{
  kinds: InProgressFilterOption[];
  resultSummary: string;
  hasBatches: boolean;
}>();

const search = defineModel<string>("search", { required: true });
const kind = defineModel<InProgressFilter>("kind", { required: true });
const statuses = defineModel<DashboardBatchStatus[]>("statuses", {
  required: true,
});
const draft = ref(search.value);

watch(search, (value) => {
  draft.value = value;
});

function clearAll() {
  search.value = "";
  statuses.value = [];
}
</script>

<template>
  <UDashboardToolbar
    :ui="{ root: 'flex-col items-stretch justify-start gap-0 pt-4' }"
  >
    <DiscoverSearchBar
      v-model="draft"
      :committed="search"
      scope="drafts"
      placeholder="Search draft titles and batch names..."
      button-label="Search"
      @submit="search = draft.trim()"
    >
      <div class="flex grow items-center justify-between gap-3">
        <p class="text-muted text-sm" aria-live="polite">
          {{ resultSummary }}
        </p>

        <UPopover :content="{ align: 'end' }">
          <UTooltip text="In progress filters">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-sliders-horizontal"
              aria-label="In progress filters"
            >
              <template v-if="statuses.length" #trailing>
                <UBadge color="primary" size="xs">{{ statuses.length }}</UBadge>
              </template>
            </UButton>
          </UTooltip>

          <template #content>
            <div class="w-80 max-w-[calc(100vw-2rem)] space-y-5 p-4">
              <div class="space-y-2 lg:hidden">
                <p class="text-sm font-medium">Show</p>

                <div
                  class="flex flex-wrap gap-2"
                  role="group"
                  aria-label="In progress kind"
                >
                  <UButton
                    v-for="option in kinds"
                    :key="option.value"
                    :label="option.label"
                    size="xs"
                    :color="kind === option.value ? 'primary' : 'neutral'"
                    :variant="kind === option.value ? 'solid' : 'outline'"
                    :aria-pressed="kind === option.value"
                    @click="kind = option.value"
                  />
                </div>
              </div>

              <UCheckboxGroup
                v-if="hasBatches"
                v-model="statuses"
                legend="Batch status"
                :items="DASHBOARD_BATCH_STATUS_OPTIONS"
                size="sm"
              />

              <p v-else class="text-muted text-sm">
                Batch status filters appear after you start a bulk upload.
              </p>

              <p class="text-muted text-xs">
                Selecting a batch status shows matching bulk uploads only.
              </p>

              <UButton
                label="Clear filters"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="!statuses.length"
                @click="statuses = []"
              />
            </div>
          </template>
        </UPopover>
      </div>
    </DiscoverSearchBar>

    <div
      v-if="search || statuses.length"
      class="flex flex-wrap items-center gap-2 pb-4"
    >
      <UBadge v-if="search" color="primary" variant="subtle">
        Search: {{ search }}
        <UButton
          icon="i-lucide-x"
          aria-label="Clear in progress search"
          size="xs"
          variant="link"
          @click="search = ''"
        />
      </UBadge>

      <UBadge
        v-for="status in statuses"
        :key="status"
        color="primary"
        variant="subtle"
      >
        {{
          DASHBOARD_BATCH_STATUS_OPTIONS.find(
            (option) => option.value === status,
          )?.label
        }}
        <UButton
          icon="i-lucide-x"
          :aria-label="`Remove ${status} filter`"
          size="xs"
          variant="link"
          @click="statuses = statuses.filter((value) => value !== status)"
        />
      </UBadge>

      <UButton
        label="Clear all"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="clearAll"
      />
    </div>
  </UDashboardToolbar>
</template>
