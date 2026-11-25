<script setup lang="ts">
import type {
  CollectionSearchResponse,
  CollectionSearchResult,
  CollectionSearchSort,
} from "#shared/types/collection";
import {
  DISCOVER_SEARCH_FIELD_LABELS,
  parseDiscoverSearch,
  withoutDiscoverClause,
  withoutDiscoverFreeText,
} from "#shared/utils/discoverSearch";

// Every public collection, searchable with the Discover search syntax. The
// /discover band shows the top three; this page has the rest. Poster filters
// carried over from /discover still narrow the "posters inside" match.

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Discover Collections - Posters.science")}&description=${encodeURIComponent("Browse groups of posters from conferences, projects and labs.")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Discover Collections",
  description: "Browse groups of posters from conferences, projects and labs.",
  ogTitle: "Discover Collections - Posters.science",
  ogDescription:
    "Browse groups of posters from conferences, projects and labs.",
  ogImage,
});

const route = useRoute();
const router = useRouter();

const PAGE_SIZE = 12;

// The poster filters /discover can hand over. They only narrow which posters
// inside a collection count as a match.
const FILTER_PARAMS = [
  "source",
  "language",
  "license",
  "publicationYear",
  "institution",
  "funder",
] as const;

const FILTER_LABELS: Record<(typeof FILTER_PARAMS)[number], string> = {
  source: "Source",
  language: "Language",
  license: "License",
  publicationYear: "Year",
  institution: "Institution",
  funder: "Funder",
};

function queryList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];

  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

const searchQuery = ref(
  typeof route.query.search === "string" ? route.query.search : "",
);
const committedSearch = computed(() =>
  typeof route.query.search === "string" ? route.query.search : "",
);
const page = computed({
  get: () => Math.max(1, Number(route.query.page) || 1),
  set: (value: number) =>
    updateQuery({ page: value > 1 ? String(value) : undefined }),
});

const parsedSearch = computed(() => parseDiscoverSearch(committedSearch.value));

const filters = computed(
  () =>
    Object.fromEntries(
      FILTER_PARAMS.map((param) => [param, queryList(route.query[param])]),
    ) as Record<(typeof FILTER_PARAMS)[number], string[]>,
);

const searching = computed(
  () =>
    parsedSearch.value.freeText !== "" ||
    parsedSearch.value.clauses.length > 0 ||
    FILTER_PARAMS.some((param) => filters.value[param].length > 0),
);

// Match on: both by default, stored as ?match=details or ?match=posters.
const matchDetails = computed(() => route.query.match !== "posters");
const matchPosters = computed(() => route.query.match !== "details");

function setMatch(kind: "details" | "posters", on: boolean) {
  const details = kind === "details" ? on : matchDetails.value;
  const posters = kind === "posters" ? on : matchPosters.value;

  // At least one has to stay on.
  if (!details && !posters) return;

  updateQuery({
    match: details && posters ? undefined : details ? "details" : "posters",
    page: undefined,
  });
}

const SORT_ITEMS = computed(() => [
  ...(searching.value ? [{ label: "Relevance", value: "relevance" }] : []),
  { label: "Newest", value: "newest" },
  { label: "Name (A to Z)", value: "name" },
  { label: "Most posters", value: "posters" },
]);

const sortBy = computed<CollectionSearchSort>({
  get: () => {
    const value = route.query.sortBy;
    const allowed = SORT_ITEMS.value.map((item) => item.value);

    if (typeof value === "string" && allowed.includes(value)) {
      return value as CollectionSearchSort;
    }

    return searching.value ? "relevance" : "newest";
  },
  set: (value) => updateQuery({ sortBy: value, page: undefined }),
});

function updateQuery(patch: Record<string, string | string[] | undefined>) {
  router.replace({ query: { ...route.query, ...patch } });
}

function submitSearch() {
  updateQuery({
    search: searchQuery.value.trim() || undefined,
    page: undefined,
    sortBy: undefined,
  });
}

function applySearch(value: string) {
  searchQuery.value = value;
  submitSearch();
}

const apiQuery = computed(() => ({
  search: committedSearch.value || undefined,
  page: page.value,
  limit: PAGE_SIZE,
  sortBy: sortBy.value,
  match:
    matchDetails.value && matchPosters.value
      ? undefined
      : matchDetails.value
        ? "details"
        : "posters",
  ...Object.fromEntries(
    FILTER_PARAMS.map((param) => [
      param,
      filters.value[param].length > 0 ? filters.value[param] : undefined,
    ]),
  ),
}));

const { data, status } = await useFetch<CollectionSearchResponse>(
  "/api/discover/collections",
  { query: apiQuery },
);

const collections = computed(() => data.value?.collections ?? []);
const total = computed(() => data.value?.total ?? 0);

// The same search on /discover, for the slim row back to the posters.
const { data: posterData } = useFetch<{ total: number }>("/api/discover", {
  query: computed(() => ({
    ...apiQuery.value,
    page: 1,
    limit: 1,
    sortBy: undefined,
    match: undefined,
  })),
  server: false,
  lazy: true,
});

const backLink = computed(() => {
  // Keep the collections band on, since it's off by default.
  const query: Record<string, string | string[]> = { collections: "on" };

  if (committedSearch.value) query.search = committedSearch.value;

  for (const param of FILTER_PARAMS) {
    if (filters.value[param].length > 0) query[param] = filters.value[param];
  }

  return { path: "/discover", query };
});

