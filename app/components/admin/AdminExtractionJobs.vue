<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";

import type {
  AdminExtractionJobRow,
  ExtractionFilters,
  FilterPreset,
  Paginated,
} from "./types";

const props = defineProps<{
  preset?: FilterPreset<ExtractionFilters> | null;
}>();

const emit = defineEmits<{ (e: "changed"): void }>();

const toast = useToast();

const LIMIT = 25;

const page = ref(1);
const statusFilter = ref("all");
const searchInput = ref("");
const searchCommitted = ref("");

const filtersActive = computed(
  () =>
    statusFilter.value !== "all" ||
    searchCommitted.value !== "" ||
    searchInput.value !== "",
);

watch(statusFilter, () => {
  page.value = 1;
});

function submitSearch() {
  searchCommitted.value = searchInput.value;
  page.value = 1;
}

function clearFilters() {
  searchInput.value = "";
  searchCommitted.value = "";
  statusFilter.value = "all";
  page.value = 1;
}

// A stat tile was clicked. Start from a clean slate so the table shows exactly
// the number on the tile.
watch(
  () => props.preset?.token,
  () => {
    const filters = props.preset?.filters;
    if (!filters) return;

    clearFilters();
    if (filters.status) statusFilter.value = filters.status;
  },
);

const {
  data: jobsData,
  refresh: refreshJobs,
  status: jobsStatus,
} = await useFetch<Paginated<AdminExtractionJobRow>>(
  "/api/admin/extraction-jobs",
  {
    key: "admin-extraction-jobs",
    query: computed(() => ({
      page: page.value,
      limit: LIMIT,
      status: statusFilter.value === "all" ? "" : statusFilter.value,
      search: searchCommitted.value,
    })),
  },
);

const jobs = computed(() => jobsData.value?.data ?? []);

const highlightTerm = computed(() => searchCommitted.value.trim());
const total = computed(() => jobsData.value?.total ?? 0);

const statusItems = [
  { label: "All statuses", value: "all" },
  { label: "In flight", value: "in-flight" },
  { label: "Failed", value: "failed" },
  { label: "Pending extraction", value: "pending-extraction" },
  { label: "Pending thumbnail", value: "pending-thumbnail" },
  { label: "Processing", value: "processing" },
  { label: "Completed", value: "completed" },
];

const columns: ColumnDef<AdminExtractionJobRow>[] = [
  { id: "poster", header: "Poster", enableSorting: false },
  { id: "fileName", header: "File", enableSorting: false },
  { id: "status", header: "Status", enableSorting: false },
  { id: "error", header: "Error", enableSorting: false },
  { id: "created", header: "Created", enableSorting: false },
  { id: "updated", header: "Updated", enableSorting: false },
  { id: "jobActions", header: "", enableSorting: false },
];

const retryingJobId = ref<string | null>(null);

async function retryJob(job: AdminExtractionJobRow) {
  if (retryingJobId.value !== null) return;

  retryingJobId.value = job.id;

  try {
    await $fetch(`/api/admin/extraction-jobs/${job.id}/retry`, {
      method: "POST",
    });
    toast.add({
      title: `Re-queued extraction for poster ${job.poster.id}`,
      color: "success",
    });
    await refreshJobs();
    emit("changed");
  } catch (error) {
    const { statusMessage } = parseApiError(error);

    toast.add({
      title: "Failed to retry the extraction job",
      description: statusMessage,
      color: "error",
    });
  } finally {
    retryingJobId.value = null;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="searchInput"
        placeholder="Search by poster id, title, or file name"
        icon="material-symbols:search"
        class="w-full sm:w-80"
        @keydown.enter="submitSearch"
      />

      <UButton size="sm" label="Search" @click="submitSearch" />

      <USelect v-model="statusFilter" :items="statusItems" class="w-48" />

      <UButton
        v-if="filtersActive"
        size="sm"
        color="neutral"
        variant="subtle"
        icon="material-symbols:close"
        label="Clear"
        @click="clearFilters"
      />

      <span class="text-muted ml-auto text-sm">
        {{ total.toLocaleString() }} jobs
      </span>
    </div>

    <UiSpinner :loading="jobsStatus === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable :data="jobs" :columns="columns">
          <template #poster-cell="{ row }">
            <div class="flex flex-col">
              <NuxtLink
                :to="`/discover/${row.original.poster.id}`"
                target="_blank"
                class="text-primary font-mono text-sm hover:underline"
              >
                <AdminHighlight
                  :text="row.original.poster.id"
                  :term="highlightTerm"
                />
              </NuxtLink>

              <AdminTextTooltip :text="row.original.poster.title">
                <span class="line-clamp-1 max-w-xs cursor-help text-xs">
                  <AdminHighlight
                    :text="row.original.poster.title"
                    :term="highlightTerm"
                  />
                </span>
              </AdminTextTooltip>

              <span class="text-muted text-xs">
                {{ row.original.poster.user.emailAddress }}
              </span>
            </div>
          </template>

          <template #fileName-cell="{ row }">
            <AdminTextTooltip :text="row.original.fileName">
              <span class="line-clamp-1 max-w-48 cursor-help font-mono text-xs">
                <AdminHighlight
                  :text="row.original.fileName"
                  :term="highlightTerm"
                />
              </span>
            </AdminTextTooltip>
          </template>

          <template #status-cell="{ row }">
            <UBadge
              :color="extractionStatusColor(row.original.status)"
              variant="subtle"
              size="sm"
            >
              {{ row.original.status }}
            </UBadge>
          </template>

          <template #error-cell="{ row }">
            <UPopover v-if="row.original.error" mode="hover">
              <span class="line-clamp-2 max-w-xs cursor-help text-xs">
                {{ row.original.error }}
              </span>

              <template #content>
                <p
                  class="max-h-64 max-w-sm overflow-y-auto p-3 text-sm break-words whitespace-pre-wrap"
                >
                  {{ row.original.error }}
                </p>
              </template>
            </UPopover>

            <span v-else class="text-muted text-xs">-</span>
          </template>

          <template #created-cell="{ row }">
            <span class="text-xs">{{
              formatDateTime(row.original.created)
            }}</span>
          </template>

          <template #updated-cell="{ row }">
            <span class="text-xs">{{
              formatDateTime(row.original.updated)
            }}</span>
          </template>

          <template #jobActions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="material-symbols:refresh"
                label="Retry"
                :loading="retryingJobId === row.original.id"
                :disabled="retryingJobId !== null"
                @click="retryJob(row.original)"
              />
            </div>
          </template>
        </UTable>
      </div>
    </UiSpinner>

    <div v-if="total > LIMIT" class="flex justify-center">
      <UPagination v-model:page="page" :total="total" :items-per-page="LIMIT" />
    </div>
  </div>
</template>
