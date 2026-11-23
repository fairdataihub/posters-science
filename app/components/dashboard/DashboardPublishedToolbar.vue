<script setup lang="ts">
import type { PosterRepository } from "#shared/types/dashboardFeed";
import {
  DISCOVER_SEARCH_FIELD_LABELS,
  parseDiscoverSearch,
} from "#shared/utils/discoverSearch";
import {
  POSTER_REPOSITORY_LABELS,
  PUBLISHED_SORT_OPTIONS,
} from "~/composables/useDashboardQuery";
import type {
  FacetOption,
  PublishedFilter,
  PublishedFilterOption,
  PublishedSort,
} from "~/types/dashboard";

// The Published view's search row: the Discover search box, one button for
// every filter and the sort, and the active filters as removable badges, as
// on profile pages. The page keeps all of it in the query string.

const props = defineProps<{
  /** The kinds of poster, offered here on small screens only. */
  kinds: PublishedFilterOption[];
  repositoryOptions: FacetOption<PosterRepository>[];
  yearOptions: FacetOption<number>[];
  licenseOptions: FacetOption[];
  /** How many deleted posters the switch would show or hide. */
  deletedCount: number;
  /** Names batch cards and their poster contents separately. */
  resultSummary: string;
  searching?: boolean;
}>();

const search = defineModel<string>("search", { required: true });
const kind = defineModel<PublishedFilter>("kind", { required: true });
const sort = defineModel<PublishedSort>("sort", { required: true });
const repositories = defineModel<PosterRepository[]>("repositories", {
  required: true,
});
const years = defineModel<number[]>("years", { required: true });
const licenses = defineModel<string[]>("licenses", { required: true });
const showDeleted = defineModel<boolean>("showDeleted", { required: true });

// What's typed, submitted on Enter or with the button.
const draft = ref(search.value);

watch(search, (value) => {
  draft.value = value;
});

function submitSearch() {
  search.value = draft.value.trim();
}

const deletedIncluded = computed(
  () => props.deletedCount > 0 && showDeleted.value,
);

const filterCount = computed(
  () =>
    repositories.value.length +
    years.value.length +
    licenses.value.length +
    (deletedIncluded.value ? 1 : 0),
);

function clearFilters() {
  repositories.value = [];
  years.value = [];
  licenses.value = [];
  showDeleted.value = false;
}

function clearAll() {
  search.value = "";
  clearFilters();
}

// Checkbox values are strings, so years are written out.
const checkboxItems = <T extends string | number>(
  options: FacetOption<T>[],
  selected: T[],
) =>
  options.map((option) => ({
    value: String(option.value),
    label: `${option.label} (${option.count.toLocaleString()})`,
    // A choice nothing has is off, unless it's ticked, so it can be unticked.
    disabled: option.count === 0 && !selected.includes(option.value),
  }));

const repositoryItems = computed(() =>
  checkboxItems(props.repositoryOptions, repositories.value),
);
const yearItems = computed(() => checkboxItems(props.yearOptions, years.value));
const licenseItems = computed(() =>
  checkboxItems(props.licenseOptions, licenses.value),
);

const checkedYears = computed<string[]>({
  get: () => years.value.map(String),
  set: (values) => {
    years.value = values.map(Number);
  },
});

const resultLabel = computed(() => {
  if (props.searching) return "Searching...";

  return props.resultSummary;
});

// Active filters, shown as removable badges like on profile pages.
const activeBadges = computed(() => {
  const badges: Array<{ key: string; label: string; onRemove: () => void }> =
    [];
  const { clauses, freeText } = parseDiscoverSearch(search.value);

  if (freeText || clauses.length > 0) {
    const parts = clauses.map(
      ({ field, term }) => `${DISCOVER_SEARCH_FIELD_LABELS[field]}: ${term}`,
    );

    if (freeText) parts.unshift(freeText);

    badges.push({
      key: "search",
      label: `Search: ${parts.join(", ")}`,
      onRemove: () => {
        search.value = "";
      },
    });
  }

  for (const repository of repositories.value) {
    badges.push({
      key: `repository:${repository}`,
      label: `Repository: ${POSTER_REPOSITORY_LABELS[repository]}`,
      onRemove: () => {
        repositories.value = repositories.value.filter((r) => r !== repository);
      },
    });
  }

  for (const year of years.value) {
    badges.push({
      key: `year:${year}`,
      label: `Year: ${year}`,
      onRemove: () => {
        years.value = years.value.filter((y) => y !== year);
      },
    });
  }

  for (const license of licenses.value) {
    badges.push({
      key: `license:${license}`,
      label: `License: ${license}`,
      onRemove: () => {
        licenses.value = licenses.value.filter((l) => l !== license);
      },
    });
  }

  if (deletedIncluded.value) {
    badges.push({
      key: "deleted",
      label: "Deleted posters included",
      onRemove: () => {
        showDeleted.value = false;
      },
    });
  }

  return badges;
});
</script>

