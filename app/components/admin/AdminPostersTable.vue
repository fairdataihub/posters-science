<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { ColumnDef } from "@tanstack/vue-table";

import {
  parsePosterSearch,
  posterSearchMatches,
  POSTER_SEARCH_FIELD_LABELS,
} from "#shared/utils/adminSearch";

import type {
  AdminPosterRow,
  FilterPreset,
  Paginated,
  PosterFilters,
} from "./types";

const props = defineProps<{
  preset?: FilterPreset<PosterFilters> | null;
}>();

const emit = defineEmits<{
  (e: "changed"): void;
  (e: "open-detail", posterId: number): void;
}>();

const toast = useToast();
const UButton = resolveComponent("UButton");

const LIMIT = 25;

const searchInput = ref("");
const searchCommitted = ref("");
const page = ref(1);
const statusFilter = ref("all");
const doiFilter = ref("all");
const automatedFilter = ref("all");
const extractionFilter = ref("all");
const sort = ref("created");
const order = ref<"asc" | "desc">("desc");

const filtersActive = computed(
  () =>
    searchCommitted.value !== "" ||
    searchInput.value !== "" ||
    statusFilter.value !== "all" ||
    doiFilter.value !== "all" ||
    automatedFilter.value !== "all" ||
    extractionFilter.value !== "all",
);

watch([statusFilter, doiFilter, automatedFilter, extractionFilter], () => {
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
  doiFilter.value = "all";
  automatedFilter.value = "all";
  extractionFilter.value = "all";
  page.value = 1;
}

// A stat tile was clicked. Start from a clean slate so the table shows exactly
// the number on the tile, not that number intersected with whatever was set.
watch(
  () => props.preset?.token,
  () => {
    const filters = props.preset?.filters;
    if (!filters) return;

    clearFilters();
    if (filters.status) statusFilter.value = filters.status;
    if (filters.doi) doiFilter.value = filters.doi;
    if (filters.automated) automatedFilter.value = filters.automated;
    if (filters.extraction) extractionFilter.value = filters.extraction;
  },
);

const queryParams = computed(() => ({
  page: page.value,
  limit: LIMIT,
  search: searchCommitted.value,
  status: statusFilter.value === "all" ? "" : statusFilter.value,
  doi: doiFilter.value === "all" ? "" : doiFilter.value,
  automated: automatedFilter.value === "all" ? "" : automatedFilter.value,
  extraction: extractionFilter.value === "all" ? "" : extractionFilter.value,
  sort: sort.value,
  order: order.value,
}));

const {
  data: postersData,
  refresh: refreshPosters,
  status: postersStatus,
} = await useFetch<Paginated<AdminPosterRow>>("/api/admin/posters", {
  key: "admin-posters",
  query: queryParams,
});

const posters = computed(() => postersData.value?.data ?? []);
const total = computed(() => postersData.value?.total ?? 0);

const activeSearch = computed(() => parsePosterSearch(searchCommitted.value));

const highlightTerm = computed(() => activeSearch.value.term);

function matchedFields(poster: AdminPosterRow) {
  return posterSearchMatches(
    {
      id: poster.id,
      title: poster.title,
      user: poster.user,
      doi: effectiveDoi(poster),
    },
    activeSearch.value,
  );
}

const searchScopeLabel = computed(() => {
  const { term, field } = activeSearch.value;
  if (!term) return "";

  if (field) {
    return `Searching ${POSTER_SEARCH_FIELD_LABELS[field]} only for "${term}"`;
  }

  return `Searching ID, title, owner and DOI for "${term}"`;
});

// Sorting is server side because the table only holds one page at a time.
function toggleSort(field: string) {
  if (sort.value === field) {
    order.value = order.value === "asc" ? "desc" : "asc";
  } else {
    sort.value = field;
    order.value = "desc";
  }
  page.value = 1;
}

function serverSortHeader(label: string, field: string) {
  return () =>
    h(UButton, {
      color: "neutral",
      variant: "ghost",
      label,
      trailingIcon:
        sort.value !== field
          ? "material-symbols:unfold-more"
          : order.value === "asc"
            ? "material-symbols:arrow-upward"
            : "material-symbols:arrow-downward",
      class: "-mx-2.5",
      onClick: () => toggleSort(field),
    });
}

const columns = computed<ColumnDef<AdminPosterRow>[]>(() => [
  { id: "id", header: serverSortHeader("ID", "id"), enableSorting: false },
  ...(activeSearch.value.term
    ? [{ id: "matched", header: "Matched", enableSorting: false }]
    : []),
  {
    id: "title",
    header: serverSortHeader("Title", "title"),
    enableSorting: false,
  },
  { id: "owner", header: "Owner", enableSorting: false },
  {
    id: "status",
    header: serverSortHeader("Status", "status"),
    enableSorting: false,
  },
  { id: "version", header: "Version", enableSorting: false },
  { id: "doi", header: "DOI", enableSorting: false },
  { id: "extraction", header: "Extraction", enableSorting: false },
  {
    id: "created",
    header: serverSortHeader("Created", "created"),
    enableSorting: false,
  },
  {
    id: "updated",
    header: serverSortHeader("Updated", "updated"),
    enableSorting: false,
  },
  { id: "posterActions", header: "", enableSorting: false },
]);

const statusItems = [
  { label: "All statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Downloaded", value: "downloaded" },
  { label: "Published", value: "published" },
  { label: "Tombstoned", value: "tombstoned" },
];

const doiItems = [
  { label: "Any DOI state", value: "all" },
  { label: "Has a DOI", value: "has" },
  { label: "No DOI", value: "none" },
];

const automatedItems = [
  { label: "Any source", value: "all" },
  { label: "Auto indexed", value: "true" },
  { label: "User submitted", value: "false" },
];

const extractionItems = [
  { label: "Any extraction", value: "all" },
  { label: "Pending extraction", value: "pending-extraction" },
  { label: "Pending thumbnail", value: "pending-thumbnail" },
  { label: "Processing", value: "processing" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "No job", value: "none" },
];

function rootIdOf(poster: AdminPosterRow) {
  return poster.versionRootId ?? poster.id;
}

// PosterMetadata.doi is the canonical value and covers externally obtained
// DOIs; the Zenodo deposition is only a fallback for older rows. Some rows
// store a blank string rather than null, so trim before deciding.
function effectiveDoi(poster: AdminPosterRow) {
  return (
    poster.posterMetadata?.doi?.trim() ||
    poster.zenodoDepositions?.lastPublishedZenodoDoi?.trim() ||
    null
  );
}

const doiSourceLabels: Record<string, string> = {
  zenodo: "Zenodo",
  "zenodo-sandbox": "Sandbox",
  external: "External",
};

function doiSourceLabel(doi: string | null) {
  const source = classifyDoiSource(doi);

  return source ? doiSourceLabels[source] : "";
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ title: `${label} copied`, color: "success" });
  } catch {
    toast.add({ title: `Could not copy ${label}`, color: "error" });
  }
}

