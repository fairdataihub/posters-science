<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";

import type { AdminAuditLogRow, Paginated } from "./types";

const LIMIT = 25;

const page = ref(1);
const actionFilter = ref("all");

watch(actionFilter, () => {
  page.value = 1;
});

// The page refreshes this through refreshNuxtData("admin-audit-log") whenever
// an admin action adds an entry.
const { data: auditData, status: auditStatus } = await useFetch<
  Paginated<AdminAuditLogRow>
>("/api/admin/audit-log", {
  key: "admin-audit-log",
  query: computed(() => ({
    page: page.value,
    limit: LIMIT,
    action: actionFilter.value === "all" ? "" : actionFilter.value,
  })),
});

const auditLogs = computed(() => auditData.value?.data ?? []);
const total = computed(() => auditData.value?.total ?? 0);

const actionLabels: Record<string, string> = {
  DELETE_POSTER: "Deleted poster",
  TOMBSTONE_POSTER: "Retired poster",
  RESTORE_POSTER: "Restored poster",
  DELETE_USER: "Deleted user",
  UPDATE_USER_ROLE: "Updated role",
  UPDATE_MAINTENANCE: "Updated maintenance",
  RETRY_EXTRACTION_JOB: "Retried extraction",
};

const actionItems = [
  { label: "All actions", value: "all" },
  ...Object.entries(actionLabels).map(([value, label]) => ({ label, value })),
];

const columns: ColumnDef<AdminAuditLogRow>[] = [
  { id: "admin", accessorFn: (r) => r.adminUser.emailAddress, header: "Admin" },
  {
    id: "action",
    accessorFn: (r) => actionLabels[r.action] ?? r.action,
    header: "Action",
  },
  { accessorKey: "entityType", header: "Type" },
  { accessorKey: "entityId", header: "Entity ID" },
  { id: "details", header: "Details", enableSorting: false },
  { accessorKey: "created", header: "Date" },
];

function actionColor(action: string) {
  if (action.startsWith("DELETE")) return "error" as const;
  if (action === "UPDATE_MAINTENANCE") return "warning" as const;
  if (action.startsWith("UPDATE")) return "warning" as const;

  return "neutral" as const;
}

/**
 * Audit details are free-form JSON per action, so summarise the fields we know
 * and fall back to the raw object for anything else.
 */
function detailSummary(log: AdminAuditLogRow): string {
  const details = log.details;
  if (!details) return "";

  if (typeof details.reason === "string" && details.reason) {
    return details.reason;
  }

  if (log.action === "UPDATE_MAINTENANCE") {
    const state = details.enabled ? "paused" : "live";
    const message =
      typeof details.message === "string" && details.message
        ? `: ${details.message}`
        : "";

    return `Set to ${state}${message}`;
  }

  if (log.action === "RETRY_EXTRACTION_JOB") {
    return `Poster ${details.posterId}: ${details.previousStatus} to ${details.nextStatus}`;
  }

  if (typeof details.role === "string") {
    return `Role set to ${details.role}`;
  }

  return JSON.stringify(details);
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="actionFilter" :items="actionItems" class="w-56" />

      <UButton
        v-if="actionFilter !== 'all'"
        size="sm"
        color="neutral"
        variant="subtle"
        icon="material-symbols:close"
        label="Clear"
        @click="actionFilter = 'all'"
      />

      <span class="text-muted ml-auto text-sm">
        {{ total.toLocaleString() }} entries
      </span>
    </div>

    <UiSpinner :loading="auditStatus === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable :data="auditLogs" :columns="columns">
          <template #admin-cell="{ row }">
            <span class="text-sm">
              {{ row.original.adminUser.givenName }}
              {{ row.original.adminUser.familyName }}

              <span class="text-muted block text-xs">
                {{ row.original.adminUser.emailAddress }}
              </span>
            </span>
          </template>

          <template #action-cell="{ row }">
            <UBadge
              :color="actionColor(row.original.action)"
              variant="subtle"
              size="sm"
            >
              {{ actionLabels[row.original.action] ?? row.original.action }}
            </UBadge>
          </template>

          <template #entityType-cell="{ row }">
            <span class="text-muted text-xs">{{
              row.original.entityType
            }}</span>
          </template>

          <template #entityId-cell="{ row }">
            <span class="text-muted font-mono text-xs">
              {{ row.original.entityId }}
            </span>
          </template>

          <template #details-cell="{ row }">
            <UPopover v-if="detailSummary(row.original)" mode="hover">
              <span class="line-clamp-2 max-w-sm cursor-help text-sm">
                {{ detailSummary(row.original) }}
              </span>

              <template #content>
                <p
                  class="max-h-64 max-w-sm overflow-y-auto p-3 text-sm break-words whitespace-pre-wrap"
                >
                  {{ detailSummary(row.original) }}
                </p>
              </template>
            </UPopover>

            <span v-else class="text-muted text-xs">-</span>
          </template>

          <template #created-cell="{ row }">
            <span class="text-xs">{{
              formatDateTime(row.original.created)
            }}</span>
          </template>
        </UTable>
      </div>
    </UiSpinner>

    <div v-if="total > LIMIT" class="flex justify-center">
      <UPagination v-model:page="page" :total="total" :items-per-page="LIMIT" />
    </div>
  </div>
</template>
