<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { ColumnDef, SortingState } from "@tanstack/vue-table";

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

// Types

type StatsResponse = {
  totalUsers: number;
  posters: {
    total: number;
    draft: number;
    downloaded: number;
    published: number;
    tombstoned: number;
  };
};

type UserRow = {
  id: string;
  givenName: string;
  familyName: string;
  emailAddress: string;
  role: string;
  emailVerified: boolean;
  created: string;
  _count: { Poster: number };
};

type PosterRow = {
  id: number;
  title: string;
  status: string;
  tombstone: boolean;
  tombedReason: string;
  publishedAt: string | null;
  created: string;
  user: {
    id: string;
    givenName: string;
    familyName: string;
    emailAddress: string;
  };
  zenodoDepositions: { lastPublishedZenodoDoi: string | null } | null;
};

type Paginated<T> = { data: T[]; total: number; page: number; limit: number };

type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  created: string;
  adminUser: {
    id: string;
    givenName: string;
    familyName: string;
    emailAddress: string;
  };
};

// Stats

const toast = useToast();
const {
  data: stats,
  refresh: refreshStats,
  status: statsStatus,
} = await useFetch<StatsResponse>("/api/admin/stats");

// Users

const userSearchInput = ref("");
const userSearchCommitted = ref("");
const userPage = ref(1);
const USER_LIMIT = 25;
const userSorting = ref<SortingState>([]);

const UButton = resolveComponent("UButton");

function sortableHeader(label: string) {
  return ({
    column,
  }: {
    column: {
      getIsSorted: () => false | "asc" | "desc";
      toggleSorting: (desc?: boolean) => void;
    };
  }) => {
    const sorted = column.getIsSorted();

    return h(UButton, {
      color: "neutral",
      variant: "ghost",
      label,
      trailingIcon:
        sorted === "asc"
          ? "material-symbols:arrow-upward"
          : sorted === "desc"
            ? "material-symbols:arrow-downward"
            : "material-symbols:unfold-more",
      class: "-mx-2.5",
      onClick: () => column.toggleSorting(sorted === "asc"),
    });
  };
}

const userFiltersActive = computed(
  () => userSearchCommitted.value !== "" || userSearchInput.value !== "",
);

function submitUserSearch() {
  userSearchCommitted.value = userSearchInput.value;
  userPage.value = 1;
}

function clearUserSearch() {
  userSearchInput.value = "";
  userSearchCommitted.value = "";
  userPage.value = 1;
}

const {
  data: usersData,
  refresh: refreshUsers,
  status: usersStatus,
} = await useFetch<Paginated<UserRow>>("/api/admin/users", {
  query: computed(() => ({
    page: userPage.value,
    limit: USER_LIMIT,
    search: userSearchCommitted.value,
  })),
});

const users = computed(() => usersData.value?.data ?? []);
const userTotal = computed(() => usersData.value?.total ?? 0);

const userColumns: ColumnDef<UserRow>[] = [
  {
    id: "name",
    accessorFn: (r) => `${r.givenName} ${r.familyName}`,
    header: sortableHeader("Name"),
  },
  { accessorKey: "emailAddress", header: sortableHeader("Email") },
  { accessorKey: "role", header: sortableHeader("Role") },
  { accessorKey: "emailVerified", header: sortableHeader("Verified") },
  {
    id: "posterCount",
    accessorFn: (r) => r._count.Poster,
    header: sortableHeader("Posters"),
  },
  { accessorKey: "created", header: sortableHeader("Joined") },
  { id: "userActions", header: "", enableSorting: false },
];

async function toggleRole(user: UserRow) {
  const newRole = user.role === "admin" ? "user" : "admin";
  try {
    await $fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: { role: newRole },
    });
    toast.add({
      title: `${user.givenName} is now ${newRole}`,
      color: "success",
    });
    await Promise.all([refreshUsers(), refreshStats(), refreshAuditLog()]);
  } catch {
    toast.add({ title: "Failed to update role", color: "error" });
  }
}

const confirmDeleteUserId = ref<string | null>(null);

async function deleteUser() {
  const user = users.value.find((u) => u.id === confirmDeleteUserId.value);
  if (!user) return;
  try {
    await $fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    toast.add({ title: `User ${user.emailAddress} deleted`, color: "success" });
    confirmDeleteUserId.value = null;
    await Promise.all([refreshUsers(), refreshStats(), refreshAuditLog()]);
  } catch {
    toast.add({ title: "Failed to delete user", color: "error" });
  }
}

// Posters