const backLabel = computed(() => {
  const count = posterData.value?.total;

  if (count === undefined) return "Back to posters";

  return `Back to ${count.toLocaleString()} ${count === 1 ? "poster" : "posters"}`;
});

const highlight = computed(() => [
  ...(parsedSearch.value.freeText ? [parsedSearch.value.freeText] : []),
  ...parsedSearch.value.clauses
    .filter((clause) => clause.field === "collection")
    .map((clause) => clause.term),
]);

function reasonLabel(result: CollectionSearchResult) {
  if (!searching.value || !result.reason) return undefined;
  if (result.reason === "name") return "Name match";
  if (result.reason === "details") return "Details match";

  const n = result.matchingPosterCount;

  return `${n.toLocaleString()} matching ${n === 1 ? "poster" : "posters"}`;
}

type Badge = { key: string; label: string; onRemove: () => void };

const badges = computed<Badge[]>(() => {
  const parsed = parsedSearch.value;
  const out: Badge[] = parsed.clauses.map(({ field, term }, index) => ({
    key: `search:${index}`,
    label: `${DISCOVER_SEARCH_FIELD_LABELS[field]}: ${term}`,
    onRemove: () => applySearch(withoutDiscoverClause(parsed, index)),
  }));

  if (parsed.freeText) {
    out.push({
      key: "search:text",
      label: `Search: ${parsed.freeText}`,
      onRemove: () => applySearch(withoutDiscoverFreeText(parsed)),
    });
  }

  for (const param of FILTER_PARAMS) {
    for (const value of filters.value[param]) {
      out.push({
        key: `${param}:${value}`,
        label: `${FILTER_LABELS[param]}: ${value}`,
        onRemove: () =>
          updateQuery({
            [param]: filters.value[param].filter((v) => v !== value),
            page: undefined,
          }),
      });
    }
  }

  return out;
});

function clearAll() {
  searchQuery.value = "";
  router.replace({ query: {} });
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-6">
    <UPageHeader
      title="Discover Collections"
      description="Groups of posters from conferences, projects and labs, put together by the people who shared them."
    />

    <NuxtLink
      :to="backLink"
      class="border-default hover:bg-elevated flex items-center gap-3 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />

      <span class="truncate">{{ backLabel }}</span>
    </NuxtLink>

    <div class="flex gap-6">
      <div class="hidden w-72 flex-shrink-0 md:block">
        <UCard class="sticky top-4">
          <template #header>
            <h3 class="text-lg font-semibold">Match on</h3>
          </template>

          <div class="space-y-4">
            <UCheckbox
              :model-value="matchDetails"
              :disabled="matchDetails && !matchPosters"
              label="Collection details"
              description="Name, description, conference and owner."
              @update:model-value="setMatch('details', $event === true)"
            />

            <UCheckbox
              :model-value="matchPosters"
              :disabled="matchPosters && !matchDetails"
              label="Posters inside"
              description="Collections holding a poster that matches."
              @update:model-value="setMatch('posters', $event === true)"
            />
          </div>
        </UCard>
      </div>

      <div class="min-w-0 flex-1">
        <DiscoverSearchBar
          v-model="searchQuery"
          :committed="committedSearch"
          scope="collections"
          placeholder="Search collections, conferences, owners..."
          button-label="Search Collections"
          @submit="submitSearch"
        />

        <div class="mb-4 flex flex-wrap gap-4 md:hidden">
          <UCheckbox
            :model-value="matchDetails"
            :disabled="matchDetails && !matchPosters"
            label="Collection details"
            @update:model-value="setMatch('details', $event === true)"
          />

          <UCheckbox
            :model-value="matchPosters"
            :disabled="matchPosters && !matchDetails"
            label="Posters inside"
            @update:model-value="setMatch('posters', $event === true)"
          />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pb-4">
          <p class="text-sm">
            {{ total.toLocaleString() }}
            {{ total === 1 ? "collection" : "collections" }} found
          </p>

          <div class="flex items-center gap-2">
            <p>Sort by:</p>

            <USelect
              v-model="sortBy"
              :items="SORT_ITEMS"
              value-key="value"
              class="w-40"
            />
          </div>
        </div>

        <div
          v-if="badges.length"
          class="flex flex-wrap items-center gap-2 pb-4"
        >
          <span class="text-sm text-gray-500">Active filters:</span>

          <UBadge
            v-for="badge in badges"
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

          <UButton color="neutral" variant="ghost" size="xs" @click="clearAll">
            Clear all
          </UButton>
        </div>

        <UiSpinner :loading="status === 'pending'" overlay>
          <ul
            v-if="collections.length > 0"
            class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <li v-for="collection in collections" :key="collection.id">
              <CollectionCard
                :collection="collection"
                :reason="reasonLabel(collection)"
              >
                <template #name>
                  <SearchHighlight :text="collection.name" :term="highlight" />
                </template>
              </CollectionCard>
            </li>
          </ul>

          <UEmpty
            v-else
            icon="i-lucide-library-big"
            :title="searching ? 'No collections found' : 'No collections yet'"
            :description="
              searching
                ? 'Try another search, or match on both collection details and posters inside.'
                : 'Public collections will show here once people make them.'
            "
          />
        </UiSpinner>

        <div class="flex justify-center pt-8 pb-4">
          <UPagination
            v-model:page="page"
            :loading="status === 'pending'"
            :total="total"
            :items-per-page="PAGE_SIZE"
            variant="outline"
          />
        </div>
      </div>
    </div>
  </div>
</template>
