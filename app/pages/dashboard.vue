<script setup lang="ts">
import dayjs from "dayjs";
import {
  ALLOWED_POSTER_FILE_LABEL,
  MAX_POSTER_FILE_SIZE_LABEL,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";
import { LICENSE_OPTIONS } from "~/utils/poster_schema";
import { normalizeDoi, resolveDoiUrl, validateDoi } from "#shared/utils/doi";
import {
  formatZenodoFileEmbargoTimeRemaining,
  formatZenodoFileEmbargoUntilLabel,
  isZenodoFileEmbargoActive,
} from "#shared/utils/zenodoFileEmbargoAccess";
import { deleteBulkPosterSubmissionJob } from "~/utils/bulkPosterSubmissionJobClient";
import { parseApiError } from "~/utils/apiError";
import type {
  DashboardBulkSubmission,
  DashboardInProgressFeedEntry,
  DashboardPosterFeedResponse,
  PosterRepository,
} from "#shared/types/dashboardFeed";
import type { OrcidSuggestions } from "#shared/types/orcidSuggestions";
import type {
  BulkSubmissionCompletionPoster,
  BulkSubmissionCompletionResponse,
} from "#shared/types/bulkSubmissionCompletion";
import {
  discoverHighlightTerms,
  parseDiscoverSearch,
} from "#shared/utils/discoverSearch";
import { POSTER_REPOSITORY_LABELS } from "~/composables/useDashboardQuery";
import type {
  DashboardView,
  DashboardViewOption,
  FacetOption,
  PublishedFilter,
  PublishedFilterOption,
  PublishedSort,
} from "~/types/dashboard";

definePageMeta({
  middleware: ["auth"],
  // Fill the window under the site header, with no footer.
  appShell: true,
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Posters.science")}&description=${encodeURIComponent("Manage and track your scientific posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Dashboard - Posters.science",
  description: "Manage and track your scientific posters.",
  ogTitle: "Dashboard - Posters.science",
  ogDescription: "Manage and track your scientific posters.",
  ogImage,
});

type Poster = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  automated: boolean;
  status: "draft" | "downloaded" | "published";
  tombstone: boolean;
  tombedReason: string;
  versionRootId: number | null;
  versionSequence: number;
  isLatestPublished: boolean;
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  posterMetadata: {
    publisher: string | null;
    publicationYear: number | null;
    doi: string | null;
    license: string | null;
    version: string | null;
  } | null;
  extractionJob?: ExtractionJobSummary | null;
  rootPosterId: number;
  versionCount: number;
  activeVersionDraft?: {
    id: number;
    versionSequence: number;
    imageUrl: string;
    title: string;
    description: string;
    extractionJob?: ExtractionJobSummary | null;
  } | null;
  // An auto-indexed poster the user claimed as an author. Listed with their
  // own published posters but read-only, since the user doesn't own it.
  claimed: boolean;
  claimedAt: Date | null;
  /** YYYY-MM-DD (UTC) when Zenodo file download embargo ends; null if not embargoed. */
  zenodoFilesEmbargoUntil: string | null;
  /** The bulk upload the poster came from, if any. */
  bulkSubmission: { id: string; name: string } | null;
  /** Where the poster is archived, for the Published filters. */
  repository: PosterRepository;
  /** Its license, in the buckets the Discover license filter uses. */
  licenseBucket: string | null;
};

type ExtractionJobSummary = {
  id?: string;
  status: string;
  completed?: boolean;
  error?: string | null;
  created?: string | Date;
  updated?: string | Date;
};

type VersionJobStatusResponse = {
  completed: boolean;
  status: string;
  posterId?: number;
  error?: string | null;
  imageUrl?: string;
  title?: string;
  description?: string;
  startedAt?: string | Date;
  updatedAt?: string | Date;
};

// A draft's preview is queued for the extraction worker and arrives through
// polling, so only a published poster gets an imageUrl back on the spot.
type VersionThumbnailResponse = {
  success: boolean;
  queued: boolean;
  imageUrl: string | null;
};

const posters = ref<Poster[]>([]);
const bulkSubmissions = ref<DashboardBulkSubmission[]>([]);
const completedBulkSubmissions = ref<DashboardBulkSubmission[]>([]);
const inProgressFeed = ref<DashboardInProgressFeedEntry[]>([]);
const activeBulkManagedPosterIds = ref<number[]>([]);
const activeBulkManagedPosterIdSet = computed(
  () => new Set(activeBulkManagedPosterIds.value),
);
// The view shown when the URL names none: Published when nothing is in
// progress. Set once the feed loads, below.
const defaultDashboardView = ref<DashboardView>("in-progress");
// The view, and the Published view's search, filters and sort, live in the
// query string. ?tab=published and ?tab=suggested open those views, as the
// settings page links to them.
const {
  view: activeDashboardTab,
  kind: publishedFilter,
  search: publishedSearch,
  sort: publishedSort,
  repositories: repositoryFilter,
  years: yearFilter,
  licenses: licenseFilter,
  showDeleted: showTombstonedPosters,
} = useDashboardQuery(defaultDashboardView);
const expandedPublishedFamilies = ref(new Set<number>());

const embargoClockNow = ref(Date.now());
let embargoClockInterval: ReturnType<typeof setInterval> | undefined;

function isPosterZenodoEmbargoActive(poster: Poster): boolean {
  return isZenodoFileEmbargoActive(
    poster.zenodoFilesEmbargoUntil,
    new Date(embargoClockNow.value),
  );
}

function posterEmbargoTimeRemainingLabel(poster: Poster): string | null {
  const until = poster.zenodoFilesEmbargoUntil;
  if (!until || !isPosterZenodoEmbargoActive(poster)) return null;

  return formatZenodoFileEmbargoTimeRemaining(
    until,
    new Date(embargoClockNow.value),
  );
}

function posterShowsPublishedDashboardActions(poster: Poster): boolean {
  return poster.status === "published" && !isPosterZenodoEmbargoActive(poster);
}

const tombstonedPosterCount = computed(
  () => posters.value.filter((poster) => poster.tombstone).length,
);
const tombstoneFilteredPosters = computed(() =>
  posters.value.filter(
    (poster) => showTombstonedPosters.value || !poster.tombstone,
  ),
);
const inProgressPosters = computed(() =>
  tombstoneFilteredPosters.value.filter(
    (poster) =>
      poster.status !== "published" || isPosterZenodoEmbargoActive(poster),
  ),
);

const inProgressDashboardItems = computed(() => {
  const bulkById = new Map(
    bulkSubmissions.value.map((bulk) => [bulk.id, bulk]),
  );
  const posterById = new Map(
    inProgressPosters.value.map((poster) => [poster.id, poster]),
  );

  return inProgressFeed.value.flatMap((entry): ActiveTabListItem[] => {
    if (entry.type === "bulkSubmission") {
      const bulk = bulkById.get(entry.bulkSubmissionId);
      if (!bulk) return [];

      return [{ type: "bulk" as const, key: `bulk-${bulk.id}`, bulk }];
    }

    const poster = posterById.get(entry.posterId);
    if (!poster) return [];

    return [{ type: "poster" as const, key: `poster-${poster.id}`, poster }];
  });
});
const publishedPosters = computed(() =>
  tombstoneFilteredPosters.value.filter(
    (poster) =>
      poster.status === "published" &&
      poster.isLatestPublished &&
      !isPosterZenodoEmbargoActive(poster) &&
      !activeBulkManagedPosterIdSet.value.has(poster.id),
  ),
);
// Auto-indexed posters that list the user's ORCID iD, shown in the Suggested
// tab. Fetched in the browser so the dashboard doesn't wait on the search.
const {
  data: orcidSuggestions,
  error: orcidSuggestionsError,
  refresh: refreshOrcidSuggestions,
} = useFetch<OrcidSuggestions>("/api/user/orcid-suggestions", {
  server: false,
  lazy: true,
});
// Only an iD verified through ORCID sign-in gets suggestions here, never one
// typed into Settings.
const orcidSuggestionsAvailable = computed(
  () =>
    orcidSuggestions.value?.source === "linked" &&
    !orcidSuggestions.value.hidden,
);
const orcidSuggestionCount = computed(() =>
  orcidSuggestionsAvailable.value ? (orcidSuggestions.value?.total ?? 0) : 0,
);
// The tab stays while it's open, so claiming the last suggestion doesn't
// pull the page out from under the user.
const showSuggestedTab = computed(
  () =>
    orcidSuggestionsAvailable.value &&
    (orcidSuggestionCount.value > 0 ||
      activeDashboardTab.value === "suggested"),
);
// The views listed in the sidebar, each with how many items it holds.
const dashboardViews = computed((): DashboardViewOption[] => [
  {
    label: "In progress",
    icon: "i-lucide-pencil-line",
    value: "in-progress",
    count: inProgressDashboardItems.value.length,
  },
  {
    label: "Published",
    icon: "i-lucide-circle-check",
    value: "published",
    count: publishedPosters.value.length,
  },
  ...(showSuggestedTab.value
    ? [
        {
          label: "Suggested",
          icon: "i-simple-icons-orcid",
          value: "suggested" as const,
          count: orcidSuggestionCount.value,
        },
      ]
    : []),
]);
// FEATURE FLAG (versioning)
const versioningEnabled = useVersioningEnabled();

// The Published view lists one kind of poster at a time, chosen in the
// sidebar.
const publishedFilterTests: Record<
  PublishedFilter,
  (poster: Poster) => boolean
> = {
  all: () => true,
  owned: (poster) => !poster.claimed,
  claimed: (poster) => poster.claimed,
  bulk: (poster) => !!poster.bulkSubmission,
  // The same posters that show "View published versions" on their card.
  versions: (poster) => publishedVersionHistory(poster).length > 0,
};

// Every kind is listed, even an empty one, which says how posters get there.
const publishedFilterOptions = computed((): PublishedFilterOption[] => {
  const options: Omit<PublishedFilterOption, "count">[] = [
    { value: "all", label: "All" },
    { value: "owned", label: "Shared by you", icon: "i-lucide-upload" },
    { value: "claimed", label: "Claimed", icon: "i-heroicons-hand-raised" },
    { value: "bulk", label: "Bulk uploads", icon: "i-lucide-library-big" },
    // FEATURE FLAG (versioning)
    ...(versioningEnabled
      ? [
          {
            value: "versions" as const,
            label: "Multiple versions",
            icon: "i-lucide-history",
          },
        ]
      : []),
  ];

  return options.map((option) => ({
    ...option,
    count: publishedPosters.value.filter(publishedFilterTests[option.value])
      .length,
  }));
});

const kindPublishedPosters = computed(() =>
  publishedPosters.value.filter(publishedFilterTests[publishedFilter.value]),
);

// The search runs on the server with the Discover syntax, over this list's
// posters only, and returns what matched.
const requestFetch = useRequestFetch();
const {
  data: publishedSearchMatches,
  status: publishedSearchStatus,
  refresh: refreshPublishedSearch,
} = await useAsyncData(
  "dashboard-published-search",
  () =>
    publishedSearch.value
      ? requestFetch("/api/user/dashboard-search", {
          query: { search: publishedSearch.value },
        })
      : Promise.resolve(null),
  { watch: [publishedSearch] },
);

const publishedSearchPending = computed(
  () => !!publishedSearch.value && publishedSearchStatus.value === "pending",
);
const publishedSearchFailed = computed(
  () => !!publishedSearch.value && publishedSearchStatus.value === "error",
);

// The terms to mark on the Published cards, as on profile pages.
const publishedHighlight = computed(() =>
  activeDashboardTab.value === "published"
    ? discoverHighlightTerms(parseDiscoverSearch(publishedSearch.value))
    : null,
);

const searchedPublishedPosters = computed(() => {
  const matches = publishedSearch.value ? publishedSearchMatches.value : null;

  if (!matches?.rootIds) return kindPublishedPosters.value;

  const roots = new Set(matches.rootIds);
  // A bulk upload the search names brings all of its posters.
  const batches = new Set(matches.bulkSubmissionIds ?? []);

  return kindPublishedPosters.value.filter(
    (poster) =>
      roots.has(poster.rootPosterId) ||
      (!!poster.bulkSubmission && batches.has(poster.bulkSubmission.id)),
  );
});

