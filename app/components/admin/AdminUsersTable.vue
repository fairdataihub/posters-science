<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { ColumnDef, SortingState } from "@tanstack/vue-table";

import { personNameWords } from "#shared/utils/adminSearch";

import type {
  AdminUserRow,
  FilterPreset,
  Paginated,
  UserFilters,
} from "./types";

const props = defineProps<{
  preset?: FilterPreset<UserFilters> | null;
}>();

const emit = defineEmits<{ (e: "changed"): void }>();

const toast = useToast();
const UButton = resolveComponent("UButton");

const LIMIT = 25;

const searchInput = ref("");
const searchCommitted = ref("");
const page = ref(1);
const roleFilter = ref("all");
const verifiedFilter = ref("all");
const sorting = ref<SortingState>([]);

const filtersActive = computed(
  () =>
    searchCommitted.value !== "" ||
    searchInput.value !== "" ||
    roleFilter.value !== "all" ||
    verifiedFilter.value !== "all",
);

watch([roleFilter, verifiedFilter], () => {
  page.value = 1;
});

function submitSearch() {
  searchCommitted.value = searchInput.value;
  page.value = 1;
}

function clearFilters() {
  searchInput.value = "";
  searchCommitted.value = "";
  roleFilter.value = "all";
  verifiedFilter.value = "all";
  page.value = 1;
}

// A stat tile was clicked. Start from a clean slate so the table shows exactly
// the number on the tile.
watch(
  () => props.preset?.token,
  () => {
    const filters = props.preset?.filters;
    if (!filters) return;

    clearFilters();
    if (filters.role) roleFilter.value = filters.role;
    if (filters.verified) verifiedFilter.value = filters.verified;
  },
);

const {
  data: usersData,
  refresh: refreshUsers,
  status: usersStatus,
} = await useFetch<Paginated<AdminUserRow>>("/api/admin/users", {
  key: "admin-users",
  query: computed(() => ({
    page: page.value,
    limit: LIMIT,
    search: searchCommitted.value,
    role: roleFilter.value === "all" ? "" : roleFilter.value,
    verified: verifiedFilter.value === "all" ? "" : verifiedFilter.value,
  })),
});

const users = computed(() => usersData.value?.data ?? []);

const highlightTerm = computed(() => searchCommitted.value.trim());

// A name matches word by word ("Doe Jane" finds Jane Doe), so mark each word.
const nameHighlightTerms = computed(() => [
  highlightTerm.value,
  ...personNameWords(highlightTerm.value),
]);
const total = computed(() => usersData.value?.total ?? 0);

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

const roleItems = [
  { label: "All roles", value: "all" },
  { label: "Admins", value: "admin" },
  { label: "Users", value: "user" },
];

const verifiedItems = [
  { label: "Any email state", value: "all" },
  { label: "Verified", value: "true" },
  { label: "Unverified", value: "false" },
];

const columns: ColumnDef<AdminUserRow>[] = [
  {
    id: "name",
    accessorFn: (r) => `${r.givenName} ${r.familyName}`,
    header: sortableHeader("Name"),
  },
  { accessorKey: "emailAddress", header: sortableHeader("Email") },
  { id: "userId", header: "User ID", enableSorting: false },
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

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ title: `${label} copied`, color: "success" });
  } catch {
    toast.add({ title: `Could not copy ${label}`, color: "error" });
  }
}

async function toggleRole(user: AdminUserRow) {
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
    await refreshUsers();
    emit("changed");
  } catch {
    toast.add({ title: "Failed to update role", color: "error" });
  }
}

const confirmDeleteUserId = ref<string | null>(null);
const isDeletingUser = ref(false);

async function deleteUser() {
  if (isDeletingUser.value) return;

  const user = users.value.find((u) => u.id === confirmDeleteUserId.value);
  if (!user) return;

  isDeletingUser.value = true;

  try {
    await $fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    toast.add({ title: `User ${user.emailAddress} deleted`, color: "success" });
    confirmDeleteUserId.value = null;
    await refreshUsers();
    emit("changed");
  } catch (error) {
    const { statusMessage } = parseApiError(error);

    toast.add({
      title: "Failed to delete user",
      description: statusMessage,
      color: "error",
    });
  } finally {
    isDeletingUser.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="searchInput"
        placeholder="Search by name or email"
        icon="material-symbols:search"
        class="w-full sm:w-80"
        @keydown.enter="submitSearch"
      />

      <UButton size="sm" label="Search" @click="submitSearch" />

      <USelect v-model="roleFilter" :items="roleItems" class="w-40" />

      <USelect v-model="verifiedFilter" :items="verifiedItems" class="w-44" />

      <UButton
        v-if="filtersActive"
        size="sm"
        color="neutral"
        variant="subtle"
        icon="material-symbols:close"
        label="Clear"
        @click="clearFilters"
      />

      <span class="text-muted ml-auto text-sm">
        {{ total.toLocaleString() }} users
      </span>
    </div>

    <UiSpinner :loading="usersStatus === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable v-model:sorting="sorting" :data="users" :columns="columns">
          <template #name-cell="{ row }">
            <div class="flex items-center gap-2">
              <UAvatar
                :src="`https://api.dicebear.com/9.x/shapes/svg?seed=${row.original.id}`"
                size="sm"
              />

              <span>
                <SearchHighlight
                  :text="`${row.original.givenName} ${row.original.familyName}`"
                  :term="nameHighlightTerms"
                />
              </span>
            </div>
          </template>

          <template #emailAddress-cell="{ row }">
            <SearchHighlight
              :text="row.original.emailAddress"
              :term="highlightTerm"
            />
          </template>

          <template #userId-cell="{ row }">
            <div class="flex items-center gap-1">
              <span class="text-muted font-mono text-xs">
                {{ row.original.id }}
              </span>

              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="material-symbols:content-copy-outline"
                aria-label="Copy user id"
                @click="copyToClipboard(row.original.id, 'User id')"
              />
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
                aria-label="Delete user"
                @click="confirmDeleteUserId = row.original.id"
              />
            </div>
          </template>
        </UTable>
      </div>
    </UiSpinner>

    <div v-if="total > LIMIT" class="flex justify-center">
      <UPagination v-model:page="page" :total="total" :items-per-page="LIMIT" />
    </div>

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

          <UButton
            color="error"
            label="Delete"
            :loading="isDeletingUser"
            :disabled="isDeletingUser"
            @click="deleteUser"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
