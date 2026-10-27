<script setup lang="ts">
import type { LocationQueryValue } from "vue-router";
import type { ProfilePoster } from "./PosterCard.vue";
import {
  DISCOVER_SEARCH_FIELD_LABELS,
  discoverHighlightTerms,
  parseDiscoverSearch,
} from "#shared/utils/discoverSearch";

// Search, filters and sorting for the posters on a public profile, laid out
// like /discover. Everything lives in the query string so a filtered view can
// be shared, survives a reload and carries across the Posters and Liked tabs.
// The search itself runs on the server (the page passes the matching ids);
// the facet filters and sorting run here, since a profile is a short list.

const props = defineProps<{
  posters: ProfilePoster[];
  /** Root ids matching the submitted search, or null when there is none. */
  searchMatches: number[] | null;
  kind: "posters" | "liked";
  isOwner: boolean;
}>();

const route = useRoute();
const router = useRouter();

function updateQuery(patch: Record<string, string | string[] | undefined>) {
  router.replace({ query: { ...route.query, ...patch } });
}

function queryList(value: LocationQueryValue | LocationQueryValue[]) {
  const values = Array.isArray(value) ? value : [value];

  return values.filter((v): v is string => typeof v === "string" && v !== "");
}

// Search
const committedSearch = computed(() =>
  typeof route.query.search === "string" ? route.query.search : "",
);
const searchQuery = ref(committedSearch.value);

watch(committedSearch, (value) => {
  searchQuery.value = value;
});

function submitSearch() {
  updateQuery({ search: searchQuery.value.trim() || undefined });
}

const parsedSearch = computed(() => parseDiscoverSearch(committedSearch.value));
const highlightTerms = computed(() =>
  discoverHighlightTerms(parsedSearch.value),
);

const searched = computed(() => {
  if (!props.searchMatches) return props.posters;

  const matches = new Set(props.searchMatches);

  return props.posters.filter((poster) => matches.has(poster.posterId));
});

// Self-published or claimed (the Posters tab only)
type RoleFilter = "all" | "published" | "claimed";

const roleFilter = computed<RoleFilter>({
  get: () => {
    const show = route.query.show;

    return show === "published" || show === "claimed" ? show : "all";
  },
  set: (filter) => updateQuery({ show: filter === "all" ? undefined : filter }),
});

const roleOptions = computed(() => [
  { value: "all" as const, label: "All", count: searched.value.length },
  {
    value: "published" as const,
    label: "Self-published",
    count: searched.value.filter((p) => p.role === "publisher").length,
  },
  {
    value: "claimed" as const,
    label: "Claimed",
    count: searched.value.filter((p) => p.role === "author").length,
  },
]);

const roleFiltered = computed(() => {
  if (props.kind !== "posters" || roleFilter.value === "all") {
    return searched.value;
  }

  const role = roleFilter.value === "published" ? "publisher" : "author";

  return searched.value.filter((poster) => poster.role === role);
});

// Facet filters, with options and counts drawn from this profile's posters
const yearFilter = computed<number[]>({
  get: () =>
    queryList(route.query.year)
      .map((value) => Number.parseInt(value, 10))
      .filter((year) => Number.isFinite(year)),
  set: (years) =>
    updateQuery({ year: years.length ? years.map(String) : undefined }),
});
const languageFilter = computed<string[]>({
  get: () => queryList(route.query.language),
  set: (values) =>
    updateQuery({ language: values.length ? values : undefined }),
});
const licenseFilter = computed<string[]>({
  get: () => queryList(route.query.license),
  set: (values) => updateQuery({ license: values.length ? values : undefined }),
});