const exportUrl = computed(() => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(queryParams.value)) {
    if (key === "page" || key === "limit") continue;
    if (value) params.set(key, String(value));
  }

  return `/api/admin/posters/export?${params.toString()}`;
});

// Delete and restore

const confirmDeletePosterId = ref<number | null>(null);
const tombstoneReason = ref("");
const isDeletingPoster = ref(false);
const restoringPosterId = ref<number | null>(null);

const posterToDelete = computed(
  () => posters.value.find((p) => p.id === confirmDeletePosterId.value) ?? null,
);

function closeDeletePosterModal() {
  confirmDeletePosterId.value = null;
  tombstoneReason.value = "";
}

async function deletePoster() {
  // Guard against a double click firing multiple DELETE requests before the
  // first one resolves and closes the modal.
  if (isDeletingPoster.value) return;

  const poster = posterToDelete.value;
  if (!poster) return;

  // Published posters are retired (tombstoned) with a required reason;
  // drafts and downloads are hard-deleted.
  const isPublished = poster.status === "published";

  if (isPublished && tombstoneReason.value.trim() === "") {
    toast.add({
      title: "A reason is required to retire this poster",
      color: "error",
    });

    return;
  }

  isDeletingPoster.value = true;

  try {
    await $fetch(`/api/admin/posters/${poster.id}`, {
      method: "DELETE",
      body: isPublished ? { reason: tombstoneReason.value.trim() } : undefined,
    });
    toast.add({
      title: `"${poster.title}" ${isPublished ? "retired" : "deleted"}`,
      color: "success",
    });
    closeDeletePosterModal();
    await refreshPosters();
    emit("changed");
  } catch {
    toast.add({
      title: `Failed to ${isPublished ? "retire" : "delete"} poster`,
      color: "error",
    });
  } finally {
    isDeletingPoster.value = false;
  }
}

