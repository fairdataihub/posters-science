<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import { parseApiError } from "~/utils/apiError";

import type { AdminCollectionRow, Paginated } from "./types";

const emit = defineEmits<{
  changed: [];
}>();

const LIMIT = 25;

const toast = useToast();

const page = ref(1);
const searchInput = ref("");
const searchCommitted = ref("");
const visibilityFilter = ref("all");

const visibilityItems = [
  { label: "Any visibility", value: "all" },
  { label: "Public", value: "public" },
  { label: "Private", value: "private" },
  { label: "Hidden", value: "hidden" },
];

const filtersActive = computed(
  () =>
    searchCommitted.value !== "" ||
    searchInput.value !== "" ||
    visibilityFilter.value !== "all",
);

watch(visibilityFilter, () => {
  page.value = 1;
});

function submitSearch() {
  searchCommitted.value = searchInput.value;
  page.value = 1;
}

function clearFilters() {
  searchInput.value = "";
  searchCommitted.value = "";
  visibilityFilter.value = "all";
  page.value = 1;
}

const {
  data: collectionsData,
  status: collectionsStatus,
  refresh,
} = await useFetch<Paginated<AdminCollectionRow>>("/api/admin/collections", {
  key: "admin-collections",
  query: computed(() => ({
    page: page.value,
    limit: LIMIT,
    search: searchCommitted.value,
    visibility: visibilityFilter.value === "all" ? "" : visibilityFilter.value,
  })),
});

const collections = computed(() => collectionsData.value?.data ?? []);
const total = computed(() => collectionsData.value?.total ?? 0);
const highlightTerm = computed(() => searchCommitted.value.trim());

const columns: ColumnDef<AdminCollectionRow>[] = [
  { accessorKey: "name", header: "Name" },
  { id: "owner", header: "Owner" },
  { accessorKey: "posterCount", header: "Posters" },
  { accessorKey: "organizationCount", header: "Orgs" },
  { id: "visibility", header: "Visibility" },
  { accessorKey: "created", header: "Created" },
  { id: "actions", header: "", enableSorting: false },
];

const moderateTarget = ref<AdminCollectionRow | null>(null);
const moderateOpen = computed({
  get: () => moderateTarget.value !== null,
  set: (open) => {
    if (!open) moderateTarget.value = null;
  },
});
const moderateReason = ref("");
const moderating = ref(false);
const willHide = computed(() => !moderateTarget.value?.hiddenAt);

function openModerate(collection: AdminCollectionRow) {
  moderateReason.value = "";
  moderateTarget.value = collection;
}

async function confirmModerate() {
  const collection = moderateTarget.value;
  const reason = moderateReason.value.trim();

  if (!collection || !reason || moderating.value) return;

  const hidden = willHide.value;

  moderating.value = true;

  try {
    await $fetch(`/api/admin/collections/${collection.id}`, {
      method: "PATCH",
      body: { hidden, reason },
    });

    moderateTarget.value = null;
    await refresh();
    emit("changed");

    toast.add({
      title: hidden ? "Collection hidden" : "Collection restored",
      description: hidden
        ? `${collection.name} is no longer public. Its posters are not affected.`
        : `${collection.name} is back to its owner's visibility setting.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: hidden
        ? "Could not hide the collection"
        : "Could not restore the collection",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    moderating.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="searchInput"
        placeholder="Search by name or owner"
        icon="material-symbols:search"
        class="w-full sm:w-80"
        @keydown.enter="submitSearch"
      />

      <UButton size="sm" label="Search" @click="submitSearch" />

      <USelect
        v-model="visibilityFilter"
        :items="visibilityItems"
        class="w-44"
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

      <span class="text-muted ml-auto text-sm">
        {{ total.toLocaleString() }}
        {{ total === 1 ? "collection" : "collections" }}
      </span>
    </div>

    <p class="text-muted text-sm">
      A collection only groups posters for viewing. Hiding one takes down its
      page and its cards on profiles, organizations and Discover, and leaves its
      posters published.
    </p>

    <UiSpinner :loading="collectionsStatus === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable :data="collections" :columns="columns">
          <template #name-cell="{ row }">
            <div class="max-w-xs">
              <span class="block break-words whitespace-normal">
                <SearchHighlight
                  :text="row.original.name"
                  :term="highlightTerm"
                />
              </span>

              <span
                v-if="row.original.conference"
                class="text-muted block truncate text-xs"
              >
                {{ row.original.conference }}
              </span>
            </div>
          </template>

          <template #owner-cell="{ row }">
            <span class="block text-sm">
              <SearchHighlight
                :text="
                  `${row.original.owner.givenName} ${row.original.owner.familyName}`.trim()
                "
                :term="highlightTerm"
              />

              <span class="text-muted block text-xs">
                <SearchHighlight
                  :text="row.original.owner.emailAddress"
                  :term="highlightTerm"
                />
              </span>
            </span>
          </template>

          <template #visibility-cell="{ row }">
            <UTooltip
              v-if="row.original.hiddenAt"
              :text="row.original.hiddenReason"
            >
              <UBadge
                color="error"
                variant="subtle"
                size="sm"
                icon="i-heroicons-eye-slash"
              >
                Hidden
              </UBadge>
            </UTooltip>

            <UBadge
              v-else
              :color="row.original.isPublic ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ row.original.isPublic ? "Public" : "Private" }}
            </UBadge>
          </template>

          <template #created-cell="{ row }">
            {{ formatDate(row.original.created) }}
          </template>

          <template #actions-cell="{ row }">
            <div class="flex items-center justify-end gap-2">
              <UButton
                :to="row.original.path"
                target="_blank"
                size="xs"
                color="neutral"
                variant="outline"
                label="View"
              />

              <UButton
                size="xs"
                :color="row.original.hiddenAt ? 'neutral' : 'error'"
                variant="subtle"
                :label="row.original.hiddenAt ? 'Restore' : 'Hide'"
                @click="openModerate(row.original)"
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
      v-model:open="moderateOpen"
      :title="willHide ? 'Hide collection' : 'Restore collection'"
      :description="
        moderateTarget
          ? willHide
            ? `Take down ${moderateTarget.name}. Its posters stay published.`
            : `Bring back ${moderateTarget.name}, subject to its owner's visibility setting.`
          : ''
      "
    >
      <template #body>
        <UFormField
          label="Reason"
          :help="
            willHide
              ? 'Kept in the audit log and shown to its owner.'
              : 'Kept in the audit log.'
          "
          required
        >
          <UTextarea
            v-model="moderateReason"
            :rows="3"
            :maxlength="1000"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-3">
          <UButton
            color="neutral"
            variant="subtle"
            label="Cancel"
            @click="close"
          />

          <UButton
            :color="willHide ? 'error' : 'primary'"
            :label="willHide ? 'Hide collection' : 'Restore collection'"
            :disabled="!moderateReason.trim()"
            :loading="moderating"
            @click="confirmModerate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
