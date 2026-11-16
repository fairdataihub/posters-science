<script setup lang="ts">
import type {
  CollectionSearchResponse,
  CollectionSearchResult,
} from "#shared/types/collection";
import type { LocationQueryRaw } from "vue-router";

// The top three collections above the Discover poster grid: the newest before
// a search, the best matches after one. A slim row at the end opens
// /discover/collections with the same search and filters.

const props = defineProps<{
  /** The search and sidebar filters, as /discover sends them. */
  query: LocationQueryRaw;
  /** The submitted search, for the See all label. */
  searchText: string;
  /** Terms to mark in collection names. */
  highlight: string[];
  /** A search or a filter is active. */
  active: boolean;
}>();

// Loaded in the browser so the poster grid never waits on it.
const { data, status } = useFetch<CollectionSearchResponse>(
  "/api/discover/collections",
  {
    query: computed(() => ({ ...props.query, limit: 3, page: 1 })),
    server: false,
    lazy: true,
  },
);

const collections = computed(() => data.value?.collections ?? []);
const total = computed(() => data.value?.total ?? 0);

const seeAllLink = computed(() => {
  const query: LocationQueryRaw = {};

  for (const [key, value] of Object.entries(props.query)) {
    if (value !== undefined && value !== "" && key !== "page") {
      query[key] = value;
    }
  }

  return { path: "/discover/collections", query };
});

const seeAllLabel = computed(() => {
  const count = `${total.value.toLocaleString()} ${total.value === 1 ? "collection" : "collections"}`;

  return props.searchText
    ? `See all ${count} for "${props.searchText}"`
    : `See all ${count}`;
});

function reasonLabel(result: CollectionSearchResult) {
  if (!props.active || !result.reason) return undefined;
  if (result.reason === "name") return "Name match";
  if (result.reason === "details") return "Details match";

  const n = result.matchingPosterCount;

  return `${n.toLocaleString()} matching ${n === 1 ? "poster" : "posters"}`;
}

function trackOpen(result: CollectionSearchResult) {
  window.umami?.track("collection_band_clicked", {
    reason: result.reason ?? "new",
  });
}

function trackSeeAll() {
  window.umami?.track("collection_band_see_all");
}
</script>

<template>
  <section
    v-if="status === 'pending' || collections.length > 0"
    class="border-default mb-6 rounded-xl border bg-gray-50/80 p-4 dark:bg-gray-900/60"
    aria-labelledby="collection-band-title"
  >
    <div class="mb-3 flex items-center gap-2">
      <UIcon name="i-lucide-library-big" class="text-primary size-5" />

      <h2 id="collection-band-title" class="font-semibold">
        {{ active ? "Collections" : "New collections" }}
      </h2>

      <span class="text-muted text-sm">
        {{
          active
            ? "Groups of posters that match your search"
            : "Posters grouped by the people who shared them"
        }}
      </span>
    </div>

    <UiSpinner :loading="status === 'pending'" subtle>
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="collection in collections" :key="collection.id">
          <CollectionCard
            :collection="collection"
            :reason="reasonLabel(collection)"
            @open="trackOpen(collection)"
          >
            <template #name>
              <SearchHighlight :text="collection.name" :term="highlight" />
            </template>
          </CollectionCard>
        </li>
      </ul>
    </UiSpinner>

    <NuxtLink
      v-if="collections.length > 0"
      :to="seeAllLink"
      class="border-default hover:bg-elevated mt-3 flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-2 text-sm font-medium transition-colors dark:bg-gray-950"
      @click="trackSeeAll"
    >
      <span class="truncate">{{ seeAllLabel }}</span>

      <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
    </NuxtLink>
  </section>
</template>