async function restorePoster(poster: AdminPosterRow) {
  // Guard against a double click firing multiple restore requests.
  if (restoringPosterId.value !== null) return;

  restoringPosterId.value = poster.id;

  try {
    await $fetch(`/api/admin/posters/${poster.id}/restore`, { method: "POST" });
    toast.add({ title: `"${poster.title}" restored`, color: "success" });
    await refreshPosters();
    emit("changed");
  } catch {
    toast.add({ title: "Failed to restore poster", color: "error" });
  } finally {
    restoringPosterId.value = null;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UTooltip
        :ui="{ content: 'h-auto max-w-sm items-start p-2.5' }"
        :delay-duration="300"
      >
        <UInput
          v-model="searchInput"
          placeholder="Search id, title, owner, or DOI"
          icon="material-symbols:search"
          class="w-full sm:w-80"
          @keydown.enter="submitSearch"
        />

        <template #content>
          <div class="space-y-1 text-xs">
            <p>
              A plain term searches the poster id, title, owner and DOI at once.
            </p>

            <p>
              Narrow it with a prefix:
              <code>id:34183</code>

              , <code>doi:10.5281</code>
              ,
              <code>owner:jane@</code>

              , <code>title:cancer</code>.
            </p>
          </div>
        </template>
      </UTooltip>

      <UButton size="sm" label="Search" @click="submitSearch" />

      <USelect v-model="statusFilter" :items="statusItems" class="w-44" />

      <USelect v-model="doiFilter" :items="doiItems" class="w-40" />

      <USelect v-model="automatedFilter" :items="automatedItems" class="w-44" />

      <USelect
        v-model="extractionFilter"
        :items="extractionItems"
        class="w-48"
      />

      <UButton
        v-if="filtersActive"
        size="sm"
        color="neutral"
        variant="subtle"
        icon="material-symbols:close"
        label="Clear"
        @click="clearFilters"
      />

      <div class="ml-auto flex items-center gap-3">
        <span class="text-muted text-sm">
          {{ total.toLocaleString() }} posters
        </span>

        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="material-symbols:download"
          label="Export CSV"
          :to="exportUrl"
          external
          download
        />
      </div>
    </div>

    <p
      v-if="searchScopeLabel"
      class="text-muted flex items-center gap-1.5 text-xs"
    >
      <UIcon name="material-symbols:search" class="size-3.5 shrink-0" />

      {{ searchScopeLabel }}

      <span v-if="!activeSearch.scoped">
        Add a prefix such as
        <code class="bg-elevated rounded px-1">id:</code>
        or
        <code class="bg-elevated rounded px-1">doi:</code> to narrow it.
      </span>
    </p>

    <UiSpinner :loading="postersStatus === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable :data="posters" :columns="columns">
          <template #id-cell="{ row }">
            <div class="flex items-center gap-1">
              <NuxtLink
                :to="`/discover/${rootIdOf(row.original)}`"
                target="_blank"
                class="text-primary font-mono text-sm hover:underline"
              >
                <AdminHighlight :text="row.original.id" :term="highlightTerm" />
              </NuxtLink>

              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="material-symbols:content-copy-outline"
                :aria-label="`Copy poster id ${row.original.id}`"
                @click="copyToClipboard(String(row.original.id), 'Poster id')"
              />
            </div>
          </template>

          <template #matched-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="field in matchedFields(row.original)"
                :key="field"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ POSTER_SEARCH_FIELD_LABELS[field] }}
              </UBadge>
            </div>
          </template>

          <template #title-cell="{ row }">
            <AdminTextTooltip :text="row.original.title">
              <span class="line-clamp-2 max-w-sm cursor-help font-medium">
                <AdminHighlight
                  :text="row.original.title"
                  :term="highlightTerm"
                />
              </span>
            </AdminTextTooltip>
          </template>

          <template #owner-cell="{ row }">
            <span class="text-sm">
              <AdminHighlight
                :text="`${row.original.user.givenName} ${row.original.user.familyName}`"
                :term="highlightTerm"
              />

              <span class="text-muted block text-xs">
                <AdminHighlight
                  :text="row.original.user.emailAddress"
                  :term="highlightTerm"
                />
              </span>
            </span>
          </template>

          <template #status-cell="{ row }">
            <div class="flex flex-col items-start gap-1">
              <UBadge
                v-if="row.original.tombstone"
                color="warning"
                variant="subtle"
                size="sm"
              >
                Tombstoned
              </UBadge>

              <UBadge
                v-else
                :color="posterStatusColor(row.original.status)"
                variant="subtle"
                size="sm"
              >
                {{ row.original.status }}
              </UBadge>

              <UBadge
                v-if="row.original.automated"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Auto indexed
              </UBadge>
            </div>
          </template>

          <template #version-cell="{ row }">
            <div class="flex items-center gap-1 text-xs">
              <span class="font-mono">v{{ row.original.versionSequence }}</span>

              <UBadge
                v-if="row.original.isLatestVersion"
                color="primary"
                variant="subtle"
                size="sm"
              >
                latest
              </UBadge>
            </div>

            <span
              v-if="row.original.posterMetadata?.version"
              class="text-muted block text-xs"
            >
              {{ row.original.posterMetadata.version }}
            </span>
          </template>

          <template #doi-cell="{ row }">
            <div v-if="effectiveDoi(row.original)" class="flex flex-col gap-1">
              <div class="flex items-center gap-1">
                <a
                  :href="resolveDoiUrl(effectiveDoi(row.original)!)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary font-mono text-xs hover:underline"
                >
                  <AdminHighlight
                    :text="effectiveDoi(row.original)"
                    :term="highlightTerm"
                  />
                </a>

                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="material-symbols:content-copy-outline"
                  aria-label="Copy DOI"
                  @click="copyToClipboard(effectiveDoi(row.original)!, 'DOI')"
                />
              </div>

              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                class="self-start"
              >
                {{ doiSourceLabel(effectiveDoi(row.original)) }}
              </UBadge>
            </div>

            <span v-else class="text-muted text-xs">-</span>
          </template>

          <template #extraction-cell="{ row }">
            <UPopover v-if="row.original.extractionJob?.error" mode="hover">
              <UBadge
                color="error"
                variant="subtle"
                size="sm"
                class="cursor-help"
              >
                {{ row.original.extractionJob.status }}
              </UBadge>

              <template #content>
                <p
                  class="max-h-64 max-w-sm overflow-y-auto p-3 text-sm break-words whitespace-pre-wrap"
                >
                  {{ row.original.extractionJob.error }}
                </p>
              </template>
            </UPopover>

            <UBadge
              v-else-if="row.original.extractionJob"
              :color="extractionStatusColor(row.original.extractionJob.status)"
              variant="subtle"
              size="sm"
            >
              {{ row.original.extractionJob.status }}
            </UBadge>

            <span v-else class="text-muted text-xs">-</span>
          </template>

          <template #created-cell="{ row }">
            <span class="text-xs">{{ formatDate(row.original.created) }}</span>
          </template>

          <template #updated-cell="{ row }">
            <span class="text-xs">{{ formatDate(row.original.updated) }}</span>
          </template>

          <template #posterActions-cell="{ row }">
            <div class="flex items-center justify-end gap-1">
              <UTooltip text="View more details in the side panel">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="material-symbols:info-outline"
                  aria-label="View more details in the side panel"
                  @click="emit('open-detail', row.original.id)"
                />
              </UTooltip>

              <UButton
                v-if="row.original.tombstone"
                size="xs"
                color="neutral"
                variant="outline"
                icon="material-symbols:restore-from-trash"
                label="Restore"
                :loading="restoringPosterId === row.original.id"
                :disabled="restoringPosterId !== null"
                @click="restorePoster(row.original)"
              />

              <UButton
                v-else
                size="xs"
                :color="
                  row.original.status === 'published' ? 'warning' : 'error'
                "
                variant="outline"
                :icon="
                  row.original.status === 'published'
                    ? 'material-symbols:archive'
                    : 'material-symbols:delete'
                "
                :aria-label="
                  row.original.status === 'published'
                    ? 'Retire poster'
                    : 'Delete poster'
                "
                @click="confirmDeletePosterId = row.original.id"
              />
            </div>
          </template>
        </UTable>
      </div>
    </UiSpinner>

    <div v-if="total > LIMIT" class="flex justify-center">
      <UPagination v-model:page="page" :total="total" :items-per-page="LIMIT" />
    </div>

    <UModal
      :open="confirmDeletePosterId !== null"
      :title="
        posterToDelete?.status === 'published'
          ? 'Retire Poster'
          : 'Delete Poster'
      "
      :description="
        posterToDelete?.status === 'published'
          ? 'This hides the poster from public view but preserves the record. A reason is required, and it can be restored later.'
          : 'This will permanently delete the poster and all associated metadata. This cannot be undone.'
      "
      @update:open="
        (v) => {
          if (!v) closeDeletePosterModal();
        }
      "
    >
      <template v-if="posterToDelete?.status === 'published'" #body>
        <UFormField label="Reason for retiring" required>
          <UTextarea
            v-model="tombstoneReason"
            :rows="3"
            placeholder="Explain why this poster is being retired"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Cancel"
            @click="closeDeletePosterModal"
          />

          <UButton
            color="error"
            :label="
              posterToDelete?.status === 'published' ? 'Retire' : 'Delete'
            "
            :loading="isDeletingPoster"
            :disabled="
              isDeletingPoster ||
              (posterToDelete?.status === 'published' &&
                tombstoneReason.trim() === '')
            "
            @click="deletePoster"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