const posterSearchInput = ref("");
const posterSearchCommitted = ref("");
const posterPage = ref(1);
const posterStatusFilter = ref("all");
const POSTER_LIMIT = 25;
const posterFiltersActive = computed(
  () =>
    posterSearchCommitted.value !== "" ||
    posterSearchInput.value !== "" ||
    posterStatusFilter.value !== "all",
);

watch(posterStatusFilter, () => {
  posterPage.value = 1;
});

function submitPosterSearch() {
  posterSearchCommitted.value = posterSearchInput.value;
  posterPage.value = 1;
}

function clearPosterSearch() {
  posterSearchInput.value = "";
  posterSearchCommitted.value = "";
  posterStatusFilter.value = "all";
  posterPage.value = 1;
}

const {
  data: postersData,
  refresh: refreshPosters,
  status: postersStatus,
} = await useFetch<Paginated<PosterRow>>("/api/admin/posters", {
  query: computed(() => ({
    page: posterPage.value,
    limit: POSTER_LIMIT,
    search: posterSearchCommitted.value,
    status: posterStatusFilter.value === "all" ? "" : posterStatusFilter.value,
  })),
});

const posters = computed(() => postersData.value?.data ?? []);
const posterTotal = computed(() => postersData.value?.total ?? 0);

const posterColumns: ColumnDef<PosterRow>[] = [
  { accessorKey: "title", header: "Title" },
  { id: "owner", accessorFn: (r) => r.user.emailAddress, header: "Owner" },
  { accessorKey: "status", header: "Status" },
  { id: "zenodoDoi", header: "Zenodo DOI", enableSorting: false },
  { accessorKey: "created", header: "Created" },
  { id: "posterActions", header: "", enableSorting: false },
];

const confirmDeletePosterId = ref<number | null>(null);
const tombstoneReason = ref("");
const isDeletingPoster = ref(false);
const restoringPosterId = ref<number | null>(null);

const posterToDelete = computed(
  () => posters.value.find((p) => p.id === confirmDeletePosterId.value) ?? null,
);

function closeDeletePosterModal() {
  confirmDeletePosterId.value = null;
  tombstoneReason.value = "";
}

async function deletePoster() {
  // Guard against a double click firing multiple DELETE requests before the
  // first one resolves and closes the modal.
  if (isDeletingPoster.value) return;

  const poster = posterToDelete.value;
  if (!poster) return;

  // Published posters are retired (tombstoned) with a required reason;
  // drafts and downloads are hard-deleted.
  const isPublished = poster.status === "published";
  if (isPublished && tombstoneReason.value.trim() === "") {
    toast.add({
      title: "A reason is required to retire this poster",
      color: "error",
    });

    return;
  }

  isDeletingPoster.value = true;
  try {
    await $fetch(`/api/admin/posters/${poster.id}`, {
      method: "DELETE",
      body: isPublished ? { reason: tombstoneReason.value.trim() } : undefined,
    });
    toast.add({
      title: `"${poster.title}" ${isPublished ? "retired" : "deleted"}`,
      color: "success",
    });
    closeDeletePosterModal();
    await Promise.all([refreshPosters(), refreshStats(), refreshAuditLog()]);
  } catch {
    toast.add({
      title: `Failed to ${isPublished ? "retire" : "delete"} poster`,
      color: "error",
    });
  } finally {
    isDeletingPoster.value = false;
  }
}

async function restorePoster(poster: PosterRow) {
  // Guard against a double click firing multiple restore requests.
  if (restoringPosterId.value !== null) return;

  restoringPosterId.value = poster.id;
  try {
    await $fetch(`/api/admin/posters/${poster.id}/restore`, { method: "POST" });
    toast.add({ title: `"${poster.title}" restored`, color: "success" });
    await Promise.all([refreshPosters(), refreshStats(), refreshAuditLog()]);
  } catch {
    toast.add({ title: "Failed to restore poster", color: "error" });
  } finally {
    restoringPosterId.value = null;
  }
}

// Audit Log

const auditPage = ref(1);
const AUDIT_LIMIT = 25;

const {
  data: auditData,
  status: auditStatus,
  refresh: refreshAuditLog,
} = await useFetch<Paginated<AuditLogRow>>("/api/admin/audit-log", {
  query: computed(() => ({ page: auditPage.value, limit: AUDIT_LIMIT })),
});

const auditLogs = computed(() => auditData.value?.data ?? []);
const auditTotal = computed(() => auditData.value?.total ?? 0);