// Repository, year and license choices, counted over the posters the kind and
// the search leave, as on profile pages.
function facetOptions<T extends string | number>(
  values: Array<T | null>,
  selected: T[],
  label: (value: T) => string,
): FacetOption<T>[] {
  const counts = new Map<T, number>();

  for (const value of values) {
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  // A choice from the URL that nothing has stays listed, so it can be unticked.
  for (const value of selected) {
    if (!counts.has(value)) counts.set(value, 0);
  }

  return [...counts.entries()].map(([value, count]) => ({
    value,
    label: label(value),
    count,
  }));
}

const repositoryOptions = computed((): FacetOption<PosterRepository>[] =>
  (Object.keys(POSTER_REPOSITORY_LABELS) as PosterRepository[]).map(
    (repository) => ({
      value: repository,
      label: POSTER_REPOSITORY_LABELS[repository],
      count: searchedPublishedPosters.value.filter(
        (poster) => poster.repository === repository,
      ).length,
    }),
  ),
);
const yearOptions = computed(() =>
  facetOptions(
    searchedPublishedPosters.value.map(
      (poster) => poster.posterMetadata?.publicationYear ?? null,
    ),
    yearFilter.value,
    String,
  ).sort((a, b) => b.value - a.value),
);
const licenseOptions = computed(() =>
  facetOptions(
    searchedPublishedPosters.value.map((poster) => poster.licenseBucket),
    licenseFilter.value,
    (license) => license,
  ).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
);

const publishedFacetsActive = computed(
  () =>
    repositoryFilter.value.length +
      yearFilter.value.length +
      licenseFilter.value.length >
    0,
);

const filteredPublishedPosters = computed(() =>
  searchedPublishedPosters.value.filter((poster) => {
    const year = poster.posterMetadata?.publicationYear ?? null;

    return (
      (repositoryFilter.value.length === 0 ||
        repositoryFilter.value.includes(poster.repository)) &&
      (yearFilter.value.length === 0 ||
        (year !== null && yearFilter.value.includes(year))) &&
      (licenseFilter.value.length === 0 ||
        (poster.licenseBucket !== null &&
          licenseFilter.value.includes(poster.licenseBucket)))
    );
  }),
);

// A search or a repository, year or license filter narrows the list.
const publishedNarrowed = computed(
  () => !!publishedSearch.value || publishedFacetsActive.value,
);

// All, Shared by you and Bulk uploads list a finished bulk upload's posters
// inside its card. Multiple versions lists them as plain rows, and claimed
// posters never come from a bulk upload.
const groupsPublishedBatches = computed(() =>
  (["all", "owned", "bulk"] as PublishedFilter[]).includes(
    publishedFilter.value,
  ),
);

const completedBulkSubmissionIds = computed(
  () => new Set(completedBulkSubmissions.value.map((bulk) => bulk.id)),
);

/** The finished bulk upload whose card lists this poster, if any. */
function publishedPosterBatchId(poster: Poster) {
  const id = poster.bulkSubmission?.id;

  return groupsPublishedBatches.value &&
    id &&
    completedBulkSubmissionIds.value.has(id)
    ? id
    : null;
}

const toTime = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : null;

const publishedTimeDescending = (a: Poster, b: Poster) =>
  (toTime(b.publishedAt) ?? 0) - (toTime(a.publishedAt) ?? 0);

type PublishedBatch = {
  bulk: DashboardBulkSubmission;
  /** Its posters the search and filters leave, newest published first. */
  posters: Poster[];
  /** Its posters in the kind before the search and filters. */
  total: number;
};

const publishedBatches = computed((): PublishedBatch[] => {
  if (!groupsPublishedBatches.value) return [];

  const listed = new Map<string, Poster[]>();
  const totals = new Map<string, number>();

  for (const poster of kindPublishedPosters.value) {
    const id = publishedPosterBatchId(poster);

    if (id) totals.set(id, (totals.get(id) ?? 0) + 1);
  }

  for (const poster of filteredPublishedPosters.value) {
    const id = publishedPosterBatchId(poster);

    if (id) listed.set(id, [...(listed.get(id) ?? []), poster]);
  }

  return completedBulkSubmissions.value.flatMap((bulk) => {
    const posters = (listed.get(bulk.id) ?? []).sort(publishedTimeDescending);

    // A search or filter hides a batch with no match. Otherwise the batch
    // stays, even with its posters hidden, so its summary is still in reach.
    if (posters.length === 0 && publishedNarrowed.value) return [];

    return [{ bulk, posters, total: totals.get(bulk.id) ?? 0 }];
  });
});

// Batches start closed, or open while a search or filter narrows the list,
// and "View batch summary" flips that. Long batches show their first rows
// only.
const PUBLISHED_BATCH_ROWS_SHOWN = 10;
const toggledPublishedBatches = ref(new Set<string>());
const fullyShownPublishedBatches = ref(new Set<string>());

watch(publishedNarrowed, () => {
  toggledPublishedBatches.value = new Set();
});

function publishedBatchExpanded(bulkId: string) {
  return publishedNarrowed.value !== toggledPublishedBatches.value.has(bulkId);
}

function togglePublishedBatch(bulkId: string) {
  const toggled = new Set(toggledPublishedBatches.value);

  if (!toggled.delete(bulkId)) toggled.add(bulkId);

  toggledPublishedBatches.value = toggled;
}

// The feed has no upload file names, so a batch's summary is loaded the first
// time its panel opens.
const publishedBatchSummaries = ref<
  Record<
    string,
    "pending" | "error" | Map<number, BulkSubmissionCompletionPoster>
  >
>({});

async function loadPublishedBatchSummary(bulkId: string) {
  if (publishedBatchSummaries.value[bulkId]) return;

  publishedBatchSummaries.value = {
    ...publishedBatchSummaries.value,
    [bulkId]: "pending",
  };

  let summary: Map<number, BulkSubmissionCompletionPoster> | "error";

  try {
    const completion = await $fetch<BulkSubmissionCompletionResponse>(
      `/api/bulk-poster-submissions/${bulkId}/completion`,
    );

    summary = new Map(
      completion.posters.map((poster) => [poster.rootPosterId, poster]),
    );
  } catch {
    summary = "error";
  }

  publishedBatchSummaries.value = {
    ...publishedBatchSummaries.value,
    [bulkId]: summary,
  };
}

const openPublishedBatchIds = computed(() =>
  publishedBatches.value
    .map((batch) => batch.bulk.id)
    .filter((bulkId) => publishedBatchExpanded(bulkId)),
);

watch(
  openPublishedBatchIds,
  (bulkIds) => {
    if (import.meta.server) return;

    for (const bulkId of bulkIds) void loadPublishedBatchSummary(bulkId);
  },
  { immediate: true },
);

/** A batch poster's upload file name, DOI and repository record. */
function publishedBatchPosterDetails(bulkId: string, poster: Poster) {
  const summary = publishedBatchSummaries.value[bulkId];
  const row =
    summary instanceof Map ? summary.get(poster.rootPosterId) : undefined;
  // The latest version can have a newer DOI than the batch's upload.
  const doi = poster.posterMetadata?.doi?.trim() || row?.doi || null;

  return {
    fileName: row?.fileName ?? null,
    doi: doi ? normalizeDoi(doi) : null,
    recordUrl: doi ? resolveDoiUrl(doi) : (row?.zenodoUrl ?? null),
    repositoryLabel:
      poster.repository === "figshare" ? "View on Figshare" : "View on Zenodo",
  };
}

function shownPublishedBatchPosters(bulkId: string, batchPosters: Poster[]) {
  return fullyShownPublishedBatches.value.has(bulkId)
    ? batchPosters
    : batchPosters.slice(0, PUBLISHED_BATCH_ROWS_SHOWN);
}

function showAllPublishedBatchPosters(bulkId: string) {
  fullyShownPublishedBatches.value = new Set([
    ...fullyShownPublishedBatches.value,
    bulkId,
  ]);
}

function clearPublishedSearchAndFilters() {
  publishedSearch.value = "";
  repositoryFilter.value = [];
  yearFilter.value = [];
  licenseFilter.value = [];
  showTombstonedPosters.value = true;
}

// A kind of poster with nothing in it says how posters get there instead.
const publishedKindEmpty = computed(
  () =>
    activeDashboardTab.value === "published" &&
    publishedFilter.value !== "all" &&
    kindPublishedPosters.value.length === 0 &&
    !(
      publishedFilter.value === "bulk" &&
      completedBulkSubmissions.value.length > 0
    ),
);

type ActiveTabListItem =
  | {
      type: "bulk";
      key: string;
      bulk: DashboardBulkSubmission;
      /** A finished batch on Published lists its posters in its card. */
      batch?: PublishedBatch;
    }
  | { type: "poster"; key: string; poster: Poster };

function publishedItemTime(
  item: ActiveTabListItem,
  field: "published" | "created",
) {
  // A batch goes by its own date, with its posters inside it.
  if (item.type === "bulk") {
    return toTime(
      field === "published"
        ? (item.bulk.completedAt ?? item.bulk.createdAt)
        : item.bulk.createdAt,
    );
  }

  return toTime(
    field === "published" ? item.poster.publishedAt : item.poster.created,
  );
}

// Newest or oldest first, with anything undated last either way.
const byPublishedItemTime =
  (field: "published" | "created", direction: 1 | -1) =>
  (a: ActiveTabListItem, b: ActiveTabListItem) => {
    const first = publishedItemTime(a, field);
    const second = publishedItemTime(b, field);

    if (first === null || second === null) {
      return (first === null ? 1 : 0) - (second === null ? 1 : 0);
    }

    return direction * (first - second);
  };

const publishedItemTitle = (item: ActiveTabListItem) =>
  item.type === "bulk" ? item.bulk.name : item.poster.title;

const publishedSorters: Record<
  Exclude<PublishedSort, "activity">,
  (a: ActiveTabListItem, b: ActiveTabListItem) => number
> = {
  published: byPublishedItemTime("published", -1),
  "published-oldest": byPublishedItemTime("published", 1),
  created: byPublishedItemTime("created", -1),
  title: (a, b) => publishedItemTitle(a).localeCompare(publishedItemTitle(b)),
};

const activeTabListItems = computed((): ActiveTabListItem[] => {
  if (activeDashboardTab.value === "in-progress") {
    return inProgressDashboardItems.value;
  }

  // The Suggested tab renders its own list.
  if (activeDashboardTab.value === "suggested") return [];

  const items: ActiveTabListItem[] = [
    ...publishedBatches.value.map((batch) => ({
      type: "bulk" as const,
      key: `bulk-${batch.bulk.id}`,
      bulk: batch.bulk,
      batch,
    })),
    ...filteredPublishedPosters.value
      .filter((poster) => !publishedPosterBatchId(poster))
      .map((poster) => ({
        type: "poster" as const,
        key: `poster-${poster.id}`,
        poster,
      })),
  ];

  // Recent activity is the order the feed comes in, bulk uploads first.
  if (publishedSort.value === "activity") return items;

  return [...items].sort(publishedSorters[publishedSort.value]);
});

// Whether the Published tab has anything before its filters apply, so a
// filter that matches nothing shows a "no match" note instead of the empty
// tab.
const publishedTabHasItems = computed(
  () =>
    completedBulkSubmissions.value.length > 0 ||
    publishedPosters.value.length > 0,
);

const activeTabHasItems = computed(() => activeTabListItems.value.length > 0);
const activeDashboardDescription = computed(() => {
  if (activeDashboardTab.value === "in-progress") {
    return "Posters and bulk submissions that still need your attention.";
  }

  // FEATURE FLAG (versioning)
  if (!versioningEnabled) return "Posters you have published.";

  return "The latest published version of each poster.";
});
const visiblePosterCount = computed(
  () => inProgressDashboardItems.value.length + publishedPosters.value.length,
);

// The panel's title names the open view, and the Published filter when one
// narrows it.
const activeViewLabel = computed(
  () =>
    dashboardViews.value.find((view) => view.value === activeDashboardTab.value)
      ?.label ?? "Dashboard",
);
const activeFilterLabel = computed(() => {
  if (activeDashboardTab.value !== "published") return null;
  if (publishedFilter.value === "all") return null;

  return (
    publishedFilterOptions.value.find(
      (option) => option.value === publishedFilter.value,
    )?.label ?? null
  );
});

// The search, the filters and the sort for the Published view.
const showPublishedToolbar = computed(
  () =>
    activeDashboardTab.value === "published" &&
    (publishedTabHasItems.value || tombstonedPosterCount.value > 0),
);

function publishedVersionHistory(poster: Poster) {
  return tombstoneFilteredPosters.value
    .filter(
      (version) =>
        version.status === "published" &&
        version.rootPosterId === poster.rootPosterId &&
        version.id !== poster.id,
    )
    .sort((a, b) => b.versionSequence - a.versionSequence);
}

function publishedFamilyCount(poster: Poster) {
  return publishedVersionHistory(poster).length + 1;
}

function publishedHistoryExpanded(poster: Poster) {
  return expandedPublishedFamilies.value.has(poster.rootPosterId);
}

function togglePublishedHistory(poster: Poster) {
  const expanded = new Set(expandedPublishedFamilies.value);

  if (expanded.has(poster.rootPosterId)) {
    expanded.delete(poster.rootPosterId);
  } else {
    expanded.add(poster.rootPosterId);
  }

  expandedPublishedFamilies.value = expanded;
}

const { data, error, refresh } =
  await useFetch<DashboardPosterFeedResponse>("/api/poster");

function applyDashboardFeed(feed: DashboardPosterFeedResponse | Poster[]) {
  if (Array.isArray(feed)) {
    posters.value = feed;
    bulkSubmissions.value = [];
    completedBulkSubmissions.value = [];
    inProgressFeed.value = [];
    activeBulkManagedPosterIds.value = [];

    return;
  }

  posters.value = feed.posters as unknown as Poster[];
  bulkSubmissions.value = feed.bulkSubmissions ?? [];
  completedBulkSubmissions.value = feed.completedBulkSubmissions ?? [];
  inProgressFeed.value = feed.inProgressFeed ?? [];
  activeBulkManagedPosterIds.value = feed.activeBulkManagedPosterIds ?? [];
}

if (data.value) {
  applyDashboardFeed(data.value);
  if (
    inProgressDashboardItems.value.length === 0 &&
    publishedPosters.value.length
  ) {
    defaultDashboardView.value = "published";
  }
}

// Someone with no posters of their own yet, but some that list their iD,
// lands on the suggestions.
watch(orcidSuggestionCount, (count) => {
  if (
    count > 0 &&
    inProgressDashboardItems.value.length === 0 &&
    publishedPosters.value.length === 0
  ) {
    activeDashboardTab.value = "suggested";
  }
});

// Leave the Suggested tab once it no longer applies: suggestions hidden, no
// verified iD (such as a ?tab=suggested link opened by a typed iD), or they
// failed to load.
watch(
  [orcidSuggestions, orcidSuggestionsAvailable, orcidSuggestionsError],
  ([suggestions, available, loadError]) => {
    if (!loadError && (!suggestions || available)) return;
    if (activeDashboardTab.value !== "suggested") return;

    activeDashboardTab.value =
      inProgressDashboardItems.value.length === 0 &&
      publishedPosters.value.length > 0
        ? "published"
        : "in-progress";
  },
);

async function onOrcidSuggestionsClaimed() {
  await Promise.all([refresh(), refreshOrcidSuggestions()]);
}

watch(data, (feed) => {
  if (feed) {
    applyDashboardFeed(feed);
  }

  // A changed list can change what the search matches.
  if (publishedSearch.value) void refreshPublishedSearch();
});

if (error.value) {
  console.error(error.value);
}

// Publication info modal state
const modalOpen = ref(false);
const modalPoster = ref<Poster | null>(null);
const modalDoi = ref("");
const modalLicense = ref("");
const modalPublisher = ref("");
const isSaving = ref(false);
const doiError = ref("");
const toast = useToast();

// Organization pages that show each published poster. Lazy, so it never
// holds up the poster list.
const {
  hasOrganizations,
  listedOn,
  refresh: refreshOrganizationListings,
} = useOrganizationListings();
const {
  open: organizationPromptOpen,
  choices: organizationPromptChoices,
  loadingPosterId: organizationPromptLoadingId,
  offer: offerPosterOrganizations,
  show: showPosterOrganizations,
} = useOrganizationPosterPrompt();

// True when the modal opened because a save just published the poster.
const organizationPromptAfterPublish = ref(false);

async function openPosterOrganizations(poster: Poster) {
  organizationPromptAfterPublish.value = false;

  try {
    await showPosterOrganizations(poster.rootPosterId);
  } catch (error) {
    toast.add({
      title: "Could not load your organizations",
      description:
        parseApiError(error).statusMessage ??
        "Something went wrong. Try again.",
      color: "error",
    });
  }
}

// Collections that hold each published poster, chosen in a pop-up.
const {
  open: collectionPromptOpen,
  choices: collectionPromptChoices,
  loadingPosterId: collectionPromptLoadingId,
  show: showPosterCollections,
} = useCollectionPosterPrompt();

async function openPosterCollections(poster: Poster) {
  try {
    await showPosterCollections(poster.rootPosterId);
  } catch (error) {
    toast.add({
      title: "Could not load your collections",
      description:
        parseApiError(error).statusMessage ??
        "Something went wrong. Try again.",
      color: "error",
    });
  }
}

// Removing a claim on an auto-indexed poster
const removeClaimTarget = ref<Poster | null>(null);
const removeClaimOpen = computed({
  get: () => removeClaimTarget.value !== null,
  set: (open) => {
    if (!open) removeClaimTarget.value = null;
  },
});
const removingClaim = ref(false);

async function confirmRemoveClaim() {
  const poster = removeClaimTarget.value;
  if (!poster || removingClaim.value) return;

  removingClaim.value = true;

  try {
    await $fetch(`/api/poster/${poster.rootPosterId}/claim`, {
      method: "DELETE",
    });

    posters.value = posters.value.filter(
      (row) => !(row.claimed && row.rootPosterId === poster.rootPosterId),
    );
    removeClaimTarget.value = null;
    // Listings that depended on the claim were removed with it.
    refreshOrganizationListings();
    toast.add({
      title: "Claim removed",
      description: "The poster is no longer linked to your account.",
      color: "success",
    });
  } catch (error) {
    const message =
      (error as { data?: { statusMessage?: string } })?.data?.statusMessage ||
      "There was a problem removing your claim.";

    toast.add({
      title: "Could not remove claim",
      description: message,
      color: "error",
    });
  } finally {
    removingClaim.value = false;
  }
}
const tombstoneModalOpen = ref(false);
const tombstonedPoster = ref<Poster | null>(null);

const versionModalOpen = ref(false);
const versionPoster = ref<Poster | null>(null);
const versionFileMode = ref<"reuse" | "upload">("reuse");
const versionMetadataMode = ref<"copy" | "extract">("copy");
const versionFiles = ref<File[]>([]);
const creatingVersion = ref(false);
const versionError = ref("");
const versionPollingError = ref("");
const retryingVersionExtraction = ref(false);
const retryingVersionThumbnail = ref(false);

const { isActive: isMaintenanceActive } = useMaintenance();
const extractionPaused = computed(() => isMaintenanceActive("extraction"));
const versioningPaused = computed(() => isMaintenanceActive("versioning"));
const deleteVersionModalOpen = ref(false);
const deletingVersionDraft = ref(false);
const pollingVersionJobId = ref<string | null>(null);
let versionPollTimer: ReturnType<typeof setTimeout> | undefined;
let versionPollGeneration = 0;
const versionLastCheckedAt = ref<number | null>(null);
const versionClockNow = ref(Date.now());
let versionClockTimer: ReturnType<typeof setInterval> | undefined;

// Poll quickly at first, then back off, so a long extraction keeps reporting
// progress without hammering the API for its whole run.
const VERSION_POLL_FAST_INTERVAL = 3000;
const VERSION_POLL_SLOW_INTERVAL = 10000;
const VERSION_POLL_FAST_ATTEMPTS = 40;
const VERSION_THUMBNAIL_REPAIR_ATTEMPTS = 5;
// The worker's queue poll is the floor on how long a queued preview can take, so
// keep watching well past one cycle before handing the card back to the user.
const QUEUED_THUMBNAIL_POLL_INTERVAL = 3000;
const QUEUED_THUMBNAIL_POLL_ATTEMPTS = 20;
// Cleared on unmount so a queued preview watcher stops instead of writing into a
// page the user has already left.
let dashboardActive = true;
// Preparation normally lands well inside this window, so anything longer gets
// an explicit "taking longer than usual" note instead of a silent spinner.
const VERSION_SLOW_AFTER_SECONDS = 330;

const VERSION_FILE_HINT = `${ALLOWED_POSTER_FILE_LABEL} up to ${MAX_POSTER_FILE_SIZE_LABEL}`;

const validateVersionFile = (file: File) =>
  posterFileRejectionReason({
    name: file.name,
    type: file.type,
    size: file.size,
  });

const onVersionFileRejected = (
  rejections: { file: File; reason: string }[],
) => {
  const first = rejections[0];
  if (!first) return;

  versionError.value = `${first.file.name}: ${first.reason}`;
};

const versionFileOptions = [
  {
    label: "Keep the current poster file",
    description:
      "Choose this when the poster is unchanged but its supplemental metadata need to be updated.",
    value: "reuse",
  },
  {
    label: "Replace the poster file",
    description:
      "Upload a revised PDF or image when the poster itself has changed.",
    value: "upload",
  },
];
const versionMetadataOptions = [
  {
    label: "Extract metadata from the replacement file",
    description:
      "Best when the poster content changed enough. Use the new poster to extract new metadata for your review.",
    value: "extract",
  },
  {
    label: "Keep and edit the current metadata",
    description:
      "Best for smaller poster revisions. Copies the published metadata so you can make targeted edits without waiting for another extraction.",
    value: "copy",
  },
];

function isVersionExtracting(draft: Poster["activeVersionDraft"]): boolean {
  return (
    draft?.extractionJob?.status === "pending-extraction" ||
    draft?.extractionJob?.status === "processing"
  );
}

function isVersionExtractionFailed(
  draft: Poster["activeVersionDraft"],
): boolean {
  return draft?.extractionJob?.status === "failed";
}

function isVersionPreparing(draft: Poster["activeVersionDraft"]): boolean {
  return Boolean(draft && (isVersionExtracting(draft) || !draft.imageUrl));
}

// A failed draft is also "preparing" by the rule above, since it has no
// preview, but there is nothing left to poll for. Polling it would only replay
// the failure toast every time the panel is opened.
function shouldPollVersionDraft(draft: Poster["activeVersionDraft"]): boolean {
  return Boolean(
    draft?.extractionJob?.id &&
    !isVersionExtractionFailed(draft) &&
    isVersionPreparing(draft),
  );
}

function isVersionReviewReady(draft: Poster["activeVersionDraft"]): boolean {
  return Boolean(
    draft &&
    draft.imageUrl &&
    (!draft.extractionJob ||
      draft.extractionJob.completed ||
      draft.extractionJob.status === "completed"),
  );
}

const currentVersionDraft = computed(
  () => versionPoster.value?.activeVersionDraft ?? null,
);
const versionMetadataReady = computed(() => {
  const job = currentVersionDraft.value?.extractionJob;

  // A queued preview means the metadata is already saved and only the image is
  // outstanding, so the panel should not send the user back to the first step.
  return Boolean(
    !job ||
    job.completed ||
    job.status === "completed" ||
    job.status === "pending-thumbnail",
  );
});
const versionThumbnailNeedsAttention = computed(
  () =>
    Boolean(currentVersionDraft.value) &&
    !currentVersionDraft.value?.imageUrl &&
    versionMetadataReady.value &&
    Boolean(versionPollingError.value),
);
const versionPanelState = computed<"setup" | "extracting" | "ready" | "failed">(
  () => {
    if (!currentVersionDraft.value) return "setup";
    if (isVersionExtractionFailed(currentVersionDraft.value)) return "failed";
    if (isVersionPreparing(currentVersionDraft.value)) return "extracting";

    return "ready";
  },
);
// Preparation is a fixed pipeline, so the panel reports which stage a draft is
// in rather than showing one indeterminate bar for the whole wait.
const VERSION_PROGRESS_STEPS = [
  "Poster file saved",
  "Queued for extraction",
  "Extracting metadata",
  "Generating preview",
  "Ready to review",
];

const versionProgressStep = computed(() => {
  const draft = currentVersionDraft.value;
  if (!draft) return 0;

  const status = draft.extractionJob?.status;
  if (status === "pending-extraction") return 1;
  if (status === "processing") return 2;
  if (status === "pending-thumbnail") return 3;
  if (!versionMetadataReady.value) return 1;

  return draft.imageUrl ? 4 : 3;
});

const versionProgressSteps = computed(() =>
  VERSION_PROGRESS_STEPS.map((label, index) => ({
    label,
    done: index < versionProgressStep.value,
    active: index === versionProgressStep.value,
  })),
);

const versionExtractionStatus = computed(() => {
  if (versionProgressStep.value === 1) {
    return {
      title: "Waiting for extraction to start",
      description:
        "Your file is saved and queued. The extraction service will claim it automatically.",
    };
  }
  if (versionProgressStep.value === 2) {
    return {
      title: "Extracting poster metadata",
      description:
        "The extraction service is analyzing the poster and saving the fields you'll review and edit next.",
    };
  }
  if (versionProgressStep.value === 3) {
    return {
      title: "Generating poster preview",
      description:
        "Your metadata is saved. A preview image is being rendered from the poster file.",
    };
  }

  return {
    title: "Preparing your edits",
    description: "Your editable draft is being prepared.",
  };
});

const versionElapsedSeconds = computed(() => {
  const startedAt = currentVersionDraft.value?.extractionJob?.created;
  if (!startedAt) return null;

  return Math.max(
    0,
    dayjs(versionClockNow.value).diff(dayjs(startedAt), "second"),
  );
});

const versionElapsedLabel = computed(() => {
  const seconds = versionElapsedSeconds.value;
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds}s`;

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
});

const versionPreparingIsSlow = computed(
  () => (versionElapsedSeconds.value ?? 0) >= VERSION_SLOW_AFTER_SECONDS,
);

// Shown next to the progress bar so a quiet stage still looks alive.
const versionLastCheckedLabel = computed(() => {
  if (!versionLastCheckedAt.value) return null;

  const seconds = Math.max(
    0,
    Math.round((versionClockNow.value - versionLastCheckedAt.value) / 1000),
  );
  if (seconds < 5) return "Checked just now";
  if (seconds < 60) return `Checked ${seconds}s ago`;

  return `Checked ${Math.floor(seconds / 60)}m ago`;
});

const preparingVersionPoster = computed(() =>
  posters.value.find((poster) => isVersionPreparing(poster.activeVersionDraft)),
);

function versionActionDisabled(poster: Poster) {
  return Boolean(
    preparingVersionPoster.value &&
    !isVersionPreparing(poster.activeVersionDraft) &&
    preparingVersionPoster.value.rootPosterId !== poster.rootPosterId,
  );
}

function versionActionTooltip(poster: Poster) {
  // The button stays enabled so the panel can explain the pause in full.
  if (versioningPaused.value) {
    return "Editing published posters is paused. Open the panel for details.";
  }
  if (isVersionPreparing(poster.activeVersionDraft)) {
    return "Open the edit panel to view preparation progress.";
  }
  if (isVersionExtractionFailed(poster.activeVersionDraft)) {
    return "Open the edit panel to review the extraction issue.";
  }
  if (
    preparingVersionPoster.value &&
    preparingVersionPoster.value.rootPosterId !== poster.rootPosterId
  ) {
    return `Wait for the edits on “${preparingVersionPoster.value.title}” to finish preparing.`;
  }

  return poster.activeVersionDraft
    ? "Continue editing this published poster."
    : "Edit this published poster. Publishing your changes creates a new version.";
}

function displayedVersion(poster: Poster) {
  if (poster.status !== "published") return null;
  if (poster.automated) {
    return poster.posterMetadata?.version?.trim() || null;
  }

  return (
    poster.posterMetadata?.version?.trim() || String(poster.versionSequence)
  );
}

function draftVersionLabel(poster: Poster) {
  if (poster.versionRootId === null) return null;

  return (
    poster.posterMetadata?.version?.trim() || String(poster.versionSequence)
  );
}

function latestPublishedPoster(rootPosterId: number) {
  return posters.value.find(
    (poster) =>
      poster.rootPosterId === rootPosterId && poster.isLatestPublished,
  );
}

function versionDraftFor(
  poster: Poster,
): NonNullable<Poster["activeVersionDraft"]> {
  return {
    id: poster.id,
    versionSequence: poster.versionSequence,
    imageUrl: poster.imageUrl,
    title: poster.title,
    description: poster.description,
    extractionJob: poster.extractionJob,
  };
}

function versionWorkflowPoster(draft: Poster) {
  const published = latestPublishedPoster(draft.rootPosterId);
  if (!published) return null;

  return { ...published, activeVersionDraft: versionDraftFor(draft) };
}

// Only run the clock while the panel is actually showing preparation progress.
watch(
  () => versionModalOpen.value && versionPanelState.value === "extracting",
  (showingProgress) => {
    if (showingProgress) startVersionClock();
    else stopVersionClock();
  },
  { immediate: true },
);

watch(versionFileMode, (mode) => {
  versionError.value = "";
  if (mode === "reuse") {
    versionMetadataMode.value = "copy";
    versionFiles.value = [];
  } else {
    versionMetadataMode.value = "extract";
  }
});

function openVersionModal(poster: Poster) {
  versionPoster.value = poster;
  if (!poster.activeVersionDraft) {
    versionFileMode.value = "reuse";
    versionMetadataMode.value = "copy";
    versionFiles.value = [];
  }
  versionError.value = "";
  versionPollingError.value = "";
  versionModalOpen.value = true;

  const activeJob = poster.activeVersionDraft?.extractionJob?.id;
  if (activeJob && shouldPollVersionDraft(poster.activeVersionDraft)) {
    startVersionPolling(activeJob, poster.activeVersionDraft?.id);
  }
}

function updateLocalVersionJob(
  posterId: number | undefined,
  status: string,
  completed: boolean,
  error?: string | null,
  created?: string | Date,
  updated?: string | Date,
) {
  if (!posterId) return;

  const patch = {
    status,
    completed,
    error,
    ...(created && { created }),
    ...(updated && { updated }),
  };

  for (const poster of posters.value) {
    if (poster.id === posterId) {
      poster.extractionJob = { ...poster.extractionJob, ...patch };
    }
    if (poster.activeVersionDraft?.id === posterId) {
      poster.activeVersionDraft.extractionJob = {
        ...poster.activeVersionDraft.extractionJob,
        ...patch,
      };
    }
  }
}

function updateLocalVersionThumbnail(
  posterId: number | undefined,
  imageUrl: string | undefined,
) {
  if (!posterId || !imageUrl) return;

  for (const poster of posters.value) {
    if (poster.id === posterId) poster.imageUrl = imageUrl;
    if (poster.activeVersionDraft?.id === posterId) {
      poster.activeVersionDraft.imageUrl = imageUrl;
    }
  }
}

function updateLocalVersionDetails(
  posterId: number | undefined,
  title: string | undefined,
  description: string | undefined,
) {
  if (!posterId) return;

  for (const poster of posters.value) {
    if (poster.id === posterId) {
      if (title !== undefined) poster.title = title;
      if (description !== undefined) poster.description = description;
    }
    if (poster.activeVersionDraft?.id === posterId) {
      if (title !== undefined) poster.activeVersionDraft.title = title;
      if (description !== undefined) {
        poster.activeVersionDraft.description = description;
      }
    }
  }
}

async function refreshPosterList() {
  const openRootId = versionPoster.value?.rootPosterId;
  await refresh();
  if (data.value) {
    applyDashboardFeed(data.value);
  }
  if (openRootId) {
    versionPoster.value = latestPublishedPoster(openRootId) ?? null;
  }
}

async function refreshDashboardFeed() {
  await refresh();
  if (data.value) {
    applyDashboardFeed(data.value);
  }
}

const bulkToDelete = ref<DashboardBulkSubmission | null>(null);
const bulkDeleteModalOpen = ref(false);
const isDeletingBulk = ref(false);

function openDeleteBulkModal(bulk: DashboardBulkSubmission) {
  bulkToDelete.value = bulk;
  bulkDeleteModalOpen.value = true;
}

async function deleteBulkImport() {
  if (!bulkToDelete.value) return;

  isDeletingBulk.value = true;

  try {
    const result = await deleteBulkPosterSubmissionJob(bulkToDelete.value.id);

    const kept = result.keptPublishedPosterCount ?? 0;
    toast.add({
      title: "Bulk submission deleted",
      description:
        kept > 0
          ? `Draft posters were removed. ${kept === 1 ? "One published poster" : `${kept} published posters`} from this batch remain on your dashboard.`
          : "Your bulk submission and its draft posters have been removed.",
      color: "success",
    });

    bulkDeleteModalOpen.value = false;
    bulkToDelete.value = null;
    await refreshDashboardFeed();
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem deleting this bulk submission.",
      color: "error",
    });
  } finally {
    isDeletingBulk.value = false;
  }
}

function stopVersionPolling() {
  versionPollGeneration += 1;
  pollingVersionJobId.value = null;
  if (versionPollTimer) {
    clearTimeout(versionPollTimer);
    versionPollTimer = undefined;
  }
}

// Elapsed time ticks on its own so the panel keeps moving between polls.
function startVersionClock() {
  if (versionClockTimer) return;

  versionClockNow.value = Date.now();
  versionClockTimer = setInterval(() => {
    versionClockNow.value = Date.now();
  }, 1000);
}

function stopVersionClock() {
  if (!versionClockTimer) return;

  clearInterval(versionClockTimer);
  versionClockTimer = undefined;
}

// One poller drives the whole preparation pipeline: extraction first, then the
// preview image. Splitting these across two timers on the same endpoint made it
// possible for both to stop while the panel was still showing a spinner.
function startVersionPolling(jobId: string, posterId?: number) {
  if (pollingVersionJobId.value === jobId) return;

  stopVersionPolling();
  pollingVersionJobId.value = jobId;
  const generation = versionPollGeneration;
  let attempts = 0;
  let metadataReadyAttempts = 0;
  let thumbnailRequested = false;
  let thumbnailRepairFailures = 0;

  const isCurrent = () => generation === versionPollGeneration;

  // The worker writes its own preview while processing an extraction job, so
  // only ask the extraction service directly once that grace period passes.
  const repairMissingThumbnail = async (targetPosterId?: number) => {
    if (thumbnailRequested || !targetPosterId) return;

    thumbnailRequested = true;
    try {
      const result = await $fetch<VersionThumbnailResponse>(
        `/api/poster/${targetPosterId}/thumbnail`,
        { method: "POST" },
      );
      console.log("[versionJobPoll] thumbnail repair:", result);
      thumbnailRepairFailures = 0;
      // A queued render returns no image. Polling continues either way and
      // picks the preview up once the worker has written it.
      updateLocalVersionThumbnail(targetPosterId, result.imageUrl ?? undefined);
    } catch (error) {
      console.error("[versionJobPoll] thumbnail repair failed:", error);
      // Allow another attempt on a later tick; the preview may still be saving.
      thumbnailRequested = false;
      thumbnailRepairFailures += 1;

      // Offer the manual retry only once this looks persistent, so a single
      // blip does not replace live progress with a warning.
      if (thumbnailRepairFailures >= 2) {
        versionPollingError.value =
          (error as { data?: { statusMessage?: string } })?.data
            ?.statusMessage ||
          "The replacement poster preview could not be generated.";
      }
    }
  };

  // Returns true once the dashboard reflects the finished draft. The poster
  // list can lag the job row, so polling continues until the panel has actually
  // left the preparing state rather than stopping on the job status alone.
  const finish = async (response: VersionJobStatusResponse) => {
    await refreshPosterList();

    if (
      versionModalOpen.value &&
      currentVersionDraft.value?.extractionJob?.id === jobId &&
      versionPanelState.value === "extracting"
    ) {
      console.log(
        "[versionJobPoll] job is ready but the panel is not, retrying",
      );

      return false;
    }

    stopVersionPolling();

    const completedPoster = posters.value.find(
      (poster) => poster.activeVersionDraft?.id === response.posterId,
    );
    const completedDraft = completedPoster?.activeVersionDraft;

    toast.add({
      title: completedDraft
        ? `Your edits for version ${completedDraft.versionSequence} are ready to review`
        : "Your edits are ready to review",
      description: completedPoster
        ? `${completedPoster.title} finished preparing. Review the extracted metadata to continue.`
        : "Your draft finished preparing. Review the extracted metadata to continue.",
      color: "success",
      icon: "i-lucide-circle-check",
    });

    return true;
  };

  const checkStatus = async () => {
    if (!isCurrent()) return;

    attempts += 1;

    try {
      const response = await $fetch<VersionJobStatusResponse>(
        `/api/poster/job/${jobId}`,
      );

      if (!isCurrent()) return;

      console.log("[versionJobPoll] response:", response);

      versionPollingError.value = "";
      versionLastCheckedAt.value = Date.now();
      updateLocalVersionJob(
        response.posterId,
        response.status,
        response.completed,
        response.error,
        response.startedAt,
        response.updatedAt,
      );
      updateLocalVersionThumbnail(response.posterId, response.imageUrl);
      updateLocalVersionDetails(
        response.posterId,
        response.title,
        response.description,
      );

      if (response.status === "failed") {
        stopVersionPolling();
        await refreshPosterList();
        toast.add({
          title: "Metadata extraction failed",
          description: response.error || "Open the edit panel for details.",
          color: "error",
        });

        return;
      }

      const metadataReady =
        response.completed && response.status === "completed";

      if (metadataReady && response.imageUrl && (await finish(response))) {
        return;
      }

      if (metadataReady) {
        metadataReadyAttempts += 1;
        if (metadataReadyAttempts >= VERSION_THUMBNAIL_REPAIR_ATTEMPTS) {
          await repairMissingThumbnail(response.posterId ?? posterId);
        }
      }
    } catch (error) {
      if (!isCurrent()) return;

      console.error("[versionJobPoll] status check failed:", error);
      versionPollingError.value =
        error instanceof Error
          ? `Could not refresh the extraction status: ${error.message}`
          : "Could not refresh the extraction status. Retrying…";
    }

    // Preparation keeps running on the server, so the panel keeps polling
    // instead of giving up and leaving a spinner with no updates behind it.
    if (isCurrent()) {
      versionPollTimer = setTimeout(
        checkStatus,
        attempts < VERSION_POLL_FAST_ATTEMPTS
          ? VERSION_POLL_FAST_INTERVAL
          : VERSION_POLL_SLOW_INTERVAL,
      );
    }
  };

  void checkStatus();
}

async function reviewVersionDraft() {
  const draftId = currentVersionDraft.value?.id;
  if (draftId) {
    versionModalOpen.value = false;
    await navigateTo(`/share/${draftId}`);
  }
}

async function retryVersionExtraction() {
  const jobId = currentVersionDraft.value?.extractionJob?.id;
  const posterId = currentVersionDraft.value?.id;
  if (!jobId || !posterId) return;

  retryingVersionExtraction.value = true;
  versionPollingError.value = "";

  try {
    const response = await $fetch<{
      status: string;
      completed: boolean;
      error?: string | null;
    }>(`/api/poster/job/${jobId}/retry`, { method: "POST" });

    updateLocalVersionJob(
      posterId,
      response.status,
      response.completed,
      response.error,
    );
    startVersionPolling(jobId, posterId);
  } catch (error) {
    versionPollingError.value =
      error instanceof Error
        ? error.message
        : "Could not restart metadata extraction.";
  } finally {
    retryingVersionExtraction.value = false;
  }
}

async function retryVersionThumbnail() {
  const draft = currentVersionDraft.value;
  const jobId = draft?.extractionJob?.id;
  if (!draft || !jobId) return;

  retryingVersionThumbnail.value = true;
  versionPollingError.value = "";

  try {
    const response = await $fetch<VersionThumbnailResponse>(
      `/api/poster/${draft.id}/thumbnail`,
      { method: "POST" },
    );

    if (response.queued) {
      // The worker has the request now, so hand the panel back to the poller
      // rather than leaving it on a warning with nothing watching.
      await refreshPosterList();
      startVersionPolling(jobId, draft.id);

      return;
    }

    updateLocalVersionThumbnail(draft.id, response.imageUrl ?? undefined);
    stopVersionPolling();
    await refreshPosterList();
  } catch (error) {
    versionPollingError.value =
      (error as { data?: { statusMessage?: string } })?.data?.statusMessage ||
      (error instanceof Error ? error.message : undefined) ||
      "Could not prepare the replacement poster preview.";
  } finally {
    retryingVersionThumbnail.value = false;
  }
}

async function deleteVersionDraft() {
  const draft = currentVersionDraft.value;
  if (!draft) return;

  const jobId = draft.extractionJob?.id;
  const rootPosterId = versionPoster.value?.rootPosterId;
  const wasPreparing = shouldPollVersionDraft(draft);
  deletingVersionDraft.value = true;
  versionPollingError.value = "";
  stopVersionPolling();

  try {
    await $fetch(`/api/poster/${draft.id}`, { method: "DELETE" });

    const dashboardPoster = posters.value.find(
      (poster) => poster.rootPosterId === rootPosterId,
    );
    if (dashboardPoster) dashboardPoster.activeVersionDraft = null;

    deleteVersionModalOpen.value = false;
    versionModalOpen.value = false;
    versionPoster.value = null;
    await refreshPosterList();
    toast.add({
      title: "Edits discarded",
      description: `The draft for version ${draft.versionSequence} was deleted. Your published poster was not changed.`,
      color: "success",
    });
  } catch (error) {
    const message =
      (error as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ||
      (error as { statusMessage?: string })?.statusMessage ||
      "There was a problem discarding your edits.";

    toast.add({
      title: "Could not discard edits",
      description: message,
      color: "error",
    });

    if (wasPreparing && jobId) startVersionPolling(jobId, draft.id);
  } finally {
    deletingVersionDraft.value = false;
  }
}

async function createVersion() {
  if (!versionPoster.value) return;
  if (versionFileMode.value === "upload" && !versionFiles.value[0]) {
    versionError.value = `Choose a replacement ${ALLOWED_POSTER_FILE_LABEL} file.`;

    return;
  }

  const file = versionFiles.value[0];
  const rejectionReason = file ? validateVersionFile(file) : null;
  if (rejectionReason) {
    versionError.value = rejectionReason;

    return;
  }

  creatingVersion.value = true;
  versionError.value = "";
  try {
    const rootPosterId = versionPoster.value.rootPosterId;
    const body = new FormData();
    body.append("fileMode", versionFileMode.value);
    body.append("metadataMode", versionMetadataMode.value);
    if (file) body.append("file", file);

    const response = await $fetch<{
      posterId: number;
      versionSequence: number;
      imageUrl: string;
      title: string;
      description: string;
      extractionJobId?: string;
      extractionStatus?: string;
      extractionCompleted: boolean;
      reviewReady: boolean;
    }>(`/api/poster/${rootPosterId}/versions`, {
      method: "POST",
      body,
    });

    await refreshPosterList();

    if (response.extractionJobId && !response.reviewReady) {
      startVersionPolling(response.extractionJobId, response.posterId);
    }
  } catch (error) {
    versionError.value =
      error instanceof Error ? error.message : "Could not prepare your edits.";
  } finally {
    creatingVersion.value = false;
  }
}

onMounted(() => {
  embargoClockInterval = setInterval(() => {
    embargoClockNow.value = Date.now();
  }, 60_000);

  // Resume reporting on whichever draft is still preparing, whether it is
  // waiting on extraction or only on its preview image.
  const preparingDraft = posters.value.find((poster) =>
    shouldPollVersionDraft(poster.activeVersionDraft),
  )?.activeVersionDraft;
  const preparingJob = preparingDraft?.extractionJob?.id;

  if (preparingJob) {
    startVersionPolling(preparingJob, preparingDraft.id);
  }
});

onBeforeUnmount(() => {
  dashboardActive = false;
  if (embargoClockInterval) clearInterval(embargoClockInterval);
  stopVersionPolling();
  stopVersionClock();
});

function openPoster(poster: Poster) {
  if (!poster?.id) {
    toast.add({
      title: "Cannot open this draft",
      description:
        "This item is missing a poster id. Try refreshing the dashboard.",
      color: "warning",
    });

    return;
  }

  if (poster.tombstone) {
    tombstonedPoster.value = poster;
    tombstoneModalOpen.value = true;

    return;
  }

  if (poster.status === "published") {
    // FEATURE FLAG (versioning)
    const version = versioningEnabled ? displayedVersion(poster) : null;
    const versionQuery = version
      ? `?version=${encodeURIComponent(version)}`
      : "";
    void navigateTo(`/discover/${poster.rootPosterId}${versionQuery}`);

    return;
  }

  if (poster.versionRootId !== null) {
    const workflowPoster = versionWorkflowPoster(poster);
    if (workflowPoster) {
      openVersionWorkflow(workflowPoster);

      return;
    }
  }

  void navigateTo(`/share/${poster.id}`);
}

function openVersionWorkflow(poster: Poster) {
  const draft = poster.activeVersionDraft;

  if (isVersionReviewReady(draft) && draft) {
    void navigateTo(`/share/${draft.id}`);

    return;
  }

  openVersionModal(poster);
}

function reviewPendingDraft(poster: Poster) {
  const draftId = poster.activeVersionDraft?.id;
  if (draftId) void navigateTo(`/share/${draftId}`);
}

function openDeleteVersionModal(poster: Poster) {
  if (!isVersionReviewReady(poster.activeVersionDraft)) return;

  versionPoster.value = poster;
  deleteVersionModalOpen.value = true;
}

function openDeleteVersionDraftCard(draft: Poster) {
  const workflowPoster = versionWorkflowPoster(draft);
  if (workflowPoster) openDeleteVersionModal(workflowPoster);
}

const regeneratingThumbnailIds = ref<number[]>([]);
const thumbnailCacheBust = reactive<Record<number, number>>({});

const expandedDescriptions = ref(new Set<number>());

function toggleDescription(posterId: number) {
  const updated = new Set(expandedDescriptions.value);
  if (updated.has(posterId)) {
    updated.delete(posterId);
  } else {
    updated.add(posterId);
  }
  expandedDescriptions.value = updated;
}

// A queued preview is rendered by the extraction worker rather than returned by
// the request, so the card waits on the job instead of asking the user to
// refresh. The worker claims from its queue on a poll interval, so this has to
// outlast one of those cycles. Resolves true once the image lands.
async function awaitQueuedThumbnail(posterId: number, jobId: string) {
  for (
    let attempt = 0;
    attempt < QUEUED_THUMBNAIL_POLL_ATTEMPTS && dashboardActive;
    attempt += 1
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, QUEUED_THUMBNAIL_POLL_INTERVAL),
    );

    if (!dashboardActive) return false;

    const status = await $fetch<VersionJobStatusResponse>(
      `/api/poster/job/${jobId}`,
    );

    if (status.imageUrl) {
      const localPoster = posters.value.find((item) => item.id === posterId);
      if (localPoster) localPoster.imageUrl = status.imageUrl;

      thumbnailCacheBust[posterId] = Date.now();

      return true;
    }

    if (status.status === "failed") {
      throw new Error(
        status.error || "The poster preview could not be generated.",
      );
    }
  }

  return false;
}

async function regenerateThumbnail(poster: Poster) {
  regeneratingThumbnailIds.value = [
    ...regeneratingThumbnailIds.value,
    poster.id,
  ];

  try {
    const response = await $fetch<VersionThumbnailResponse>(
      `/api/poster/${poster.id}/thumbnail`,
      {
        method: "POST",
      },
    );

    if (response.queued) {
      const jobId = poster.extractionJob?.id;
      await refreshPosterList();

      if (jobId && (await awaitQueuedThumbnail(poster.id, jobId))) {
        toast.add({
          title: "Thumbnail regenerated",
          icon: "i-lucide-circle-check",
          color: "success",
        });

        return;
      }

      toast.add({
        title: "Poster preview still rendering",
        description:
          "The extraction service has the request. It will appear on this card once it lands.",
        icon: "i-lucide-clock",
        color: "info",
      });

      return;
    }

    const localPoster = posters.value.find((item) => item.id === poster.id);
    if (localPoster && response.imageUrl) {
      localPoster.imageUrl = response.imageUrl;
    }

    thumbnailCacheBust[poster.id] = Date.now();

    toast.add({
      title: "Thumbnail regenerated",
      icon: "i-lucide-circle-check",
      color: "success",
    });
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem regenerating the thumbnail.",
      color: "error",
    });
  } finally {
    regeneratingThumbnailIds.value = regeneratingThumbnailIds.value.filter(
      (id) => id !== poster.id,
    );
  }
}

// Delete draft state
const deleteModalOpen = ref(false);
const posterToDelete = ref<Poster | null>(null);
const isDeleting = ref(false);

function openDeleteModal(poster: Poster) {
  posterToDelete.value = poster;
  deleteModalOpen.value = true;
}

async function deletePoster() {
  if (!posterToDelete.value) return;

  isDeleting.value = true;

  try {
    await $fetch(`/api/poster/${posterToDelete.value.id}`, {
      method: "DELETE",
    });

    toast.add({
      title: "Poster deleted",
      description: "Your draft poster has been deleted.",
      color: "success",
    });

    deleteModalOpen.value = false;
    await refresh();
    if (data.value) applyDashboardFeed(data.value);
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem deleting the poster.",
      color: "error",
    });
  } finally {
    isDeleting.value = false;
  }
}

function openPublicationModal(poster: Poster) {
  modalPoster.value = poster;
  modalDoi.value = poster.posterMetadata?.doi ?? "";
  modalLicense.value = poster.posterMetadata?.license ?? "";
  modalPublisher.value = poster.posterMetadata?.publisher ?? "";
  doiError.value = "";
  modalOpen.value = true;
}

async function savePublicationInfo() {
  if (!modalPoster.value) return;

  doiError.value = validateDoi(modalDoi.value);
  if (doiError.value) return;

  isSaving.value = true;

  const savedPoster = modalPoster.value;
  const publishing = savedPoster.status === "downloaded";

  try {
    await $fetch(`/api/poster/${savedPoster.id}/publication`, {
      method: "PATCH",
      body: {
        doi: modalDoi.value ? normalizeDoi(modalDoi.value) : undefined,
        license: modalLicense.value || undefined,
        publisher: modalPublisher.value || undefined,
      },
    });

    toast.add({
      title: "Publication Info Saved",
      description: "Your poster record has been updated.",
      color: "success",
    });

    modalOpen.value = false;
    await refresh();
    if (data.value) applyDashboardFeed(data.value);

    // A downloaded poster is published by this save, so offer the person's
    // organization pages as the publish page does.
    if (publishing) {
      organizationPromptAfterPublish.value = true;
      offerPosterOrganizations(savedPoster.id);
    }
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem saving your publication info.",
      color: "error",
    });
  } finally {
    isSaving.value = false;
  }
}

const getImage = (poster: Poster) => {
  // Without this the draft branch below hands <img> a URL that 404s, which
  // renders as a broken image rather than falling back to the placeholder.
  if (!poster.imageUrl) return "";

  const bust = thumbnailCacheBust[poster.id];

  if (poster.status === "published") {
    // The CDN keys on the query string, so a rebuilt preview shows up straight
    // away instead of serving the cached copy at the same path.
    return bust ? `${poster.imageUrl}?t=${bust}` : poster.imageUrl;
  }

  return `/api/poster/${poster.id}/thumbnail${bust ? `?t=${bust}` : ""}`;
};

// A preview can go missing when thumbnail generation failed after the job
// itself succeeded. Surface it once the job is settled so the card is not
// nagging about a preview that is simply still being made.
function posterPreviewMissing(poster: Poster) {
  if (poster.claimed || poster.imageUrl || poster.tombstone) return false;

  const job = poster.extractionJob;

  return Boolean(
    !job ||
    job.completed ||
    job.status === "completed" ||
    job.status === "failed",
  );
}

const getCardTitle = (poster: Poster) => poster.title;

const CARD_TITLE_MAX_LENGTH = 80;
const getCardDisplayTitle = (poster: Poster) => {
  const title = getCardTitle(poster);

  return title.length > CARD_TITLE_MAX_LENGTH
    ? `${title.slice(0, CARD_TITLE_MAX_LENGTH).trimEnd()}…`
    : title;
};

const getCardDescription = (poster: Poster) => poster.description;

function posterStatusPresentation(poster: Poster) {
  if (poster.tombstone) {
    return {
      label: "Tombstoned",
      color: "error" as const,
      icon: "i-lucide-archive-x",
    };
  }
  if (isPosterZenodoEmbargoActive(poster)) {
    return {
      label: "File embargo",
      color: "warning" as const,
      icon: "i-lucide-lock",
    };
  }
  if (poster.status === "published") {
    return {
      label: "Published",
      color: "success" as const,
      icon: "i-lucide-circle-check",
    };
  }
  if (poster.extractionJob?.status === "failed") {
    return {
      label: "Needs attention",
      color: "error" as const,
      icon: "i-lucide-circle-alert",
    };
  }
  // Name the stage rather than a generic "preparing", so a card that sits here
  // for a while still tells the user what is actually happening.
  if (poster.extractionJob?.status === "pending-extraction") {
    return {
      label: "Queued for extraction",
      color: "info" as const,
      icon: "i-lucide-loader-circle",
    };
  }
  if (poster.extractionJob?.status === "processing") {
    return {
      label: "Extracting metadata",
      color: "info" as const,
      icon: "i-lucide-loader-circle",
    };
  }
  if (!poster.imageUrl) {
    return {
      label: "Generating preview",
      color: "info" as const,
      icon: "i-lucide-loader-circle",
    };
  }
  if (poster.versionRootId !== null) {
    return {
      label: "Draft",
      color: "warning" as const,
      icon: "i-lucide-file-pen-line",
    };
  }
  if (poster.status === "downloaded") {
    return {
      label: "Downloaded",
      color: "primary" as const,
      icon: "i-lucide-download",
    };
  }

  return {
    label: "Draft",
    color: "warning" as const,
    icon: "i-lucide-file-pen-line",
  };
}

function inProgressActionLabel(poster: Poster) {
  if (isPosterZenodoEmbargoActive(poster)) return "View poster";
  if (poster.versionRootId !== null) {
    if (isVersionPreparing(poster)) return "View progress";
    if (isVersionExtractionFailed(poster)) return "Resolve issue";

    return "Continue editing";
  }
  if (poster.status === "downloaded") return "Add publication metadata";

  return "Continue editing";
}

function openInProgressPoster(poster: Poster) {
  if (isPosterZenodoEmbargoActive(poster)) {
    openPoster(poster);

    return;
  }
  if (poster.status === "downloaded" && poster.versionRootId === null) {
    openPublicationModal(poster);

    return;
  }

  openPoster(poster);
}

// The three-dot menu on a published card. View and Edit stay as buttons.
function publishedPosterMenuItems(poster: Poster) {
  const listing = [];

  if (hasOrganizations.value && poster.isLatestPublished) {
    listing.push({
      label: "Organizations",
      description: "Choose which organization pages show it",
      icon: "i-lucide-building-2",
      onSelect: () => openPosterOrganizations(poster),
    });
  }

  if (poster.isLatestPublished) {
    listing.push({
      label: "Collections",
      description: "Choose which of your collections hold it",
      icon: "i-lucide-library-big",
      onSelect: () => openPosterCollections(poster),
    });
  }

  const claim = poster.claimed
    ? [
        {
          label: "Remove claim",
          icon: "i-lucide-x",
          color: "error" as const,
          onSelect: () => {
            removeClaimTarget.value = poster;
          },
        },
      ]
    : [];

  return [listing, claim].filter((group) => group.length > 0);
}

function posterMenuItems(poster: Poster) {
  if (poster.tombstone) return [];

  const regeneratePreview = {
    label: "Regenerate preview",
    description: "Rebuild the thumbnail from the poster file",
    icon: "i-lucide-refresh-cw",
    disabled: regeneratingThumbnailIds.value.includes(poster.id),
    onSelect: () => regenerateThumbnail(poster),
  };

  // A published poster cannot be deleted, but its preview can still be rebuilt
  // - that is the only recovery path when thumbnail generation failed before
  // the poster was published.
  if (poster.status === "published") return [[regeneratePreview]];

  if (poster.versionRootId !== null) {
    if (
      isVersionPreparing(poster) ||
      (!isVersionReviewReady(poster) && !isVersionExtractionFailed(poster))
    ) {
      return [];
    }

    return [
      [
        regeneratePreview,
        {
          label: "Discard draft",
          description: "Drop these edits. The published poster stays.",
          icon: "i-lucide-trash-2",
          color: "error" as const,
          onSelect: () => openDeleteVersionDraftCard(poster),
        },
      ],
    ];
  }

  return [
    [
      regeneratePreview,
      {
        label: "Delete draft",
        description: "Remove this draft for good",
        icon: "i-lucide-trash-2",
        color: "error" as const,
        onSelect: () => openDeleteModal(poster),
      },
    ],
  ];
}
</script>

<template>
  <DashboardShell>
    <template #sidebar="{ collapsed, closeMenu }">
      <DashboardSidebarNav
        v-model:view="activeDashboardTab"
        v-model:filter="publishedFilter"
        :collapsed="collapsed"
        :views="dashboardViews"
        :filters="publishedFilterOptions"
        @navigate="closeMenu"
      />
    </template>

    <template #header>
      <UDashboardNavbar :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #title>
          <span class="truncate">{{ activeViewLabel }}</span>

          <span
            v-if="activeFilterLabel"
            class="text-muted truncate font-normal"
          >
            / {{ activeFilterLabel }}
          </span>
        </template>

        <template #right>
          <!-- /share lets people choose one poster or a batch. -->
          <UButton
            label="Share Posters"
            to="/share"
            size="md"
            trailing-icon="line-md:file-upload"
            color="primary"
            variant="solid"
            aria-label="Share Posters"
            :ui="{ label: 'max-sm:hidden' }"
          />
        </template>
      </UDashboardNavbar>

      <DashboardPublishedToolbar
        v-if="showPublishedToolbar"
        v-model:search="publishedSearch"
        v-model:kind="publishedFilter"
        v-model:sort="publishedSort"
        v-model:repositories="repositoryFilter"
        v-model:years="yearFilter"
        v-model:licenses="licenseFilter"
        v-model:show-deleted="showTombstonedPosters"
        :kinds="publishedFilterOptions"
        :repository-options="repositoryOptions"
        :year-options="yearOptions"
        :license-options="licenseOptions"
        :deleted-count="tombstonedPosterCount"
        :poster-count="filteredPublishedPosters.length"
        :searching="publishedSearchPending"
      />
    </template>

    <template #body>
      <MaintenanceNotice maintenance-key="extraction" />

      <MaintenanceNotice maintenance-key="zenodo" />

      <OrganizationInviteBanner />

      <DashboardOrcidSuggestions
        v-if="activeDashboardTab === 'suggested'"
        :data="orcidSuggestions ?? null"
        @changed="refreshOrcidSuggestions"
        @claimed="onOrcidSuggestionsClaimed"
      />

      <DashboardPublishedKindEmpty
        v-else-if="publishedKindEmpty && publishedFilter !== 'all'"
        :kind="publishedFilter"
        :suggestion-count="orcidSuggestionCount"
        :deleted-hidden="!showTombstonedPosters && tombstonedPosterCount > 0"
        @show-suggested="activeDashboardTab = 'suggested'"
      />

      <section
        v-else-if="
          activeTabHasItems ||
          (activeDashboardTab === 'published' && publishedTabHasItems)
        "
        class="space-y-3"
      >
        <p class="text-muted text-sm">{{ activeDashboardDescription }}</p>

        <UAlert
          v-if="activeDashboardTab === 'published' && publishedSearchFailed"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="The search didn't run"
          description="Try it again in a moment."
          :actions="[
            {
              label: 'Try again',
              color: 'error',
              variant: 'outline',
              onClick: () => refreshPublishedSearch(),
            },
          ]"
        />

        <div
          v-if="activeDashboardTab === 'published' && publishedSearchPending"
          class="text-muted flex items-center justify-center gap-2 py-12 text-sm"
        >
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Searching your posters...
        </div>

        <div
          v-else-if="!activeTabHasItems"
          class="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center"
        >
          <Icon name="i-lucide-search-x" class="text-muted h-12 w-12" />

          <h3 class="text-lg font-medium">No posters match</h3>

          <p class="text-muted text-sm">
            Try another search or filter.
            <template
              v-if="!showTombstonedPosters && tombstonedPosterCount > 0"
            >
              Deleted posters are hidden.
            </template>
          </p>

          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-x"
            label="Clear search and filters"
            @click="clearPublishedSearchAndFilters"
          />
        </div>

        <UPageList v-else class="max-md:flex max-md:flex-col max-md:gap-4">
          <template v-for="item in activeTabListItems" :key="item.key">
            <template v-if="item.type === 'bulk'">
              <DashboardBulkSubmissionCard
                :bulk="item.bulk"
                :highlight="publishedHighlight?.title"
                :summary-panel-id="
                  item.batch ? `batch-summary-${item.bulk.id}` : undefined
                "
                :summary-expanded="publishedBatchExpanded(item.bulk.id)"
                @toggle-summary="togglePublishedBatch(item.bulk.id)"
                @delete="openDeleteBulkModal"
              />

              <!-- The batch summary, in place: the summary page's details,
                   then the batch's posters listed like a poster's version
                   history, each row keeping the full card's actions. -->
              <div
                v-if="item.batch && publishedBatchExpanded(item.bulk.id)"
                :id="`batch-summary-${item.bulk.id}`"
                class="border-default ml-6 space-y-2 border-l-2 py-2 pl-5"
              >
                <DashboardBatchSummaryStrip :bulk="item.bulk" />

                <p
                  v-if="publishedBatchSummaries[item.bulk.id] === 'pending'"
                  class="text-muted flex items-center gap-1.5 text-xs"
                  aria-live="polite"
                >
                  <UIcon
                    name="i-lucide-loader-circle"
                    class="size-3.5 animate-spin"
                  />
                  Loading file names...
                </p>

                <p
                  v-else-if="publishedBatchSummaries[item.bulk.id] === 'error'"
                  class="text-muted text-xs"
                >
                  Could not load this batch's file names.
                </p>

                <p
                  v-if="item.batch.posters.length < item.batch.total"
                  class="text-muted text-xs"
                >
                  Showing {{ item.batch.posters.length.toLocaleString() }} of
                  {{ item.batch.total.toLocaleString() }} posters in this batch
                </p>

                <div
                  v-for="poster in shownPublishedBatchPosters(
                    item.bulk.id,
                    item.batch.posters,
                  )"
                  :key="poster.id"
                  class="hover:border-primary/40 hover:bg-primary/5 border-default flex w-full items-center gap-2 rounded-lg border bg-white p-3 transition-colors max-sm:flex-wrap dark:bg-gray-950"
                  :class="{ 'opacity-70 hover:opacity-100': poster.tombstone }"
                >
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-4 text-left max-sm:basis-full"
                    :aria-haspopup="poster.tombstone ? 'dialog' : undefined"
                    @click="openPoster(poster)"
                  >
                    <span
                      v-if="posterPreviewMissing(poster)"
                      class="bg-muted flex h-14 w-12 shrink-0 items-center justify-center rounded"
                    >
                      <UIcon
                        name="i-lucide-image-off"
                        class="text-muted size-4"
                      />
                    </span>

                    <img
                      v-else
                      :src="
                        getImage(poster) ||
                        `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.id}`
                      "
                      :alt="getCardTitle(poster)"
                      class="h-14 w-12 shrink-0 rounded object-contain"
                    />

                    <span class="min-w-0 flex-1">
                      <span class="flex flex-wrap items-center gap-2">
                        <UBadge
                          :color="posterStatusPresentation(poster).color"
                          variant="solid"
                          size="sm"
                          :icon="posterStatusPresentation(poster).icon"
                        >
                          {{ posterStatusPresentation(poster).label }}
                        </UBadge>

                        <!-- FEATURE FLAG (versioning) -->
                        <UBadge
                          v-if="versioningEnabled && poster.activeVersionDraft"
                          color="warning"
                          variant="solid"
                          size="sm"
                          icon="i-lucide-file-clock"
                        >
                          Pending draft
                        </UBadge>

                        <!-- FEATURE FLAG (versioning) -->
                        <UBadge
                          v-if="versioningEnabled && displayedVersion(poster)"
                          color="neutral"
                          variant="soft"
                          size="sm"
                        >
                          Version {{ displayedVersion(poster) }}
                        </UBadge>

                        <!-- FEATURE FLAG (versioning). A hint only: the
                             versions are listed under Multiple versions. -->
                        <UBadge
                          v-if="
                            versioningEnabled &&
                            publishedVersionHistory(poster).length > 0
                          "
                          color="neutral"
                          variant="outline"
                          size="sm"
                          icon="i-lucide-history"
                        >
                          {{ publishedFamilyCount(poster) }} published versions
                        </UBadge>
                      </span>

                      <span
                        class="mt-1 block truncate text-sm font-medium"
                        :title="getCardTitle(poster)"
                      >
                        <SearchHighlight
                          :text="
                            getCardDisplayTitle(poster) || 'No title available'
                          "
                          :term="publishedHighlight?.title"
                        />
                      </span>

                      <span
                        class="text-muted flex flex-wrap items-center gap-x-2 text-xs"
                      >
                        <span v-if="poster.publishedAt">
                          Published
                          {{ dayjs(poster.publishedAt).format("MMMM D, YYYY") }}
                        </span>

                        <span
                          v-if="
                            publishedBatchPosterDetails(item.bulk.id, poster)
                              .fileName
                          "
                          class="max-w-64 truncate"
                          :title="
                            publishedBatchPosterDetails(item.bulk.id, poster)
                              .fileName ?? undefined
                          "
                        >
                          {{
                            publishedBatchPosterDetails(item.bulk.id, poster)
                              .fileName
                          }}
                        </span>

                        <span
                          v-if="
                            publishedBatchPosterDetails(item.bulk.id, poster)
                              .doi
                          "
                          class="max-w-64 truncate"
                          :title="
                            publishedBatchPosterDetails(item.bulk.id, poster)
                              .doi ?? undefined
                          "
                        >
                          DOI:
                          {{
                            publishedBatchPosterDetails(item.bulk.id, poster)
                              .doi
                          }}
                        </span>
                      </span>
                    </span>
                  </button>

                  <div
                    v-if="!poster.tombstone"
                    class="flex shrink-0 items-center gap-2 max-sm:ml-auto"
                  >
                    <UButton
                      v-if="posterPreviewMissing(poster)"
                      color="neutral"
                      variant="subtle"
                      icon="i-lucide-refresh-cw"
                      label="Generate preview"
                      size="xs"
                      :loading="regeneratingThumbnailIds.includes(poster.id)"
                      @click="regenerateThumbnail(poster)"
                    />

                    <!-- FEATURE FLAG (versioning) -->
                    <UButton
                      v-if="
                        versioningEnabled &&
                        poster.isLatestPublished &&
                        poster.activeVersionDraft
                      "
                      color="primary"
                      variant="subtle"
                      label="Review draft"
                      icon="i-lucide-file-pen-line"
                      size="xs"
                      @click="reviewPendingDraft(poster)"
                    />

                    <!-- FEATURE FLAG (versioning) -->
                    <UTooltip
                      v-if="
                        versioningEnabled &&
                        poster.isLatestPublished &&
                        !poster.automated &&
                        !poster.activeVersionDraft
                      "
                      :text="versionActionTooltip(poster)"
                    >
                      <span class="inline-flex">
                        <UButton
                          color="primary"
                          variant="subtle"
                          label="Edit"
                          icon="i-lucide-pencil"
                          size="xs"
                          :disabled="versionActionDisabled(poster)"
                          @click="openVersionWorkflow(poster)"
                        />
                      </span>
                    </UTooltip>

                    <UTooltip
                      v-if="
                        publishedBatchPosterDetails(item.bulk.id, poster)
                          .recordUrl
                      "
                      :text="
                        publishedBatchPosterDetails(item.bulk.id, poster)
                          .repositoryLabel
                      "
                    >
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-external-link"
                        :aria-label="
                          publishedBatchPosterDetails(item.bulk.id, poster)
                            .repositoryLabel
                        "
                        :href="
                          publishedBatchPosterDetails(item.bulk.id, poster)
                            .recordUrl ?? undefined
                        "
                        target="_blank"
                        rel="noopener noreferrer"
                        external
                      />
                    </UTooltip>

                    <UDropdownMenu
                      v-if="publishedPosterMenuItems(poster).length"
                      :items="publishedPosterMenuItems(poster)"
                      :content="{ align: 'end' }"
                      :ui="{ itemLeadingIcon: 'self-center' }"
                    >
                      <UButton
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-ellipsis-vertical"
                        size="xs"
                        aria-label="More poster actions"
                        :loading="
                          organizationPromptLoadingId === poster.rootPosterId ||
                          collectionPromptLoadingId === poster.rootPosterId
                        "
                      />
                    </UDropdownMenu>
                  </div>
                </div>

                <UButton
                  v-if="
                    item.batch.posters.length >
                    shownPublishedBatchPosters(item.bulk.id, item.batch.posters)
                      .length
                  "
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-chevron-down"
                  :label="`Show ${(item.batch.posters.length - PUBLISHED_BATCH_ROWS_SHOWN).toLocaleString()} more`"
                  @click="showAllPublishedBatchPosters(item.bulk.id)"
                />
              </div>
            </template>

            <template v-else>
              <template v-for="poster in [item.poster]" :key="poster.id">
                <UPageCard
                  variant="ghost"
                  class="group border-default h-50 overflow-hidden rounded-none border-t border-b transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm dark:max-md:bg-gray-950"
                  :class="
                    poster.tombstone
                      ? 'cursor-pointer opacity-70 hover:opacity-100'
                      : 'cursor-pointer max-md:hover:shadow-md'
                  "
                  :aria-haspopup="poster.tombstone ? 'dialog' : undefined"
                  tabindex="0"
                  @click="openPoster(poster)"
                  @keydown.enter="openPoster(poster)"
                  @keydown.space.prevent="openPoster(poster)"
                >
                  <div
                    class="flex h-full gap-8 max-md:h-auto max-md:flex-col max-md:gap-0"
                  >
                    <div
                      class="max-md:border-default h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b"
                    >
                      <div
                        v-if="posterPreviewMissing(poster)"
                        class="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center max-md:min-h-44"
                      >
                        <UIcon
                          name="i-lucide-image-off"
                          class="size-5 text-gray-400 dark:text-gray-500"
                        />

                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          Preview unavailable
                        </span>

                        <UButton
                          size="xs"
                          color="neutral"
                          variant="subtle"
                          icon="i-lucide-refresh-cw"
                          :loading="
                            regeneratingThumbnailIds.includes(poster.id)
                          "
                          @click.stop="regenerateThumbnail(poster)"
                        >
                          Generate
                        </UButton>
                      </div>

                      <img
                        v-else
                        :src="
                          getImage(poster) ||
                          `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.id}`
                        "
                        :alt="getCardTitle(poster)"
                        class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 max-md:h-full max-md:max-h-none max-md:p-3"
                        :class="{ 'group-hover:scale-105': !poster.tombstone }"
                      />
                    </div>

                    <div
                      class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
                    >
                      <div class="flex flex-col gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <UBadge
                            :color="posterStatusPresentation(poster).color"
                            variant="solid"
                            size="sm"
                            :icon="posterStatusPresentation(poster).icon"
                          >
                            {{ posterStatusPresentation(poster).label }}
                          </UBadge>

                          <UTooltip
                            v-if="poster.claimed"
                            text="You claimed this poster. Only its original publisher can edit it."
                          >
                            <UBadge
                              color="info"
                              variant="soft"
                              size="sm"
                              icon="i-heroicons-hand-raised"
                              class="cursor-help"
                            >
                              Claimed
                            </UBadge>
                          </UTooltip>

                          <UBadge
                            v-if="poster.automated"
                            color="primary"
                            variant="soft"
                            size="sm"
                            icon="i-lucide-sparkles"
                          >
                            Auto-indexed
                          </UBadge>

                          <UBadge
                            v-if="poster.claimed"
                            color="neutral"
                            variant="soft"
                            size="sm"
                            icon="i-lucide-user-check"
                          >
                            Author
                          </UBadge>

                          <!-- A batch poster listed on its own, as under
                               Multiple versions, names its batch. -->
                          <UBadge
                            v-if="
                              activeDashboardTab === 'published' &&
                              poster.bulkSubmission &&
                              !publishedPosterBatchId(poster)
                            "
                            color="neutral"
                            variant="outline"
                            size="sm"
                            icon="i-lucide-library-big"
                            class="max-w-56"
                            :title="`From the bulk upload ${poster.bulkSubmission.name}`"
                          >
                            <span class="truncate">
                              {{ poster.bulkSubmission.name }}
                            </span>
                          </UBadge>

                          <OrganizationListingBadges
                            v-if="
                              posterShowsPublishedDashboardActions(poster) &&
                              poster.isLatestPublished &&
                              !poster.tombstone
                            "
                            :organizations="listedOn(poster.rootPosterId)"
                          />

                          <!-- FEATURE FLAG (versioning) -->
                          <UBadge
                            v-if="
                              versioningEnabled &&
                              poster.status === 'published' &&
                              poster.isLatestPublished &&
                              poster.activeVersionDraft
                            "
                            color="warning"
                            variant="solid"
                            size="sm"
                            icon="i-lucide-file-clock"
                          >
                            Pending draft
                          </UBadge>

                          <!-- FEATURE FLAG (versioning) -->
                          <UBadge
                            v-if="
                              versioningEnabled &&
                              (displayedVersion(poster) ||
                                draftVersionLabel(poster))
                            "
                            color="neutral"
                            variant="soft"
                            size="sm"
                          >
                            Version
                            {{
                              displayedVersion(poster) ||
                              draftVersionLabel(poster)
                            }}
                          </UBadge>

                          <!-- FEATURE FLAG (versioning) -->
                          <button
                            v-if="
                              versioningEnabled &&
                              poster.status === 'published' &&
                              poster.isLatestPublished &&
                              publishedVersionHistory(poster).length > 0
                            "
                            class="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                            :aria-expanded="publishedHistoryExpanded(poster)"
                            @click.stop="togglePublishedHistory(poster)"
                          >
                            {{
                              publishedHistoryExpanded(poster) ? "Hide" : "View"
                            }}
                            {{ publishedFamilyCount(poster) }} published
                            versions
                            <Icon
                              name="i-lucide-chevron-down"
                              class="h-3.5 w-3.5 transition-transform"
                              :class="{
                                'rotate-180': publishedHistoryExpanded(poster),
                              }"
                            />
                          </button>
                        </div>

                        <h3
                          class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
                          :title="getCardTitle(poster)"
                        >
                          <SearchHighlight
                            :text="
                              getCardDisplayTitle(poster) ||
                              'No title available'
                            "
                            :term="publishedHighlight?.title"
                          />
                        </h3>

                        <div class="flex flex-col gap-1">
                          <p
                            :class="[
                              'text-sm',
                              expandedDescriptions.has(poster.id)
                                ? ''
                                : 'line-clamp-2',
                            ]"
                          >
                            <SearchHighlight
                              :text="
                                getCardDescription(poster) ||
                                'No description available'
                              "
                              :term="publishedHighlight?.description"
                            />
                          </p>

                          <button
                            v-if="getCardDescription(poster).length > 100"
                            class="text-primary w-fit text-left text-xs font-medium md:hidden"
                            @click.stop="toggleDescription(poster.id)"
                          >
                            {{
                              expandedDescriptions.has(poster.id)
                                ? "Show less"
                                : "Show more"
                            }}
                          </button>
                        </div>
                      </div>

                      <div
                        class="border-default flex items-center justify-between border-t pt-2 text-xs max-md:flex-wrap max-md:gap-y-2"
                      >
                        <div
                          class="text-muted flex items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1"
                        >
                          <span
                            v-if="poster.claimedAt"
                            class="flex items-center gap-1"
                          >
                            <Icon
                              name="heroicons:hand-raised"
                              class="h-3 w-3"
                            />
                            Claimed
                            {{ dayjs(poster.claimedAt).format("MMMM D, YYYY") }}
                          </span>

                          <span v-else class="flex items-center gap-1">
                            <Icon
                              name="heroicons:calendar-days"
                              class="h-3 w-3"
                            />
                            Created
                            {{ dayjs(poster.created).format("MMMM D, YYYY") }}
                          </span>

                          <span
                            v-if="posterEmbargoTimeRemainingLabel(poster)"
                            class="border-default flex items-center gap-1 border-l pl-2 max-md:border-l-0 max-md:pl-0"
                          >
                            <Icon name="i-lucide-lock" class="h-3 w-3" />
                            {{ posterEmbargoTimeRemainingLabel(poster) }}
                            <span
                              v-if="poster.zenodoFilesEmbargoUntil"
                              class="text-muted"
                            >
                              (until
                              {{
                                formatZenodoFileEmbargoUntilLabel(
                                  poster.zenodoFilesEmbargoUntil,
                                )
                              }}
                              UTC)
                            </span>
                          </span>

                          <span
                            v-if="
                              poster.publishedAt &&
                              posterShowsPublishedDashboardActions(poster)
                            "
                            class="border-default flex items-center gap-1 border-l pl-2 max-md:border-l-0 max-md:pl-0"
                          >
                            <Icon
                              name="heroicons:presentation-chart-bar"
                              class="h-3 w-3"
                            />
                            Published
                            {{
                              dayjs(poster.publishedAt).format("MMMM D, YYYY")
                            }}
                          </span>

                          <span
                            v-else-if="
                              poster.publishedAt &&
                              isPosterZenodoEmbargoActive(poster)
                            "
                            class="border-default flex items-center gap-1 border-l pl-2 max-md:border-l-0 max-md:pl-0"
                          >
                            <Icon
                              name="heroicons:presentation-chart-bar"
                              class="h-3 w-3"
                            />
                            Submitted to Zenodo
                            {{
                              dayjs(poster.publishedAt).format("MMMM D, YYYY")
                            }}
                          </span>
                        </div>

                        <div
                          v-if="!poster.tombstone"
                          class="flex items-center gap-2 max-md:flex-wrap"
                          @click.stop
                        >
                          <template
                            v-if="posterShowsPublishedDashboardActions(poster)"
                          >
                            <UButton
                              color="neutral"
                              variant="subtle"
                              label="View poster"
                              icon="i-lucide-eye"
                              size="xs"
                              @click="openPoster(poster)"
                            />

                            <!-- FEATURE FLAG (versioning) -->
                            <UButton
                              v-if="
                                versioningEnabled &&
                                poster.isLatestPublished &&
                                poster.activeVersionDraft
                              "
                              color="primary"
                              variant="subtle"
                              label="Review draft"
                              icon="i-lucide-file-pen-line"
                              size="xs"
                              @click="reviewPendingDraft(poster)"
                            />

                            <!-- FEATURE FLAG (versioning) -->
                            <UTooltip
                              v-if="
                                versioningEnabled &&
                                poster.isLatestPublished &&
                                !poster.automated &&
                                !poster.activeVersionDraft
                              "
                              :text="versionActionTooltip(poster)"
                            >
                              <span class="inline-flex">
                                <UButton
                                  color="primary"
                                  variant="subtle"
                                  label="Edit"
                                  icon="i-lucide-pencil"
                                  size="xs"
                                  :disabled="versionActionDisabled(poster)"
                                  @click="openVersionWorkflow(poster)"
                                />
                              </span>
                            </UTooltip>

                            <UDropdownMenu
                              v-if="publishedPosterMenuItems(poster).length"
                              :items="publishedPosterMenuItems(poster)"
                              :content="{ align: 'end' }"
                              :ui="{ itemLeadingIcon: 'self-center' }"
                            >
                              <UButton
                                color="neutral"
                                variant="ghost"
                                icon="i-lucide-ellipsis-vertical"
                                size="xs"
                                aria-label="More poster actions"
                                :loading="
                                  organizationPromptLoadingId ===
                                    poster.rootPosterId ||
                                  collectionPromptLoadingId ===
                                    poster.rootPosterId
                                "
                              />
                            </UDropdownMenu>
                          </template>

                          <template v-else>
                            <UButton
                              color="primary"
                              variant="subtle"
                              :label="inProgressActionLabel(poster)"
                              :icon="
                                isVersionPreparing(poster)
                                  ? 'i-lucide-activity'
                                  : 'line-md:arrow-right'
                              "
                              trailing
                              size="xs"
                              @click="openInProgressPoster(poster)"
                            />

                            <UDropdownMenu
                              v-if="posterMenuItems(poster).length"
                              :items="posterMenuItems(poster)"
                              :content="{ align: 'end' }"
                              :ui="{ itemLeadingIcon: 'self-center' }"
                            >
                              <UButton
                                color="neutral"
                                variant="ghost"
                                icon="i-lucide-ellipsis-vertical"
                                size="xs"
                                aria-label="More poster actions"
                              />
                            </UDropdownMenu>
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>
                </UPageCard>

                <!-- FEATURE FLAG (versioning) -->
                <div
                  v-if="
                    versioningEnabled &&
                    poster.status === 'published' &&
                    publishedHistoryExpanded(poster)
                  "
                  class="border-default ml-6 space-y-2 border-l-2 py-2 pl-5"
                >
                  <div
                    v-for="version in publishedVersionHistory(poster)"
                    :key="version.id"
                    class="hover:border-primary/40 hover:bg-primary/5 border-default flex w-full items-center gap-2 rounded-lg border bg-white p-3 transition-colors dark:bg-gray-950"
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-4 text-left"
                      @click="openPoster(version)"
                    >
                      <img
                        :src="
                          getImage(version) ||
                          `https://api.dicebear.com/9.x/shapes/svg?seed=${version.id}`
                        "
                        :alt="getCardTitle(version)"
                        class="h-14 w-12 shrink-0 rounded object-contain"
                      />

                      <span class="min-w-0 flex-1">
                        <span class="flex flex-wrap items-center gap-2">
                          <UBadge color="neutral" variant="soft" size="sm">
                            Version {{ displayedVersion(version) }}
                          </UBadge>

                          <UBadge
                            v-if="version.tombstone"
                            color="error"
                            variant="solid"
                            size="sm"
                          >
                            Tombstoned
                          </UBadge>
                        </span>

                        <span class="mt-1 block truncate text-sm font-medium">
                          {{
                            getCardDisplayTitle(version) || "No title available"
                          }}
                        </span>

                        <span
                          v-if="version.publishedAt"
                          class="text-muted text-xs"
                        >
                          Published
                          {{
                            dayjs(version.publishedAt).format("MMMM D, YYYY")
                          }}
                        </span>
                      </span>

                      <Icon
                        name="i-lucide-chevron-right"
                        class="text-muted h-4 w-4 shrink-0"
                      />
                    </button>
                  </div>
                </div>
              </template>
            </template>
          </template>
        </UPageList>
      </section>

      <div
        v-else-if="visiblePosterCount > 0"
        class="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center"
      >
        <Icon
          :name="
            activeDashboardTab === 'in-progress'
              ? 'i-lucide-circle-check'
              : 'i-lucide-book-open'
          "
          class="text-muted h-12 w-12"
        />

        <h3 class="text-lg font-medium">
          {{
            activeDashboardTab === "in-progress"
              ? "No posters in progress"
              : "No published posters"
          }}
        </h3>

        <p class="text-muted text-sm">
          {{
            activeDashboardTab === "in-progress"
              ? "All of your posters are up to date."
              : "Your published posters will appear here."
          }}
        </p>
      </div>

      <div v-else class="py-12 text-center">
        <div
          v-if="posters.length > 0"
          class="mx-auto flex max-w-md flex-col items-center gap-3"
        >
          <Icon name="i-lucide-archive-x" class="text-muted h-12 w-12" />

          <h3 class="text-lg font-medium">Deleted posters are hidden</h3>

          <p class="text-muted text-sm">
            Turn on Show deleted posters under Filters and sorting to include
            them in your dashboard.
          </p>

          <UButton
            label="Show deleted posters"
            color="neutral"
            variant="subtle"
            @click="showTombstonedPosters = true"
          />
        </div>

        <NuxtLink
          v-else
          to="/share"
          class="group inline-block rounded-2xl px-8 py-6 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50"
        >
          <div
            class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-gray-200"
          >
            <Icon
              name="heroicons:document-text"
              class="h-12 w-12 text-gray-400 transition-colors group-hover:text-gray-500"
            />
          </div>

          <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
            No posters yet
          </h3>

          <p
            class="mb-6 text-gray-500 underline-offset-2 group-hover:underline dark:text-gray-400"
          >
            Get started by sharing your first poster.
          </p>
        </NuxtLink>
      </div>
    </template>

    <UModal
      v-model:open="removeClaimOpen"
      title="Remove this claim?"
      description="The poster will no longer appear on your dashboard, your profile or any organization page you added it to. You can claim it again from its page."
    >
      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-3">
          <UButton
            color="neutral"
            variant="subtle"
            label="Cancel"
            @click="close"
          />

          <UButton
            color="error"
            label="Remove claim"
            icon="i-lucide-x"
            :loading="removingClaim"
            @click="confirmRemoveClaim"
          />
        </div>
      </template>
    </UModal>

    <OrganizationPosterModal
      v-model:open="organizationPromptOpen"
      :choices="organizationPromptChoices"
      :title="
        organizationPromptAfterPublish
          ? 'Show this poster on an organization page?'
          : 'Organizations'
      "
      :description="
        organizationPromptAfterPublish
          ? 'Your poster is published. You can also show it on the pages of organizations you belong to.'
          : 'Choose which of your organizations show this poster on their page.'
      "
      :dismiss-label="organizationPromptAfterPublish ? 'Not now' : 'Cancel'"
      @saved="refreshOrganizationListings()"
    />

    <CollectionPosterModal
      v-model:open="collectionPromptOpen"
      :choices="collectionPromptChoices"
    />

    <!-- Delete draft modal -->
    <USlideover
      v-model:open="versionModalOpen"
      title="Edit Published Poster"
      :description="
        versionPanelState === 'setup'
          ? 'Select what you would like to change.'
          : `Editing ${versionPoster?.title ?? 'your poster'}`
      "
      side="right"
      class="w-full max-w-2xl"
      :dismissible="!creatingVersion && !deletingVersionDraft"
      :close="!creatingVersion && !deletingVersionDraft"
    >
      <template #body>
        <div
          v-if="versionPanelState === 'setup'"
          class="flex min-h-full flex-col"
        >
          <div class="space-y-5">
            <MaintenanceNotice maintenance-key="versioning" />

            <MaintenanceNotice
              v-if="versionMetadataMode === 'extract'"
              maintenance-key="extraction"
            />

            <p class="text-muted text-sm">
              Select what you would like to change for
              <span class="text-highlighted font-medium">{{
                versionPoster?.title
              }}</span
              >. You will review your changes before publishing.
            </p>

            <UFormField label="Poster file">
              <URadioGroup
                v-model="versionFileMode"
                :items="versionFileOptions"
              />
            </UFormField>

            <UiFileUpload
              v-if="versionFileMode === 'upload'"
              :accept="POSTER_FILE_ACCEPT"
              :validate-file="validateVersionFile"
              :hint="VERSION_FILE_HINT"
              @on-change="versionFiles = $event"
              @on-reject="onVersionFileRejected"
            >
              <UiFileUploadGrid />
            </UiFileUpload>

            <UFormField v-if="versionFileMode === 'upload'" label="Metadata">
              <URadioGroup
                v-model="versionMetadataMode"
                :items="versionMetadataOptions"
              />
            </UFormField>

            <ExtractionAccuracyNotice
              v-if="
                versionFileMode === 'upload' &&
                versionMetadataMode === 'extract'
              "
            />

            <UAlert
              v-if="versionError"
              color="error"
              variant="soft"
              title="Could not prepare edits"
              :description="versionError"
            />
          </div>

          <div class="bg-default sticky bottom-0 z-10 mt-auto pt-5">
            <UAlert
              color="primary"
              variant="soft"
              icon="i-lucide-info"
              title="How editing a published poster works"
              description="Published records cannot be modified after publication. Editing a published poster creates a new publication on top of the existing one, which appears as a new version. Only create a new version when the poster file has changed or its metadata needs to be corrected or updated."
            />
          </div>
        </div>

        <div v-else-if="versionPanelState === 'extracting'" class="space-y-6">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-medium">
                {{ versionExtractionStatus.title }}
              </h3>

              <UBadge color="info" variant="soft">
                Version {{ currentVersionDraft?.versionSequence }}
              </UBadge>
            </div>

            <p class="text-muted text-sm">
              {{ versionExtractionStatus.description }}
            </p>
          </div>

          <div class="space-y-3">
            <UProgress
              color="primary"
              size="md"
              :model-value="versionProgressStep"
              :max="VERSION_PROGRESS_STEPS"
            />

            <ol class="space-y-2">
              <li
                v-for="step in versionProgressSteps"
                :key="step.label"
                class="flex items-center gap-2 text-sm"
                :class="
                  step.active
                    ? 'text-highlighted font-medium'
                    : step.done
                      ? 'text-muted'
                      : 'text-dimmed'
                "
              >
                <UIcon
                  v-if="step.done"
                  name="i-lucide-circle-check"
                  class="size-4 shrink-0 text-(--ui-success)"
                />

                <UIcon
                  v-else-if="step.active"
                  name="i-lucide-loader-circle"
                  class="size-4 shrink-0 animate-spin"
                />

                <UIcon
                  v-else
                  name="i-lucide-circle-dashed"
                  class="size-4 shrink-0"
                />

                <span>{{ step.label }}</span>
              </li>
            </ol>

            <div
              class="text-dimmed flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            >
              <span v-if="versionElapsedLabel">
                Preparing for {{ versionElapsedLabel }}
              </span>

              <span v-if="versionLastCheckedLabel">
                {{ versionLastCheckedLabel }}
              </span>
            </div>
          </div>

          <UAlert
            v-if="versionPreparingIsSlow"
            color="warning"
            variant="soft"
            icon="i-lucide-clock"
            title="This is taking longer than usual"
            description="Extraction normally finishes within a few minutes. This panel keeps checking and your published poster is unchanged, so you can close it and come back later."
          />

          <p class="text-muted text-sm">
            {{
              versionProgressStep === 3
                ? "This status will change to ready for review once the preview image is saved."
                : versionProgressStep === 1
                  ? "This status will change automatically when the extraction service claims the job."
                  : "This status will change to ready for review after the extracted fields have been saved."
            }}
          </p>

          <UAlert
            v-if="versionPollingError"
            color="warning"
            variant="soft"
            :title="
              versionThumbnailNeedsAttention
                ? 'Poster preview needs attention'
                : 'Status temporarily unavailable'
            "
            :description="
              versionThumbnailNeedsAttention
                ? `${versionPollingError} Retrying uses the poster file already saved with this draft.`
                : `${versionPollingError} We'll keep trying automatically.`
            "
          />

          <UButton
            v-if="versionThumbnailNeedsAttention"
            color="primary"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="retryingVersionThumbnail"
            :disabled="extractionPaused"
            @click="retryVersionThumbnail"
          >
            Retry Poster Preview
          </UButton>

          <p class="text-muted text-sm">
            You can close this panel, refresh the dashboard, or leave this page.
            Preparation will continue, and this panel will show the latest
            status when you return.
          </p>
        </div>

        <div v-else-if="versionPanelState === 'ready'" class="space-y-5">
          <UAlert
            color="success"
            variant="soft"
            icon="i-lucide-circle-check"
            title="Your edits are ready to review"
            description="Your metadata is ready. Continue to review and edit it before publishing your changes."
          />

          <p class="text-muted text-sm">
            Your published poster remains unchanged until you finish reviewing
            and publish your edits.
          </p>
        </div>

        <div v-else class="space-y-5">
          <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Metadata extraction failed"
            :description="
              currentVersionDraft?.extractionJob?.error ||
              'The extraction service could not process this poster file.'
            "
          />

          <p class="text-muted text-sm">
            The published poster has not been changed. Retrying uses the same
            editable draft and stored poster file.
          </p>

          <UAlert
            v-if="versionPollingError"
            color="warning"
            variant="soft"
            title="Could not retry extraction"
            :description="versionPollingError"
          />
        </div>
      </template>

      <template #footer>
        <div
          v-if="versionPanelState === 'setup'"
          class="flex w-full justify-end gap-3"
        >
          <UButton
            variant="outline"
            :disabled="creatingVersion"
            @click="versionModalOpen = false"
          >
            Cancel
          </UButton>

          <UButton
            color="primary"
            :loading="creatingVersion"
            :disabled="
              versioningPaused ||
              (extractionPaused && versionMetadataMode === 'extract')
            "
            @click="createVersion"
          >
            Continue
          </UButton>
        </div>

        <div
          v-else-if="
            versionPanelState === 'ready' || versionPanelState === 'failed'
          "
          class="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <UButton
            v-if="
              versionPanelState === 'ready' || versionPanelState === 'failed'
            "
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :disabled="retryingVersionExtraction"
            @click="deleteVersionModalOpen = true"
          >
            Discard Edits
          </UButton>

          <div class="flex flex-wrap justify-end gap-3">
            <UButton
              v-if="versionPanelState === 'ready'"
              color="primary"
              icon="i-lucide-arrow-right"
              trailing
              @click="reviewVersionDraft"
            >
              Review Metadata
            </UButton>

            <UButton
              v-else-if="versionPanelState === 'failed'"
              color="primary"
              icon="i-lucide-refresh-cw"
              :loading="retryingVersionExtraction"
              :disabled="extractionPaused"
              @click="retryVersionExtraction"
            >
              Retry Extraction
            </UButton>
          </div>
        </div>
      </template>
    </USlideover>

    <UModal
      v-model:open="tombstoneModalOpen"
      title="Why this poster was tombstoned"
      :description="tombstonedPoster?.title || 'Tombstoned poster'"
    >
      <template #body>
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-archive-x"
          title="Reason"
          :description="
            tombstonedPoster?.tombedReason?.trim() || 'No reason was provided.'
          "
        />

        <p class="text-muted mt-4 text-sm">
          Only the Posters.science team can restore a tombstoned poster. If you
          have questions or concerns,
          <ULink
            to="https://tally.so/r/XxEBYP"
            target="_blank"
            class="text-primary underline"
            >contact us</ULink
          >.
        </p>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteVersionModalOpen"
      title="Discard Edits?"
      :dismissible="!deletingVersionDraft"
      :close="!deletingVersionDraft"
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            Discard the draft changes for version
            <span class="font-medium">{{
              currentVersionDraft?.versionSequence
            }}</span>
            of
            <span class="font-medium">{{
              versionPoster?.title || "this poster"
            }}</span
            >?
          </p>

          <p class="text-muted">
            This removes the editable draft, its stored poster file and
            metadata. The published poster and its earlier versions will not be
            changed. This cannot be undone.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton
            variant="outline"
            :disabled="deletingVersionDraft"
            @click="deleteVersionModalOpen = false"
          >
            Cancel
          </UButton>

          <UButton
            color="error"
            :loading="deletingVersionDraft"
            @click="deleteVersionDraft"
          >
            Discard Edits
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteModalOpen" title="Delete Draft Poster">
      <template #body>
        <p class="text-sm">
          Are you sure you want to delete
          <span class="font-medium">{{
            posterToDelete?.title || "this poster"
          }}</span
          >? This cannot be undone.
        </p>
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" @click="deleteModalOpen = false">
            Cancel
          </UButton>

          <UButton color="error" :loading="isDeleting" @click="deletePoster">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="bulkDeleteModalOpen" title="Delete bulk submission">
      <template #body>
        <p class="text-sm">
          Are you sure you want to delete
          <span class="font-medium">{{
            bulkToDelete?.name || "this bulk submission"
          }}</span
          >?

          <template v-if="bulkToDelete?.status === 'processing'">
            Staged files and draft posters from this submission will be removed.
          </template>

          <template v-else>
            Staged poster files for this submission will be removed.
          </template>
          This cannot be undone.
        </p>
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" @click="bulkDeleteModalOpen = false">
            Cancel
          </UButton>

          <UButton
            color="error"
            :loading="isDeletingBulk"
            @click="deleteBulkImport"
          >
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Publication info modal -->
    <UModal v-model:open="modalOpen" title="Update Publication Information">
      <template #body>
        <p class="text-muted mb-4 text-sm">
          Now that your poster has been shared, add the details below to keep
          your record up to date.
        </p>

        <div class="space-y-4">
          <UFormField label="DOI" name="doi" :error="doiError">
            <UInput
              v-model="modalDoi"
              placeholder="e.g. 10.5281/zenodo.1234567 or https://doi.org/..."
              class="w-full"
              @input="doiError = ''"
            />
          </UFormField>

          <UFormField label="License" name="license">
            <USelect
              v-model="modalLicense"
              :items="LICENSE_OPTIONS"
              placeholder="Select a license"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Publisher" name="publisher">
            <UInput
              v-model="modalPublisher"
              placeholder="e.g. Zenodo, Figshare"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" @click="modalOpen = false">
            Cancel
          </UButton>

          <UButton
            color="primary"
            :loading="isSaving"
            @click="savePublicationInfo"
          >
            Save
          </UButton>
        </div>
      </template>
    </UModal>
  </DashboardShell>
</template>
