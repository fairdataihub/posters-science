/** The dashboard's poster views, listed first in its sidebar. */
export type DashboardView = "in-progress" | "published" | "suggested";

/** Filters for the Published view: one kind of poster at a time. */
export type PublishedFilter = "all" | "owned" | "claimed" | "bulk" | "versions";

export type InProgressFilter = "all" | "individual" | "bulk";

export type InProgressFilterOption = {
  value: InProgressFilter;
  label: string;
  count: number;
};

/** A view listed in the sidebar. Counts belong beside the results. */
export type DashboardViewOption = {
  value: DashboardView;
  label: string;
  icon: string;
};

/** A Published filter as the sidebar lists it. */
export type PublishedFilterOption = {
  value: PublishedFilter;
  label: string;
  icon?: string;
  count: number;
};

/** How the Published view is ordered. */
export type PublishedSort =
  | "activity"
  | "published"
  | "published-oldest"
  | "created"
  | "title";

/** One choice in a Published filter, with how many posters it holds. */
export type FacetOption<T extends string | number = string> = {
  value: T;
  label: string;
  count: number;
};