<template>
  <UDashboardToolbar
    :ui="{ root: 'flex-col items-stretch justify-start gap-0 pt-4' }"
  >
    <DiscoverSearchBar
      v-model="draft"
      :committed="search"
      placeholder="Search your posters by title, author, DOI..."
      button-label="Search"
      @submit="submitSearch"
    >
      <div class="flex grow items-center justify-between gap-3">
        <p class="text-muted text-sm" aria-live="polite">
          {{ resultLabel }}
        </p>

        <UPopover :content="{ align: 'end' }">
          <UTooltip text="Filters and sorting">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-sliders-horizontal"
              aria-label="Filters and sorting"
            >
              <template v-if="filterCount" #trailing>
                <UBadge color="primary" size="xs">{{ filterCount }}</UBadge>
              </template>
            </UButton>
          </UTooltip>

          <template #content>
            <div
              class="max-h-[min(36rem,70vh)] w-80 max-w-[calc(100vw-2rem)] space-y-5 overflow-y-auto p-4"
            >
              <!-- The sidebar lists these on large screens, but it's a menu
                   on small ones, so they're offered here too. -->
              <div class="space-y-2 lg:hidden">
                <p class="text-sm font-medium">Show</p>

                <div
                  class="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Kind of poster"
                >
                  <UButton
                    v-for="option in kinds"
                    :key="option.value"
                    size="xs"
                    :color="kind === option.value ? 'primary' : 'neutral'"
                    :variant="kind === option.value ? 'solid' : 'outline'"
                    :aria-pressed="kind === option.value"
                    @click="kind = option.value"
                  >
                    {{ option.label }}
                  </UButton>
                </div>
              </div>

              <div class="space-y-2">
                <p class="text-sm font-medium">Sort by</p>

                <USelect
                  v-model="sort"
                  :items="PUBLISHED_SORT_OPTIONS"
                  value-key="value"
                  aria-label="Sort by"
                  class="w-full"
                />
              </div>

              <USwitch
                v-if="deletedCount > 0"
                v-model="showDeleted"
                :label="`Show deleted posters (${deletedCount.toLocaleString()})`"
                size="sm"
              />

              <UCheckboxGroup
                v-model="repositories"
                legend="Repository"
                :items="repositoryItems"
                size="sm"
              />

              <UCheckboxGroup
                v-if="yearItems.length > 0"
                v-model="checkedYears"
                legend="Publication year"
                :items="yearItems"
                size="sm"
              />

              <UCheckboxGroup
                v-if="licenseItems.length > 0"
                v-model="licenses"
                legend="License"
                :items="licenseItems"
                size="sm"
              />

              <div class="border-default flex justify-end border-t pt-3">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  label="Clear filters"
                  :disabled="filterCount === 0"
                  @click="clearFilters"
                />
              </div>
            </div>
          </template>
        </UPopover>
      </div>
    </DiscoverSearchBar>

    <div
      v-if="activeBadges.length > 0"
      class="flex flex-wrap items-center gap-2 pb-4"
    >
      <span class="text-muted text-sm">Active filters:</span>

      <UBadge
        v-for="badge in activeBadges"
        :key="badge.key"
        color="primary"
        variant="subtle"
        size="md"
        trailing-icon="i-lucide-x"
        class="cursor-pointer"
        :title="`Remove filter: ${badge.label}`"
        @click="badge.onRemove"
      >
        {{ badge.label }}
      </UBadge>

      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        label="Clear all"
        @click="clearAll"
      />
    </div>
  </UDashboardToolbar>
</template>