const actionLabels: Record<string, string> = {
  DELETE_POSTER: "Deleted poster",
  TOMBSTONE_POSTER: "Retired poster",
  RESTORE_POSTER: "Restored poster",
  DELETE_USER: "Deleted user",
  UPDATE_USER_ROLE: "Updated role",
};

const auditColumns: ColumnDef<AuditLogRow>[] = [
  { id: "admin", accessorFn: (r) => r.adminUser.emailAddress, header: "Admin" },
  {
    id: "action",
    accessorFn: (r) => actionLabels[r.action] ?? r.action,
    header: "Action",
  },
  { accessorKey: "entityId", header: "Entity ID" },
  { id: "reason", header: "Reason", enableSorting: false },
  { accessorKey: "created", header: "Date" },
];

// Pulls the retire reason out of an audit entry's free-form details JSON.
function auditReason(log: AuditLogRow): string {
  const reason = log.details?.reason;

  return typeof reason === "string" ? reason : "";
}

// Helpers

const statusItems = [
  { label: "All statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Downloaded", value: "downloaded" },
  { label: "Published", value: "published" },
  { label: "Tombstoned", value: "tombstoned" },
];

function statusColor(s: string) {
  if (s === "published") return "success" as const;
  if (s === "downloaded") return "info" as const;

  return "neutral" as const;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const { siteEnv } = useRuntimeConfig().public;

function zenodoUrl(poster: PosterRow): string | null {
  const doi = poster.zenodoDepositions?.lastPublishedZenodoDoi;
  if (!doi) return null;
  const isSandboxDoi = doi.startsWith("10.5072/");
  const isSandboxEnv =
    siteEnv === "staging" || siteEnv === "development" || siteEnv === "dev";
  if (isSandboxDoi || isSandboxEnv) {
    return `https://sandbox.zenodo.org/records/${doi.split("/zenodo.")[1]}`;
  }

  return `https://doi.org/${doi}`;
}

const activeTab = ref("users");

const tabs = [
  { label: "Users", icon: "material-symbols:group", value: "users" },
  { label: "Posters", icon: "material-symbols:article", value: "posters" },
  { label: "Audit Log", icon: "material-symbols:history", value: "audit" },
];
</script>

<template>
  <UContainer class="py-8">
    <h1 class="mb-8 text-3xl font-bold">Admin Panel</h1>

    <!-- Stats cards -->
    <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UCard>
        <p class="text-muted text-sm">Total Users</p>

        <USpinner v-if="statsStatus === 'pending'" size="sm" class="mt-1" />

        <p v-else class="mt-1 text-2xl font-bold">
          {{ stats?.totalUsers ?? "-" }}
        </p>
      </UCard>

      <UCard>
        <p class="text-muted text-sm">Published Posters</p>

        <USpinner v-if="statsStatus === 'pending'" size="sm" class="mt-1" />

        <p v-else class="mt-1 text-2xl font-bold">
          {{ stats?.posters.published ?? "-" }}
        </p>
      </UCard>

      <UCard>
        <p class="text-muted text-sm">Tombstoned Posters</p>

        <USpinner v-if="statsStatus === 'pending'" size="sm" class="mt-1" />

        <p v-else class="mt-1 text-2xl font-bold">
          {{ stats?.posters.tombstoned ?? "-" }}
        </p>
      </UCard>

      <UCard>
        <p class="text-muted text-sm">Total Posters</p>

        <USpinner v-if="statsStatus === 'pending'" size="sm" class="mt-1" />

        <p v-else class="mt-1 text-2xl font-bold">
          {{ stats?.posters.total ?? "-" }}
        </p>
      </UCard>
    </div>

    <!-- Tabs -->
    <UTabs v-model="activeTab" :items="tabs" :content="false" class="w-full" />

    <!-- Users panel -->
    <div v-show="activeTab === 'users'" class="mt-4 space-y-4">
      <div
        class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-2">
          <UInput
            v-model="userSearchInput"
            placeholder="Search by name or email…"
            icon="material-symbols:search"
            class="w-full sm:w-96"
            @keydown.enter="submitUserSearch"
          />

          <UButton size="sm" label="Search" @click="submitUserSearch" />
        </div>

        <UButton
          v-if="userFiltersActive"
          size="sm"
          color="neutral"
          variant="subtle"
          icon="material-symbols:close"
          label="Clear"
          class="self-start sm:self-auto"
          @click="clearUserSearch"
        />
      </div>

      <div class="relative overflow-x-auto">
        <div
          v-if="usersStatus === 'pending'"
          class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 dark:bg-black/30"
        >
          <USpinner size="lg" />
        </div>

        <UTable
          v-model:sorting="userSorting"
          :data="users"
          :columns="userColumns"
        >
          <template #name-cell="{ row }">
            <div class="flex items-center gap-2">
              <UAvatar
                :src="`https://api.dicebear.com/9.x/shapes/svg?seed=${row.original.id}`"
                size="sm"
              />

              <span
                >{{ row.original.givenName }}
                {{ row.original.familyName }}</span
              >
            </div>
          </template>

          <template #role-cell="{ row }">
            <UBadge
              :color="row.original.role === 'admin' ? 'primary' : 'info'"
              variant="subtle"
              size="sm"
            >
              {{ row.original.role }}
            </UBadge>
          </template>

          <template #emailVerified-cell="{ row }">
            <Icon
              :name="
                row.original.emailVerified
                  ? 'material-symbols:check-circle'
                  : 'material-symbols:cancel'
              "
              :class="
                row.original.emailVerified
                  ? 'text-success-500'
                  : 'text-error-500'
              "
              size="18"
            />
          </template>

          <template #created-cell="{ row }">
            {{ formatDate(row.original.created) }}
          </template>

          <template #userActions-cell="{ row }">
            <div class="flex items-center justify-end gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :label="row.original.role === 'admin' ? 'Demote' : 'Make Admin'"
                @click="toggleRole(row.original)"
              />

              <UButton
                size="xs"
                color="error"
                variant="outline"
                icon="material-symbols:delete"
                @click="confirmDeleteUserId = row.original.id"
              />
            </div>
          </template>
        </UTable>
      </div>

      <div v-if="userTotal > USER_LIMIT" class="flex justify-center">
        <UPagination
          v-model:page="userPage"
          :total="userTotal"
          :items-per-page="USER_LIMIT"
        />
      </div>
    </div>

    <!-- Posters panel -->
    <div v-show="activeTab === 'posters'" class="mt-4 space-y-4">
      <div
        class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-center gap-2">
          <UInput
            v-model="posterSearchInput"
            placeholder="Search by title or owner email…"
            icon="material-symbols:search"
            class="w-full sm:w-96"
            @keydown.enter="submitPosterSearch"
          />

          <UButton size="sm" label="Search" @click="submitPosterSearch" />
        </div>

        <div class="flex items-center gap-2">
          <USelect
            v-model="posterStatusFilter"
            :items="statusItems"
            class="w-full sm:w-44"
          />

          <UButton
            v-if="posterFiltersActive"
            size="sm"
            color="neutral"
            variant="subtle"
            icon="material-symbols:close"
            label="Clear"
            @click="clearPosterSearch"
          />
        </div>
      </div>

      <div class="relative overflow-x-auto">
        <div
          v-if="postersStatus === 'pending'"
          class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 dark:bg-black/30"
        >
          <USpinner size="lg" />
        </div>

        <UTable :data="posters" :columns="posterColumns">
          <template #title-cell="{ row }">
            <span class="line-clamp-1 max-w-xs font-medium">{{
              row.original.title
            }}</span>
          </template>

          <template #owner-cell="{ row }">
            <span class="text-sm">
              {{ row.original.user.givenName }}
              {{ row.original.user.familyName }}
              <span class="text-muted block text-xs">{{
                row.original.user.emailAddress
              }}</span>
            </span>
          </template>

          <template #status-cell="{ row }">
            <UBadge
              v-if="row.original.tombstone"
              color="warning"
              variant="subtle"
              size="sm"
            >
              Tombstoned
            </UBadge>

            <UBadge
              v-else
              :color="statusColor(row.original.status)"
              variant="subtle"
              size="sm"
            >
              {{ row.original.status }}
            </UBadge>
          </template>

          <template #zenodoDoi-cell="{ row }">
            <a
              v-if="zenodoUrl(row.original)"
              :href="zenodoUrl(row.original)!"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary truncate text-xs hover:underline"
            >
              {{ row.original.zenodoDepositions?.lastPublishedZenodoDoi }}
            </a>

            <span v-else class="text-muted text-xs">-</span>
          </template>

          <template #created-cell="{ row }">
            {{ formatDate(row.original.created) }}
          </template>

          <template #posterActions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                v-if="row.original.tombstone"
                size="xs"
                color="neutral"
                variant="outline"
                icon="material-symbols:restore-from-trash"
                label="Restore"
                :loading="restoringPosterId === row.original.id"
                :disabled="restoringPosterId !== null"
                @click="restorePoster(row.original)"
              />

              <UButton
                v-else
                size="xs"
                :color="
                  row.original.status === 'published' ? 'warning' : 'error'
                "
                variant="outline"
                :icon="
                  row.original.status === 'published'
                    ? 'material-symbols:archive'
                    : 'material-symbols:delete'
                "
                @click="confirmDeletePosterId = row.original.id"
              />
            </div>
          </template>
        </UTable>
      </div>

      <div v-if="posterTotal > POSTER_LIMIT" class="flex justify-center">
        <UPagination
          v-model:page="posterPage"
          :total="posterTotal"
          :items-per-page="POSTER_LIMIT"
        />
      </div>
    </div>

    <!-- Audit Log panel -->
    <div v-show="activeTab === 'audit'" class="mt-4 space-y-4">
      <div class="relative overflow-x-auto">
        <div
          v-if="auditStatus === 'pending'"
          class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/50 dark:bg-black/30"
        >
          <USpinner size="lg" />
        </div>

        <UTable :data="auditLogs" :columns="auditColumns">
          <template #admin-cell="{ row }">
            <span class="text-sm">
              {{ row.original.adminUser.givenName }}
              {{ row.original.adminUser.familyName }}
              <span class="text-muted block text-xs">{{
                row.original.adminUser.emailAddress
              }}</span>
            </span>
          </template>

          <template #action-cell="{ row }">
            <UBadge
              :color="
                row.original.action.startsWith('DELETE')
                  ? 'error'
                  : row.original.action.startsWith('UPDATE')
                    ? 'warning'
                    : 'neutral'
              "
              variant="subtle"
              size="sm"
            >
              {{ actionLabels[row.original.action] ?? row.original.action }}
            </UBadge>
          </template>

          <template #entityId-cell="{ row }">
            <span class="text-muted font-mono text-xs">{{
              row.original.entityId
            }}</span>
          </template>

          <template #reason-cell="{ row }">
            <UPopover
              v-if="
                row.original.action === 'TOMBSTONE_POSTER' &&
                auditReason(row.original)
              "
              mode="hover"
            >
              <span class="line-clamp-2 max-w-xs cursor-help text-sm">
                {{ auditReason(row.original) }}
              </span>

              <template #content>
                <p
                  class="max-h-64 max-w-sm overflow-y-auto p-3 text-sm break-words whitespace-pre-wrap"
                >
                  {{ auditReason(row.original) }}
                </p>
              </template>
            </UPopover>

            <span v-else class="text-muted text-xs">-</span>
          </template>

          <template #created-cell="{ row }">
            {{ formatDate(row.original.created) }}
          </template>
        </UTable>
      </div>

      <div v-if="auditTotal > AUDIT_LIMIT" class="flex justify-center">
        <UPagination
          v-model:page="auditPage"
          :total="auditTotal"
          :items-per-page="AUDIT_LIMIT"
        />
      </div>
    </div>

    <!-- Delete user modal -->
    <UModal
      :open="confirmDeleteUserId !== null"
      title="Delete User"
      description="This will permanently delete the user and all their data. This cannot be undone."
      @update:open="
        (v) => {
          if (!v) confirmDeleteUserId = null;
        }
      "
    >
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Cancel"
            @click="confirmDeleteUserId = null"
          />

          <UButton color="error" label="Delete" @click="deleteUser" />
        </div>
      </template>
    </UModal>

    <!-- Delete / retire poster modal -->
    <UModal
      :open="confirmDeletePosterId !== null"
      :title="
        posterToDelete?.status === 'published'
          ? 'Retire Poster'
          : 'Delete Poster'
      "
      :description="
        posterToDelete?.status === 'published'
          ? 'This hides the poster from public view but preserves the record. A reason is required, and it can be restored later.'
          : 'This will permanently delete the poster and all associated metadata. This cannot be undone.'
      "
      @update:open="
        (v) => {
          if (!v) closeDeletePosterModal();
        }
      "
    >
      <template v-if="posterToDelete?.status === 'published'" #body>
        <UFormField label="Reason for retiring" required>
          <UTextarea
            v-model="tombstoneReason"
            :rows="3"
            placeholder="Explain why this poster is being retired"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Cancel"
            @click="closeDeletePosterModal"
          />

          <UButton
            color="error"
            :label="
              posterToDelete?.status === 'published' ? 'Retire' : 'Delete'
            "
            :loading="isDeletingPoster"
            :disabled="
              isDeletingPoster ||
              (posterToDelete?.status === 'published' &&
                tombstoneReason.trim() === '')
            "
            @click="deletePoster"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
