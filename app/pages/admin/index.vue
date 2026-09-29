<script setup lang="ts">
import type {
  AdminStats,
  AdminView,
  ExtractionFilters,
  FilterPreset,
  PosterFilters,
  UserFilters,
} from "~/components/admin/types";

definePageMeta({
  middleware: ["admin"],
  layout: "default",
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Admin - Posters.science")}&description=${encodeURIComponent("Administrative dashboard for managing Posters.science")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Admin - Posters.science",
  description: "Administrative dashboard for managing Posters.science.",
  ogTitle: "Admin - Posters.science",
  ogDescription: "Administrative dashboard for managing Posters.science.",
  ogImage,
});

const {
  data: stats,
  refresh: refreshStats,
  status: statsStatus,
} = await useFetch<AdminStats>("/api/admin/stats");

const activeTab = ref("posters");

const tabs = [
  { label: "Posters", icon: "material-symbols:article", value: "posters" },
  { label: "Users", icon: "material-symbols:group", value: "users" },
  {
    label: "Extraction",
    icon: "material-symbols:conveyor-belt",
    value: "extraction",
  },
  {
    label: "Maintenance",
    icon: "material-symbols:build",
    value: "maintenance",
  },
  { label: "Audit Log", icon: "material-symbols:history", value: "audit" },
];

const detailPosterId = ref<number | null>(null);

// Clicking a stat tile opens its tab and filters that table to match the tile.
// The token bumps on every click so the same tile can be clicked twice.
const posterPreset = ref<FilterPreset<PosterFilters> | null>(null);
const extractionPreset = ref<FilterPreset<ExtractionFilters> | null>(null);
const userPreset = ref<FilterPreset<UserFilters> | null>(null);

let presetToken = 0;

function selectView(view: AdminView) {
  activeTab.value = view.tab;
  presetToken += 1;

  if (view.posters) {
    posterPreset.value = { token: presetToken, filters: view.posters };
  }

  if (view.extraction) {
    extractionPreset.value = { token: presetToken, filters: view.extraction };
  }

  if (view.users) {
    userPreset.value = { token: presetToken, filters: view.users };
  }
}

// Any mutating action can add an audit entry and shift the counters. The panel
// that made the change refetches itself, so this covers the shared views.
async function onChanged() {
  await Promise.all([refreshStats(), refreshNuxtData("admin-audit-log")]);
}
</script>

<template>
  <div class="w-full px-4 py-8 sm:px-6 lg:px-8">
    <h1 class="mb-6 text-3xl font-bold">Admin Panel</h1>

    <AdminStatsCards
      :stats="stats"
      :pending="statsStatus === 'pending'"
      class="mb-8"
      @select-view="selectView"
    />

    <UTabs v-model="activeTab" :items="tabs" :content="false" class="w-full" />

    <div class="mt-4">
      <div v-show="activeTab === 'posters'">
        <AdminPostersTable
          :preset="posterPreset"
          @changed="onChanged"
          @open-detail="detailPosterId = $event"
        />
      </div>

      <div v-show="activeTab === 'users'">
        <AdminUsersTable :preset="userPreset" @changed="onChanged" />
      </div>

      <div v-show="activeTab === 'extraction'">
        <AdminExtractionJobs :preset="extractionPreset" @changed="onChanged" />
      </div>

      <div v-show="activeTab === 'maintenance'">
        <AdminMaintenancePanel @changed="onChanged" />
      </div>

      <div v-show="activeTab === 'audit'">
        <AdminAuditLog />
      </div>
    </div>

    <AdminPosterDetail
      :poster-id="detailPosterId"
      @close="detailPosterId = null"
    />
  </div>
</template>