function facetCounts<T extends string | number>(
  values: Array<T | null>,
  label: (value: T) => string,
) {
  const counts = new Map<T, number>();

  for (const value of values) {
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const yearOptions = computed(() =>
  facetCounts(
    roleFiltered.value.map((p) => p.publicationYear),
    String,
  ).sort((a, b) => b.value - a.value),
);
const languageOptions = computed(() => {
  const labels = new Map(
    roleFiltered.value.map((p) => [p.language, p.languageLabel]),
  );

  return facetCounts(
    roleFiltered.value.map((p) => p.language),
    (code) => labels.get(code) ?? code,
  );
});
const licenseOptions = computed(() =>
  facetCounts(
    roleFiltered.value.map((p) => p.license),
    (license) => license,
  ),
);

const filtered = computed(() =>
  roleFiltered.value.filter(
    (poster) =>
      (yearFilter.value.length === 0 ||
        (poster.publicationYear !== null &&
          yearFilter.value.includes(poster.publicationYear))) &&
      (languageFilter.value.length === 0 ||
        (poster.language !== null &&
          languageFilter.value.includes(poster.language))) &&
      (licenseFilter.value.length === 0 ||
        (poster.license !== null &&
          licenseFilter.value.includes(poster.license))),
  ),
);

// Sorting
const sortItems = computed(() => [
  { value: "published", label: "Recently published" },
  { value: "published-oldest", label: "Oldest published" },
  { value: "modified", label: "Recently modified" },
  {
    value: "added",
    label: props.kind === "liked" ? "Recently liked" : "Recently added",
  },
  { value: "likes", label: "Most liked" },
  { value: "title", label: "Title (A to Z)" },
]);

const defaultSort = computed(() =>
  props.kind === "liked" ? "added" : "published",
);

const sortBy = computed({
  get: () => {
    const sort = route.query.sort;

    return typeof sort === "string" &&
      sortItems.value.some((item) => item.value === sort)
      ? sort
      : defaultSort.value;
  },
  set: (sort: string) =>
    updateQuery({ sort: sort === defaultSort.value ? undefined : sort }),
});

const time = (value: string | null) => (value ? Date.parse(value) : 0);

const sorted = computed(() => {
  const list = [...filtered.value];

  switch (sortBy.value) {
    case "published-oldest":
      return list.sort((a, b) => time(a.publishedAt) - time(b.publishedAt));
    case "modified":
      return list.sort((a, b) => time(b.updated) - time(a.updated));
    case "added":
      return list.sort((a, b) => time(b.addedAt) - time(a.addedAt));
    case "likes":
      return list.sort((a, b) => b.likes - a.likes);
    case "title":
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case "published":
    default:
      return list.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));
  }
});

// Active filters, shown as removable badges like on /discover
const activeBadges = computed(() => {
  const badges: Array<{ key: string; label: string; onRemove: () => void }> =
    [];
  const { clauses, freeText } = parsedSearch.value;

  if (props.kind === "posters" && roleFilter.value !== "all") {
    badges.push({
      key: "show",
      label: `Showing: ${roleFilter.value === "published" ? "Self-published" : "Claimed"}`,
      onRemove: () => {
        roleFilter.value = "all";
      },
    });
  }

  if (freeText || clauses.length > 0) {
    const parts = clauses.map(
      ({ field, term }) => `${DISCOVER_SEARCH_FIELD_LABELS[field]}: ${term}`,
    );

    if (freeText) parts.unshift(freeText);

    badges.push({
      key: "search",
      label: `Search: ${parts.join(", ")}`,
      onRemove: () => updateQuery({ search: undefined }),
    });
  }

  for (const year of yearFilter.value) {
    badges.push({
      key: `year:${year}`,
      label: `Year: ${year}`,
      onRemove: () => {
        yearFilter.value = yearFilter.value.filter((y) => y !== year);
      },
    });
  }

  for (const code of languageFilter.value) {
    const label =
      props.posters.find((p) => p.language === code)?.languageLabel ?? code;

    badges.push({
      key: `language:${code}`,
      label: `Language: ${label}`,
      onRemove: () => {
        languageFilter.value = languageFilter.value.filter((l) => l !== code);
      },
    });
  }

  for (const license of licenseFilter.value) {
    badges.push({
      key: `license:${license}`,
      label: `License: ${license}`,
      onRemove: () => {
        licenseFilter.value = licenseFilter.value.filter((l) => l !== license);
      },
    });
  }

  return badges;
});

function clearAll() {
  updateQuery({
    search: undefined,
    show: undefined,
    year: undefined,
    language: undefined,
    license: undefined,
  });
}

