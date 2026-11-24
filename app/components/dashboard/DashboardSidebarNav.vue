<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import type {
  DashboardView,
  DashboardViewOption,
  InProgressFilter,
  InProgressFilterOption,
  PublishedFilter,
  PublishedFilterOption,
} from "~/types/dashboard";

const props = defineProps<{
  collapsed?: boolean;
  views: DashboardViewOption[];
  filters: PublishedFilterOption[];
  progressFilters: InProgressFilterOption[];
}>();
const view = defineModel<DashboardView>("view", { required: true });
const filter = defineModel<PublishedFilter>("filter", { required: true });
const progressFilter = defineModel<InProgressFilter>("progressFilter", {
  required: true,
});
const emit = defineEmits<{ navigate: [] }>();
const { invites } = useOrganizationInvites();
const openGroups = ref<Record<string, boolean>>({});
watch(
  view,
  (value) => {
    openGroups.value = { [value]: true };
  },
  { immediate: true },
);

function selectView(value: DashboardView) {
  view.value = value;
  if (value === "published") filter.value = "all";
  if (value === "in-progress") progressFilter.value = "all";
  openGroups.value = { [value]: true };
  emit("navigate");
}

function children(value: DashboardView): NavigationMenuItem[] {
  if (value === "published")
    return props.filters.map((option) => ({
      label: option.label,
      active: view.value === value && filter.value === option.value,
      onSelect: () => {
        filter.value = option.value;
        view.value = value;
        emit("navigate");
      },
    }));
  if (value === "in-progress")
    return props.progressFilters.map((option) => ({
      label: option.label,
      active: view.value === value && progressFilter.value === option.value,
      onSelect: () => {
        progressFilter.value = option.value;
        view.value = value;
        emit("navigate");
      },
    }));

  return [];
}

const collapsedItems = computed<NavigationMenuItem[]>(() =>
  props.views.map((option) => ({
    label: option.label,
    icon: option.icon,
    active: view.value === option.value,
    children:
      children(option.value).length > 1 ? children(option.value) : undefined,
    onSelect: () => selectView(option.value),
  })),
);
const libraryItems = computed<NavigationMenuItem[]>(() => [
  { label: "Library", type: "label" },
  {
    label: "Liked posters",
    icon: "i-lucide-star",
    to: "/liked",
    onSelect: () => emit("navigate"),
  },
  {
    label: "Organizations",
    icon: "i-lucide-building-2",
    to: "/organizations",
    onSelect: () => emit("navigate"),
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
    onSelect: () => emit("navigate"),
  },
]);
</script>

<template>
  <DashboardProfileSummary
    :collapsed="collapsed"
    @navigate="emit('navigate')"
  />

  <UNavigationMenu
    v-if="collapsed"
    :items="collapsedItems"
    collapsed
    orientation="vertical"
    tooltip
    popover
    aria-label="Your posters"
  />

  <nav v-else aria-label="Your posters" class="space-y-1">
    <p class="text-muted px-2.5 py-2 text-xs font-medium">Your posters</p>

    <section v-for="option in views" :key="option.value">
      <div class="flex items-center gap-1">
        <UButton
          :label="option.label"
          :icon="option.icon"
          :color="view === option.value ? 'primary' : 'neutral'"
          :variant="view === option.value ? 'soft' : 'ghost'"
          :aria-current="view === option.value ? 'page' : undefined"
          class="min-w-0 flex-1 justify-start"
          @click="selectView(option.value)"
        />

        <UButton
          v-if="children(option.value).length > 1"
          icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          size="xs"
          :class="{ 'rotate-180': openGroups[option.value] }"
          :aria-label="`${openGroups[option.value] ? 'Collapse' : 'Expand'} ${option.label}`"
          :aria-expanded="!!openGroups[option.value]"
          :aria-controls="`dashboard-group-${option.value}`"
          @click="openGroups[option.value] = !openGroups[option.value]"
        />
      </div>

      <UNavigationMenu
        v-if="children(option.value).length > 1 && openGroups[option.value]"
        :id="`dashboard-group-${option.value}`"
        :items="children(option.value)"
        orientation="vertical"
        class="border-default my-1 ml-4 border-l pl-2"
        :aria-label="`${option.label} categories`"
      />
    </section>
  </nav>

  <UNavigationMenu
    :collapsed="collapsed"
    :items="libraryItems"
    orientation="vertical"
    tooltip
    aria-label="Library"
  />
</template>
