<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import type { DashboardView } from "~/types/dashboard";

// The sidebar's links: the dashboard's views on one level, then the Library.
// They're plain links into the dashboard's query string, so the sidebar
// works the same on every page in the app shell. The kinds of poster within
// a view are chosen in the dashboard's search row.

defineProps<{
  collapsed?: boolean;
}>();

const route = useRoute();
const { invites } = useOrganizationInvites();
const { data: orcidSuggestions } = useOrcidSuggestions();
const openDashboardView = useOpenDashboardView();

// The sidebar renders before the page sets the open view, so the server can't
// know a default view with no ?tab. That one is marked once mounted, so the
// server's HTML and the first browser render agree.
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const DASHBOARD_VIEWS: DashboardView[] = [
  "in-progress",
  "published",
  "suggested",
];

const dashboardView = computed<DashboardView | null>(() => {
  if (route.path !== "/dashboard") return null;

  const tab = route.query.tab;
  if (typeof tab === "string" && DASHBOARD_VIEWS.includes(tab as DashboardView))
    return tab as DashboardView;

  return mounted.value ? openDashboardView.value : null;
});

// Only an iD verified through ORCID sign-in gets suggestions, never one typed
// into Settings. The link stays while Suggested is open, so claiming the last
// suggestion doesn't pull the page out from under the user.
const showSuggested = computed(() => {
  const suggestions = orcidSuggestions.value;
  if (suggestions?.source !== "linked" || suggestions.hidden) return false;

  return suggestions.total > 0 || dashboardView.value === "suggested";
});

function viewItem(
  value: DashboardView,
  label: string,
  icon: string,
): NavigationMenuItem {
  return {
    label,
    icon,
    to: { path: "/dashboard", query: { tab: value } },
    active: dashboardView.value === value,
  };
}

const posterItems = computed<NavigationMenuItem[]>(() => [
  { label: "Your posters", type: "label" },
  viewItem("in-progress", "In progress", "i-lucide-pencil-line"),
  viewItem("published", "Published", "i-lucide-circle-check"),
  ...(showSuggested.value
    ? [viewItem("suggested", "Suggested", "i-simple-icons-orcid")]
    : []),
]);

const libraryItems = computed<NavigationMenuItem[]>(() => [
  { label: "Library", type: "label" },
  {
    label: "Liked posters",
    icon: "i-lucide-star",
    to: "/liked",
  },
  {
    label: "Organizations",
    icon: "i-lucide-building-2",
    to: "/organizations",
    ...(invites.value.length > 0 && {
      badge: {
        label: String(invites.value.length),
        color: "info" as const,
        variant: "solid" as const,
      },
    }),
  },
  {
    label: "Collections",
    icon: "i-lucide-library-big",
    to: "/collections",
  },
]);
</script>

<template>
  <UNavigationMenu
    :collapsed="collapsed"
    :items="posterItems"
    orientation="vertical"
    tooltip
    aria-label="Your posters"
  />

  <UNavigationMenu
    :collapsed="collapsed"
    :items="libraryItems"
    orientation="vertical"
    tooltip
    aria-label="Library"
  />
</template>