// Selections made in the Filters popup, shown as a count on its button.
const filterCount = computed(
  () =>
    (props.kind === "posters" && roleFilter.value !== "all" ? 1 : 0) +
    yearFilter.value.length +
    languageFilter.value.length +
    licenseFilter.value.length,
);

function clearFilters() {
  updateQuery({
    show: undefined,
    year: undefined,
    language: undefined,
    license: undefined,
  });
}

const noun = computed(() =>
  props.kind === "liked" ? "liked poster" : "poster",
);
</script>

<template>
  <UEmpty
    v-if="posters.length === 0"
    :icon="kind === 'liked' ? 'i-heroicons-heart' : 'i-lucide-file'"
    :title="kind === 'liked' ? 'No liked posters yet' : 'No posters yet'"
    :description="
      kind === 'liked'
        ? isOwner
          ? 'Posters you like on Discover will appear here.'
          : 'Posters this author likes will appear here.'
        : isOwner
          ? 'Share a poster or claim one you authored on Discover and it will appear here.'
          : 'This author has no public posters yet.'
    "
  />

  <div v-else>
    <DiscoverSearchBar
      v-model="searchQuery"
      :committed="committedSearch"
      :placeholder="
        kind === 'liked'
          ? 'Search liked posters by title, author, DOI...'
          : 'Search these posters by title, author, DOI...'
      "
      button-label="Search"
      @submit="submitSearch"
    >
      <!-- Grows from its natural width, so when the row is too narrow it
           moves below the search box as one piece instead of splitting. -->
      <div
        class="flex grow flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        <p class="text-sm whitespace-nowrap">
          {{ sorted.length }} {{ noun }}{{ sorted.length === 1 ? "" : "s" }}
          found
        </p>

        <div class="flex flex-wrap items-center gap-2">
          <!-- On profiles the filters sit in a popup rather than a sidebar,
               since a profile has far fewer posters than /discover. -->
          <UPopover :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-sliders-horizontal"
            >
              Filters
              <UBadge v-if="filterCount" color="primary" size="xs">
                {{ filterCount }}
              </UBadge>
            </UButton>

            <template #content>
              <div class="w-80 max-w-[calc(100vw-2rem)] space-y-5 p-4">
                <div v-if="kind === 'posters'" class="space-y-2">
                  <p class="text-sm font-medium">Show</p>

                  <div
                    class="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Filter by how the poster was added"
                  >
                    <UButton
                      v-for="option in roleOptions"
                      :key="option.value"
                      size="xs"
                      :color="
                        roleFilter === option.value ? 'primary' : 'neutral'
                      "
                      :variant="
                        roleFilter === option.value ? 'solid' : 'outline'
                      "
                      :disabled="option.value !== 'all' && option.count === 0"
                      :aria-pressed="roleFilter === option.value"
                      @click="roleFilter = option.value"
                    >
                      {{ option.label }} ({{ option.count }})
                    </UButton>
                  </div>
                </div>

                <DiscoverPublicationYearFilter
                  v-model="yearFilter"
                  :options="yearOptions"
                />

                <DiscoverLanguageFilter
                  v-model="languageFilter"
                  :options="languageOptions"
                />

                <DiscoverLicenseFilter
                  v-model="licenseFilter"
                  :options="licenseOptions"
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

          <div class="flex items-center gap-2">
            <p class="text-sm">Sort by:</p>

            <USelect
              v-model="sortBy"
              :items="sortItems"
              value-key="value"
              class="w-48"
            />
          </div>
        </div>
      </div>
    </DiscoverSearchBar>

    <div
      v-if="activeBadges.length > 0"
      class="flex flex-wrap items-center gap-2 pb-4"
    >
      <span class="text-sm text-gray-500">Active filters:</span>

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

    <UPageGrid v-if="sorted.length > 0">
      <ProfilePosterCard
        v-for="poster in sorted"
        :key="poster.posterId"
        :poster="poster"
        :highlight="highlightTerms"
      />
    </UPageGrid>

    <UEmpty
      v-else
      icon="i-lucide-filter-x"
      title="No posters match your search or filters"
      :actions="[
        {
          label: 'Clear all filters',
          color: 'neutral',
          variant: 'subtle',
          onClick: clearAll,
        },
      ]"
    />
  </div>
</template>
