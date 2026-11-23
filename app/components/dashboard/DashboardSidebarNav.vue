<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import type {
  DashboardView,
  DashboardViewOption,
  PublishedFilter,
  PublishedFilterOption,
} from "~/types/dashboard";

// The dashboard sidebar's own content: the profile summary, the poster views
// with the Published filters under them, and links to the person's account
// pages.

const props = defineProps<{
  collapsed?: boolean;
  views: DashboardViewOption[];
  filters: PublishedFilterOption[];
}>();

const view = defineModel<DashboardView>("view", { required: true });
const filter = defineModel<PublishedFilter>("filter", { required: true });

const emit = defineEmits<{
  /** A view or link was chosen, so the mobile menu can close. */
  navigate: [];
}>();

const { invites } = useOrganizationInvites();

function selectView(value: DashboardView) {
  view.value = value;
  emit("navigate");
}

// A filter always applies to the Published view, so choosing one from
// another view switches to it.
function selectFilter(value: PublishedFilter) {
  filter.value = value;
  view.value = "published";
  emit("navigate");
}

// Every kind is listed, even with nothing in it, so it's clear what the
// dashboard can hold. An empty one says how posters get there.
const filterItems = computed<NavigationMenuItem[]>(() =>
  props.filters.map((option) => ({
    label: option.label,
    icon: option.icon,
    badge: {
      label: option.count.toLocaleString(),
      class: option.count === 0 ? "opacity-50" : undefined,
    },
    active: view.value === "published" && filter.value === option.value,
    onSelect: () => selectFilter(option.value),
  })),
);

const viewItems = computed<NavigationMenuItem[]>(() => [
  { label: "Your posters", type: "label" },
  ...props.views.flatMap((option): NavigationMenuItem[] => {
    const item: NavigationMenuItem = {
      label: option.label,
      icon: option.icon,
      badge: option.count.toLocaleString(),
      active: view.value === option.value,
      onSelect: () => selectView(option.value),
    };

    if (option.value !== "published") return [item];

    // Collapsed, the filters open from the Published icon instead.
    if (props.collapsed) return [{ ...item, children: filterItems.value }];

    // Listed flat under Published rather than as its children, so Published
    // itself stays a view to open instead of a toggle for the filters.
    return [
      item,
      ...filterItems.value.map((filterItem) => ({
        ...filterItem,
        icon: undefined,
        ui: {
          item: "ms-5 border-s border-default ps-1.5",
          link: "py-1",
        },
      })),
    ];
  }),
]);

const accountItems = computed<NavigationMenuItem[]>(() => [
  { label: "Account", type: "label" },
  {
    label: "Profile",
    icon: "i-lucide-circle-user",
    to: "/profile/me",
  },
  {
    label: "Liked posters",
    icon: "i-lucide-star",
    to: "/liked",
  },
  {
    label: "Organizations",
    icon: "i-lucide-building-2",
    to: "/organizations",
    // Pending invites, answered on the organizations page.
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
  {
    label: "Settings",
    icon: "i-lucide-settings",
    to: "/profile",
  },
]);
</script>

<template>
  <DashboardProfileSummary
    :collapsed="collapsed"
    @navigate="emit('navigate')"
  />

  <UNavigationMenu
    :collapsed="collapsed"
    :items="viewItems"
    orientation="vertical"
    tooltip
    popover
    aria-label="Your posters"
  />

  <UNavigationMenu
    :collapsed="collapsed"
    :items="accountItems"
    orientation="vertical"
    tooltip
    aria-label="Account"
  />
</template>
