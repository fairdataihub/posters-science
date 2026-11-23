import type { LocationQueryValue } from "vue-router";
import type { PosterRepository } from "#shared/types/dashboardFeed";
import type {
  DashboardView,
  InProgressFilter,
  PublishedFilter,
  PublishedSort,
} from "~/types/dashboard";
import {
  DASHBOARD_BATCH_STATUS_OPTIONS,
  type DashboardBatchStatus,
} from "~/utils/dashboardBatchStatus";

// The dashboard's views, searches and filters live in the query string, so
// each status keeps its own search and a filtered list survives a reload.
// As on profile pages, each change replaces the current history entry.

type QueryPatch = Record<string, string | string[] | undefined>;

const VIEWS: readonly DashboardView[] = [
  "in-progress",
  "published",
  "suggested",
];
const KINDS: readonly PublishedFilter[] = [
  "all",
  "owned",
  "claimed",
  "bulk",
  "versions",
];
const REPOSITORIES: readonly PosterRepository[] = [
  "zenodo",
  "figshare",
  "other",
];

export const PUBLISHED_SORT_OPTIONS: { value: PublishedSort; label: string }[] =
  [
    // The order the dashboard has always used: newest change or claim first.
    { value: "activity", label: "Recent activity" },
    { value: "published", label: "Recently published" },
    { value: "published-oldest", label: "Oldest published" },
    { value: "created", label: "Recently created" },
    { value: "title", label: "Title (A to Z)" },
  ];

export const POSTER_REPOSITORY_LABELS: Record<PosterRepository, string> = {
  zenodo: "Zenodo",
  figshare: "Figshare",
  other: "Other",
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[]) {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function queryList(
  value: LocationQueryValue | LocationQueryValue[] | undefined,
) {
  const values = Array.isArray(value) ? value : [value];

  return values.filter((v): v is string => typeof v === "string" && v !== "");
}

/**
 * The dashboard's state in the query string. `defaultView` is the view shown
 * when the URL names none.
 */
export function useDashboardQuery(defaultView: Ref<DashboardView>) {
  const route = useRoute();
  const router = useRouter();

  // Changes made together, such as choosing a Published filter from another
  // view or clearing every filter, go out as one navigation so none of them
  // overwrites another.
  let pending: QueryPatch | null = null;

  function updateQuery(patch: QueryPatch) {
    if (pending) {
      Object.assign(pending, patch);

      return;
    }

    pending = { ...patch };

    void nextTick(() => {
      const query = { ...route.query, ...pending };

      pending = null;
      void router.replace({ query });
    });
  }

  const view = computed<DashboardView>({
    get: () => oneOf(route.query.tab, VIEWS) ?? defaultView.value,
    set: (tab) =>
      updateQuery({ tab: tab === defaultView.value ? undefined : tab }),
  });

  // The kind of poster the Published view lists.
  const kind = computed<PublishedFilter>({
    get: () => oneOf(route.query.show, KINDS) ?? "all",
    set: (value) => updateQuery({ show: value === "all" ? undefined : value }),
  });

  const progressKind = computed<InProgressFilter>({
    get: () =>
      oneOf(route.query.progress, ["all", "individual", "bulk"] as const) ??
      "all",
    set: (value) =>
      updateQuery({
        progress: value === "all" ? undefined : value,
        ...(value === "individual" ? { batchStatus: undefined } : {}),
      }),
  });
  const progressSearch = computed<string>({
    get: () =>
      typeof route.query.progressSearch === "string"
        ? route.query.progressSearch
        : "",
    set: (value) => updateQuery({ progressSearch: value.trim() || undefined }),
  });
  const batchStatuses = computed<DashboardBatchStatus[]>({
    get: () =>
      queryList(route.query.batchStatus).filter(
        (value): value is DashboardBatchStatus =>
          DASHBOARD_BATCH_STATUS_OPTIONS.some(
            (option) => option.value === value,
          ),
      ),
    set: (values) =>
      updateQuery({
        batchStatus: values.length ? values : undefined,
        ...(values.length && progressKind.value === "individual"
          ? { progress: "bulk" }
          : {}),
      }),
  });

  // The submitted search, in the Discover syntax.
  const search = computed<string>({
    get: () =>
      typeof route.query.search === "string" ? route.query.search : "",
    set: (value) => updateQuery({ search: value.trim() || undefined }),
  });

  const sort = computed<PublishedSort>({
    get: () =>
      oneOf(
        route.query.sort,
        PUBLISHED_SORT_OPTIONS.map((option) => option.value),
      ) ?? "activity",
    set: (value) =>
      updateQuery({ sort: value === "activity" ? undefined : value }),
  });

  const repositories = computed<PosterRepository[]>({
    get: () =>
      queryList(route.query.repository).filter(
        (value): value is PosterRepository =>
          (REPOSITORIES as readonly string[]).includes(value),
      ),
    set: (values) =>
      updateQuery({ repository: values.length ? values : undefined }),
  });

  const years = computed<number[]>({
    get: () =>
      queryList(route.query.year)
        .map((value) => Number.parseInt(value, 10))
        .filter((year) => Number.isFinite(year)),
    set: (values) =>
      updateQuery({ year: values.length ? values.map(String) : undefined }),
  });

  const licenses = computed<string[]>({
    get: () => queryList(route.query.license),
    set: (values) =>
      updateQuery({ license: values.length ? values : undefined }),
  });

  // Deleted (tombstoned) posters are hidden until explicitly included. Use
  // a new cookie so the old automatic "show" default does not opt people in.
  // Explicit URL choices still take precedence over the saved preference.
  const showDeletedCookie = useCookie<boolean>(
    "dashboard-include-tombstoned-posters",
    {
      default: () => false,
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    },
  );

  const showDeleted = computed<boolean>({
    get: () => {
      if (route.query.deleted === "hide") return false;
      if (route.query.deleted === "show") return true;

      return showDeletedCookie.value;
    },
    set: (show) => {
      showDeletedCookie.value = show;
      updateQuery({ deleted: show ? "show" : undefined });
    },
  });

  return {
    view,
    kind,
    progressKind,
    progressSearch,
    batchStatuses,
    search,
    sort,
    repositories,
    years,
    licenses,
    showDeleted,
  };
}
