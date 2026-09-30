<script setup lang="ts">
import dayjs from "dayjs";

import {
  DISCOVER_FREE_TEXT_FIELDS,
  DISCOVER_SEARCH_EXAMPLES,
  DISCOVER_SEARCH_FIELD_LABELS,
  discoverHighlightTerms,
  parseDiscoverSearch,
  withoutDiscoverClause,
  withoutDiscoverFreeText,
} from "#shared/utils/discoverSearch";

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Discover Posters - Posters.science")}&description=${encodeURIComponent("Find and explore scientific posters on a variety of topics.")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Discover Posters - Posters.science",
  description: "Find and explore scientific posters on a variety of topics.",
  ogTitle: "Discover Posters - Posters.science",
  ogDescription: "Find and explore scientific posters on a variety of topics.",
  ogImage,
});

const route = useRoute();
const router = useRouter();

// Filters use repeated query params (?institution=a&institution=b), so a
// route query value is a string (single) or string[] (repeated). Each entry is
// one whole value: never split on commas, because institution and funder names
// legitimately contain them.
function parseStringList(value: unknown): string[] {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];

  return arr.map((s) => String(s).trim()).filter(Boolean);
}

function parseNumberList(value: unknown): number[] {
  return parseStringList(value)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

const sourceFilterValue = ref<string[]>(parseStringList(route.query.source));
const languageFilterValue = ref<string[]>(
  parseStringList(route.query.language),
);
const licenseFilterValue = ref<string[]>(parseStringList(route.query.license));
const publicationYearFilterValue = ref<number[]>(
  parseNumberList(route.query.publicationYear),
);
const institutionFilterValue = ref<string[]>(
  parseStringList(route.query.institution),
);
const funderFilterValue = ref<string[]>(parseStringList(route.query.funder));

// Send each selection as a repeated query param (ofetch serializes non-empty
// arrays that way); undefined omits the param entirely when nothing is selected.
const sourceParam = computed(() =>
  sourceFilterValue.value.length > 0 ? sourceFilterValue.value : undefined,
);

const languageParam = computed(() =>
  languageFilterValue.value.length > 0 ? languageFilterValue.value : undefined,
);

const licenseParam = computed(() =>
  licenseFilterValue.value.length > 0 ? licenseFilterValue.value : undefined,
);

const publicationYearParam = computed(() =>
  publicationYearFilterValue.value.length > 0
    ? publicationYearFilterValue.value
    : undefined,
);

const institutionParam = computed(() =>
  institutionFilterValue.value.length > 0
    ? institutionFilterValue.value
    : undefined,
);

const funderParam = computed(() =>
  funderFilterValue.value.length > 0 ? funderFilterValue.value : undefined,
);

type Poster = {
  id: number | undefined;
  title: string;
  description: string;
  imageUrl: string;
  keywords: string[];
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  likes: number;
  automated: boolean;
};

type FacetOption = { value: string; label: string; count: number };
type YearFacetOption = { value: number; label: string; count: number };
type FacetsResponse = {
  languages: FacetOption[];
  licenses: FacetOption[];
  publicationYears: YearFacetOption[];
  institutions: FacetOption[];
  funders: FacetOption[];
};

const PAGE_SIZE = 9;

const page = ref(Number(route.query.page) || 1);

const sortBy = ref((route.query.sortBy as string) || "Newest First");
const posters = ref<Poster[]>([]);
const total = ref(0);
const searchQuery = ref((route.query.search as string) || "");
const committedSearch = ref((route.query.search as string) || "");

const getDicebearUrl = (poster: Pick<Poster, "id" | "title">) =>
  `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.id ?? poster.title}`;

const onImageError = (event: Event, poster: Pick<Poster, "id" | "title">) => {
  const img = event.target as HTMLImageElement;
  console.error("Image failed to load, using fallback URL.", {
    posterId: poster.id,
    posterTitle: poster.title,
  });
  const fallbackUrl = getDicebearUrl(poster);

  if (img.src === fallbackUrl) return;

  img.src = fallbackUrl;
};

const mapPosters = (apiPosters: Poster[]) => {
  return apiPosters.map((poster) => ({
    id: poster.id,
    title: poster.title ?? "Untitled poster",
    description: poster.description ?? "",
    imageUrl: poster.imageUrl || getDicebearUrl(poster),
    keywords: Array.isArray(poster.keywords) ? poster.keywords : [],
    publishedAt: poster.publishedAt ? new Date(poster.publishedAt) : null,
    created: poster.created ? poster.created : new Date(),
    updated: poster.updated ? poster.updated : new Date(),
    likes: typeof poster.likes === "number" ? poster.likes : 0,
    automated: typeof poster.automated === "boolean" ? poster.automated : false,
  }));
};

const { data: facetData } = await useFetch<FacetsResponse>(
  "/api/discover/facets",
);

const facetOptions = computed<FacetsResponse>(
  () =>
    facetData.value ?? {
      languages: [],
      licenses: [],
      publicationYears: [],
      institutions: [],
      funders: [],
    },
);

const { data, error, status } = await useFetch("/api/discover", {
  query: {
    search: committedSearch,
    page,
    limit: PAGE_SIZE,
    sortBy,
    source: sourceParam,
    language: languageParam,
    license: licenseParam,
    publicationYear: publicationYearParam,
    institution: institutionParam,
    funder: funderParam,
  },
});

function triggerSearch() {
  committedSearch.value = searchQuery.value.trim();
  page.value = 1;
}

function applySearch(value: string) {
  searchQuery.value = value;
  triggerSearch();
}

const parsedSearch = computed(() => parseDiscoverSearch(committedSearch.value));

const highlightTerms = computed(() =>
  discoverHighlightTerms(parsedSearch.value),
);

const FREE_TEXT_SCOPE =
  "title, description, keywords, authors, affiliations, conference and DOI";

const searchScopeLabel = computed(() => {
  const { clauses, freeText } = parsedSearch.value;

  if (clauses.length === 0) {
    return freeText ? `Searching ${FREE_TEXT_SCOPE} for "${freeText}".` : "";
  }

  const parts = clauses.map(
    ({ field, term }) => `${DISCOVER_SEARCH_FIELD_LABELS[field]} "${term}"`,
  );

  if (freeText) parts.push(`"${freeText}" in any of the default fields`);

  return `Matching ${parts.join(" and ")}.`;
});

const searchHelp = (
  Object.keys(DISCOVER_SEARCH_EXAMPLES) as Array<
    keyof typeof DISCOVER_SEARCH_EXAMPLES
  >
).map((field) => ({
  field,
  label: DISCOVER_SEARCH_FIELD_LABELS[field],
  example: DISCOVER_SEARCH_EXAMPLES[field],
  inFreeText: (DISCOVER_FREE_TEXT_FIELDS as readonly string[]).includes(field),
}));

watch(sortBy, () => {
  page.value = 1;
});

watch(
  [
    sourceFilterValue,
    languageFilterValue,
    licenseFilterValue,
    publicationYearFilterValue,
    institutionFilterValue,
    funderFilterValue,
  ],
  () => {
    page.value = 1;
  },
  { deep: true },
);

watch(
  [
    page,
    committedSearch,
    sortBy,
    sourceFilterValue,
    languageFilterValue,
    licenseFilterValue,
    publicationYearFilterValue,
    institutionFilterValue,
    funderFilterValue,
  ],
  () => {
    // Write selections as repeated query params (arrays) so comma-containing
    // values (institution/funder names) round-trip intact through the URL.
    const query: Record<string, string | string[] | number[]> = {};
    if (page.value !== 1) query.page = String(page.value);
    if (committedSearch.value) query.search = committedSearch.value;
    if (sortBy.value !== "Newest First") query.sortBy = sortBy.value;
    if (sourceFilterValue.value.length > 0)
      query.source = sourceFilterValue.value;
    if (languageFilterValue.value.length > 0)
      query.language = languageFilterValue.value;
    if (licenseFilterValue.value.length > 0)
      query.license = licenseFilterValue.value;
    if (publicationYearFilterValue.value.length > 0)
      query.publicationYear = publicationYearFilterValue.value;
    if (institutionFilterValue.value.length > 0)
      query.institution = institutionFilterValue.value;
    if (funderFilterValue.value.length > 0)
      query.funder = funderFilterValue.value;
    router.replace({ query });
  },
  { deep: true },
);

watch(
  data,
  (val) => {
    if (!val) return;
    const apiPosters = (val.posters || []) as unknown as Poster[];
    posters.value = mapPosters(apiPosters);
    total.value = val.total ?? posters.value.length;
  },
  { immediate: true },
);

if (error.value) {
  console.error(error.value);
}

const totalFiltered = computed(() => total.value);

const showMobileFilter = ref(false);

// Lookup maps so badge labels can show human-friendly names
// (e.g. "en" -> "English", lowercased institution -> display name).
const languageLabelMap = computed(
  () => new Map(facetOptions.value.languages.map((o) => [o.value, o.label])),
);
const institutionLabelMap = computed(
  () => new Map(facetOptions.value.institutions.map((o) => [o.value, o.label])),
);

const SOURCE_LABELS: Record<string, string> = {
  zenodo: "Zenodo",
  figshare: "Figshare",
  user_submitted: "User-submitted",
};

type ActiveFilter = {
  key: string;
  label: string;
  onRemove: () => void;
};

const activeFilters = computed<ActiveFilter[]>(() => {
  const out: ActiveFilter[] = [];

  for (const v of institutionFilterValue.value) {
    out.push({
      key: `institution:${v}`,
      label: `Institution: ${institutionLabelMap.value.get(v) ?? v}`,
      onRemove: () => {
        institutionFilterValue.value = institutionFilterValue.value.filter(
          (x) => x !== v,
        );
      },
    });
  }

  for (const v of funderFilterValue.value) {
    out.push({
      key: `funder:${v}`,
      label: `Funder: ${v}`,
      onRemove: () => {
        funderFilterValue.value = funderFilterValue.value.filter(
          (x) => x !== v,
        );
      },
    });
  }

  for (const v of sourceFilterValue.value) {
    out.push({
      key: `source:${v}`,
      label: `Source: ${SOURCE_LABELS[v] ?? v}`,
      onRemove: () => {
        sourceFilterValue.value = sourceFilterValue.value.filter(
          (x) => x !== v,
        );
      },
    });
  }

  for (const v of publicationYearFilterValue.value) {
    out.push({
      key: `year:${v}`,
      label: `Year: ${v}`,
      onRemove: () => {
        publicationYearFilterValue.value =
          publicationYearFilterValue.value.filter((x) => x !== v);
      },
    });
  }

  for (const v of languageFilterValue.value) {
    out.push({
      key: `language:${v}`,
      label: `Language: ${languageLabelMap.value.get(v) ?? v}`,
      onRemove: () => {
        languageFilterValue.value = languageFilterValue.value.filter(
          (x) => x !== v,
        );
      },
    });
  }

  for (const v of licenseFilterValue.value) {
    out.push({
      key: `license:${v}`,
      label: `License: ${v}`,
      onRemove: () => {
        licenseFilterValue.value = licenseFilterValue.value.filter(
          (x) => x !== v,
        );
      },
    });
  }

  return out;
});

const searchBadges = computed<ActiveFilter[]>(() => {
  const parsed = parsedSearch.value;
  const out: ActiveFilter[] = parsed.clauses.map(({ field, term }, index) => ({
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

  return out;
});

const activeFilterCount = computed(() => activeFilters.value.length);
const hasActiveFilters = computed(() => activeFilterCount.value > 0);
const hasActiveBadges = computed(
  () => hasActiveFilters.value || searchBadges.value.length > 0,
);

function clearAllFilters() {
  if (committedSearch.value) applySearch("");
  sourceFilterValue.value = [];
  languageFilterValue.value = [];
  licenseFilterValue.value = [];
  publicationYearFilterValue.value = [];
  institutionFilterValue.value = [];
  funderFilterValue.value = [];
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-6">
    <UPageHeader
      title="Discover Posters"
      description="Find and explore posters on a variety of topics."
      :links="[
        {
          label: 'Smart Search',
          to: '/discover/smart-search',
          icon: 'si:ai-fill',
          size: 'lg',
          variant: 'solid' as const,
          color: 'primary' as const,
        },
      ]"
    />

    <UAlert
      icon="i-lucide-info"
      color="info"
      variant="soft"
      title="Download the full poster record in bulk"
      description="All poster records are archived on Zenodo in JSON format, making it convenient to download them for large scale analysis."
      :actions="[
        {
          label: 'Read the Bulk Corpus guide',
          to: 'https://docs.posters.science/docs/bulk-corpus.html',
          target: '_blank',
          icon: 'i-lucide-external-link',
          trailing: true,
          color: 'info',
          variant: 'solid',
        },
      ]"
    />

    <div class="flex gap-6">
      <div class="hidden w-80 flex-shrink-0 md:block">
        <UCard class="sticky top-4">
          <template #header>
            <h3 class="text-lg font-semibold">Filters</h3>
          </template>

          <div class="space-y-6">
            <DiscoverInstitutionFilter
              v-model="institutionFilterValue"
              :options="facetOptions.institutions"
            />

            <DiscoverFunderFilter
              v-model="funderFilterValue"
              :options="facetOptions.funders"
            />

            <DiscoverSourceFilter v-model="sourceFilterValue" />

            <DiscoverPublicationYearFilter
              v-model="publicationYearFilterValue"
              :options="facetOptions.publicationYears"
            />

            <DiscoverLanguageFilter
              v-model="languageFilterValue"
              :options="facetOptions.languages"
            />

            <DiscoverLicenseFilter
              v-model="licenseFilterValue"
              :options="facetOptions.licenses"
            />
          </div>
        </UCard>
      </div>

      <div class="min-w-0 flex-1">
        <!-- Mobile filter toggle - hidden on md+ -->
        <div class="mb-4 md:hidden">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-sliders-horizontal"
            :trailing-icon="
              showMobileFilter ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
            "
            class="w-full justify-between"
            @click="showMobileFilter = !showMobileFilter"
          >
            <span class="flex items-center gap-2">
              Filters
              <UBadge v-if="hasActiveFilters" color="primary" size="xs">{{
                activeFilterCount
              }}</UBadge>
            </span>
          </UButton>

          <div
            v-show="showMobileFilter"
            class="mt-2 space-y-6 rounded-lg border p-4"
          >
            <DiscoverInstitutionFilter
              v-model="institutionFilterValue"
              :options="facetOptions.institutions"
            />

            <DiscoverFunderFilter
              v-model="funderFilterValue"
              :options="facetOptions.funders"
            />

            <DiscoverSourceFilter v-model="sourceFilterValue" />

            <DiscoverPublicationYearFilter
              v-model="publicationYearFilterValue"
              :options="facetOptions.publicationYears"
            />

            <DiscoverLanguageFilter
              v-model="languageFilterValue"
              :options="facetOptions.languages"
            />

            <DiscoverLicenseFilter
              v-model="licenseFilterValue"
              :options="facetOptions.licenses"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 pb-4">
          <UTooltip
            :ui="{ content: 'h-auto max-w-md items-start p-3' }"
            :delay-duration="300"
          >
            <UInput
              v-model="searchQuery"
              placeholder="Search title, author, affiliation, DOI, ORCID..."
              icon="i-lucide-search"
              class="w-full sm:w-96"
              @keydown.enter="triggerSearch"
            />

            <template #content>
              <div class="space-y-2 text-xs">
                <p>
                  A plain search looks at the {{ FREE_TEXT_SCOPE }}. Pasting an
                  ORCID, ROR or DOI searches for that identifier.
                </p>

                <p>
                  Narrow it with one or more prefixes. Put values with spaces in
                  quotes.
                </p>

                <ul class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <template v-for="item in searchHelp" :key="item.field">
                    <li class="contents">
                      <span class="text-muted">{{ item.label }}</span>

                      <code>{{ item.example }}</code>
                    </li>
                  </template>
                </ul>
              </div>
            </template>
          </UTooltip>

          <UButton
            color="primary"
            variant="outline"
            label="Search Posters"
            icon="i-lucide-search"
            @click="triggerSearch"
          />
        </div>

        <p
          v-if="searchScopeLabel"
          class="text-muted -mt-2 flex items-center gap-1.5 pb-4 text-xs"
        >
          <UIcon name="i-lucide-search" class="size-3.5 shrink-0" />

          {{ searchScopeLabel }}
        </p>

        <div class="flex items-center justify-between pb-4">
          <div>
            <p class="text-sm">
              {{ totalFiltered }} poster{{ totalFiltered !== 1 ? "s" : "" }}
              found
            </p>
          </div>

          <div class="flex items-center gap-2">
            <p>Sort by:</p>

            <USelect
              v-model="sortBy"
              :items="['Newest First', 'Oldest First', 'Most Liked']"
              class="w-34"
            />
          </div>
        </div>

        <div
          v-if="hasActiveBadges"
          class="flex flex-wrap items-center gap-2 pb-4"
        >
          <span class="text-sm text-gray-500">Active filters:</span>

          <UBadge
            v-for="filter in [...searchBadges, ...activeFilters]"
            :key="filter.key"
            color="primary"
            variant="subtle"
            size="md"
            trailing-icon="i-lucide-x"
            class="cursor-pointer"
            :title="`Remove filter: ${filter.label}`"
            @click="filter.onRemove"
          >
            {{ filter.label }}
          </UBadge>

          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            @click="clearAllFilters"
          >
            Clear all
          </UButton>
        </div>

        <UiSpinner :loading="status === 'pending'" overlay>
          <UPageGrid v-if="posters.length > 0">
            <NuxtLink
              v-for="poster in posters"
              :key="poster.id"
              :to="`/discover/${poster.id}`"
              class="relative h-full"
            >
              <UCard
                class="group relative flex h-full flex-1 cursor-pointer flex-col shadow-sm ring-0 transition-shadow duration-300 hover:shadow-md"
              >
                <div class="relative h-full flex-1">
                  <div class="relative overflow-hidden">
                    <img
                      :src="poster.imageUrl"
                      :alt="poster.title"
                      class="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      @error="onImageError($event, poster)"
                    />

                    <UTooltip
                      v-if="poster.automated"
                      text="This poster was picked up by our automated system."
                    >
                      <UBadge
                        color="primary"
                        variant="solid"
                        size="xs"
                        icon="i-lucide-sparkles"
                        class="absolute top-2 left-2 z-10 cursor-help"
                      >
                        Auto-indexed
                      </UBadge>
                    </UTooltip>
                  </div>

                  <div class="relative flex flex-col justify-between gap-2 p-2">
                    <div class="flex flex-col gap-3">
                      <h3 class="line-clamp-2 text-lg font-semibold">
                        <SearchHighlight
                          :text="poster.title"
                          :term="highlightTerms.title"
                        />
                      </h3>

                      <p class="line-clamp-3 text-sm leading-relaxed">
                        <SearchHighlight
                          :text="poster.description"
                          :term="highlightTerms.description"
                        />
                      </p>

                      <div class="flex flex-wrap gap-1">
                        <UBadge
                          v-for="tag in poster.keywords.slice(0, 2)"
                          :key="tag"
                          color="neutral"
                          variant="soft"
                          class="capitalize"
                        >
                          <SearchHighlight
                            :text="tag"
                            :term="highlightTerms.keyword"
                          />
                        </UBadge>

                        <UBadge
                          v-if="poster.keywords.length > 2"
                          color="neutral"
                          variant="soft"
                        >
                          + {{ poster.keywords.length - 2 }}
                        </UBadge>
                      </div>
                    </div>

                    <div
                      class="flex items-center justify-between border-t border-gray-100 pt-2 text-sm"
                    >
                      <div class="flex items-center gap-4">
                        <span class="flex items-center gap-1">
                          <Icon name="heroicons:heart" />
                          {{ poster.likes }}
                        </span>
                      </div>

                      <span class="flex items-center gap-1">
                        <Icon name="heroicons:calendar-days" />
                        {{ dayjs(poster.created).format("MMM D, YYYY") }}
                      </span>
                    </div>
                  </div>
                </div>
              </UCard>
            </NuxtLink>
          </UPageGrid>

          <!-- Empty State -->
          <UEmpty
            v-else
            icon="heroicons:magnifying-glass"
            title="No posters found"
            description="Try adjusting your search criteria or filters."
          />
        </UiSpinner>

        <div class="flex justify-center pt-8 pb-4">
          <UPagination
            v-model:page="page"
            :loading="status === 'pending'"
            :total="totalFiltered"
            variant="outline"
          />
        </div>
      </div>
    </div>
  </div>
</template>
