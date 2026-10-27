<script setup lang="ts">
import type { AdminStats, AdminView } from "./types";

defineProps<{
  stats: AdminStats | null;
  pending: boolean;
}>();

const emit = defineEmits<{ (e: "select-view", view: AdminView): void }>();

type Tile = {
  label: string;
  value: (stats: AdminStats) => number;
  hint?: (stats: AdminStats) => string;
  /** Which tab to open, and the filters that make the table match this number. */
  view: AdminView;
  tone?: "default" | "warning" | "error";
};

const tiles: Tile[] = [
  {
    label: "Total users",
    value: (s) => s.totalUsers,
    hint: (s) => `${s.newUsersLast30Days} in the last 30 days`,
    view: { tab: "users", users: {} },
  },
  {
    label: "Total posters",
    value: (s) => s.posters.total,
    hint: (s) => `${s.newPostersLast30Days} in the last 30 days`,
    view: { tab: "posters", posters: {} },
  },
  {
    label: "Published",
    value: (s) => s.posters.published,
    hint: (s) => `${s.zenodoPublished} archived on Zenodo`,
    view: { tab: "posters", posters: { status: "published" } },
  },
  {
    label: "With a DOI",
    value: (s) => s.postersWithDoi,
    hint: (s) => `${s.posters.total - s.postersWithDoi} still missing one`,
    view: { tab: "posters", posters: { doi: "has" } },
  },
  {
    label: "Jobs in flight",
    value: (s) => s.jobs.pending,
    hint: () => "Pending or processing",
    view: { tab: "extraction", extraction: { status: "in-flight" } },
  },
  {
    label: "Failed jobs",
    value: (s) => s.jobs.failed,
    hint: () => "Need a retry",
    view: { tab: "extraction", extraction: { status: "failed" } },
    tone: "error",
  },
  {
    label: "Tombstoned",
    value: (s) => s.posters.tombstoned,
    hint: () => "Retired from public view",
    view: { tab: "posters", posters: { status: "tombstoned" } },
    tone: "warning",
  },
  {
    label: "Unverified emails",
    value: (s) => s.unverifiedUsers,
    hint: (s) => `${s.adminUsers} admins`,
    view: { tab: "users", users: { verified: "false" } },
  },
];

function toneClass(tile: Tile, stats: AdminStats | null) {
  if (!stats || !tile.tone || tile.tone === "default") return "";
  if (tile.value(stats) === 0) return "";

  return tile.tone === "error" ? "text-error-500" : "text-warning-500";
}
</script>

<template>
  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-8">
    <UCard
      v-for="tile in tiles"
      :key="tile.label"
      class="cursor-pointer transition-shadow hover:shadow-md"
      role="button"
      tabindex="0"
      @click="emit('select-view', tile.view)"
      @keydown.enter="emit('select-view', tile.view)"
      @keydown.space.prevent="emit('select-view', tile.view)"
    >
      <p class="text-muted text-xs">{{ tile.label }}</p>

      <USkeleton v-if="pending || !stats" class="mt-2 h-7 w-12" />

      <template v-else>
        <p class="mt-1 text-2xl font-bold" :class="toneClass(tile, stats)">
          {{ tile.value(stats).toLocaleString() }}
        </p>

        <p v-if="tile.hint" class="text-muted mt-0.5 text-xs">
          {{ tile.hint(stats) }}
        </p>
      </template>
    </UCard>
  </div>
</template>
