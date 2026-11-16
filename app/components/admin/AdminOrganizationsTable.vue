<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import {
  organizationAvatarUrl,
  organizationPath,
} from "#shared/utils/organization";
import { parseApiError } from "~/utils/apiError";

import type { AdminOrganizationRow, Paginated } from "./types";

const emit = defineEmits<{
  changed: [];
}>();

const LIMIT = 25;

const toast = useToast();

const page = ref(1);
const searchInput = ref("");
const searchCommitted = ref("");
const visibilityFilter = ref("all");

const visibilityItems = [
  { label: "Any visibility", value: "all" },
  { label: "Public", value: "public" },
  { label: "Private", value: "private" },
  { label: "Hidden", value: "hidden" },
];

const filtersActive = computed(
  () =>
    searchCommitted.value !== "" ||
    searchInput.value !== "" ||
    visibilityFilter.value !== "all",
);

watch(visibilityFilter, () => {
  page.value = 1;
});

function submitSearch() {
  searchCommitted.value = searchInput.value;
  page.value = 1;
}

function clearFilters() {
  searchInput.value = "";
  searchCommitted.value = "";
  visibilityFilter.value = "all";
  page.value = 1;
}

const {
  data: organizationsData,
  status: organizationsStatus,
  refresh,
} = await useFetch<Paginated<AdminOrganizationRow>>(
  "/api/admin/organizations",
  {
    key: "admin-organizations",
    query: computed(() => ({
      page: page.value,
      limit: LIMIT,
      search: searchCommitted.value,
      visibility:
        visibilityFilter.value === "all" ? "" : visibilityFilter.value,
    })),
  },
);

const organizations = computed(() => organizationsData.value?.data ?? []);
const total = computed(() => organizationsData.value?.total ?? 0);
const highlightTerm = computed(() => searchCommitted.value.trim());

const columns: ColumnDef<AdminOrganizationRow>[] = [
  { accessorKey: "name", header: "Name" },
  { id: "owners", header: "Owners" },
  { id: "memberCount", accessorFn: (r) => r._count.members, header: "Members" },
  { id: "posterCount", accessorFn: (r) => r._count.posters, header: "Posters" },
  { id: "visibility", header: "Visibility" },
  { accessorKey: "created", header: "Created" },
  { id: "actions", header: "", enableSorting: false },
];

const moderateTarget = ref<AdminOrganizationRow | null>(null);
const moderateOpen = computed({
  get: () => moderateTarget.value !== null,
  set: (open) => {
    if (!open) moderateTarget.value = null;
  },
});
const moderateReason = ref("");
const moderating = ref(false);
const willHide = computed(() => !moderateTarget.value?.hiddenAt);

function openModerate(organization: AdminOrganizationRow) {
  moderateReason.value = "";
  moderateTarget.value = organization;
}

async function confirmModerate() {
  const organization = moderateTarget.value;
  const reason = moderateReason.value.trim();

  if (!organization || !reason || moderating.value) return;

  const hidden = willHide.value;

  moderating.value = true;

  try {
    await $fetch(`/api/admin/organizations/${organization.id}`, {
      method: "PATCH",
      body: { hidden, reason },
    });

    moderateTarget.value = null;
    await refresh();
    emit("changed");

    toast.add({
      title: hidden ? "Organization hidden" : "Organization restored",
      description: hidden
        ? `${organization.name} is no longer public. Its posters are not affected.`
        : `${organization.name} is back to its owner's visibility setting.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: hidden
        ? "Could not hide the organization"
        : "Could not restore the organization",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    moderating.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="searchInput"
        placeholder="Search by name or owner"
        icon="material-symbols:search"
        class="w-full sm:w-80"
        @keydown.enter="submitSearch"
      />

      <UButton size="sm" label="Search" @click="submitSearch" />

      <USelect
        v-model="visibilityFilter"
        :items="visibilityItems"
        class="w-44"
      />

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
        {{ total.toLocaleString() }}
        {{ total === 1 ? "organization" : "organizations" }}
      </span>
    </div>

    <p class="text-muted text-sm">
      An organization has no sign-in of its own and can't be an admin. Hiding
      one takes down its page and leaves its posters published.
    </p>

    <UiSpinner :loading="organizationsStatus === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable :data="organizations" :columns="columns">
          <template #name-cell="{ row }">
            <div class="flex max-w-xs items-center gap-2">
              <UAvatar
                :src="organizationAvatarUrl(row.original.profileId)"
                size="sm"
                class="shrink-0"
              />

              <span class="min-w-0 break-words whitespace-normal">
                <SearchHighlight
                  :text="row.original.name"
                  :term="highlightTerm"
                />
              </span>
            </div>
          </template>

          <template #owners-cell="{ row }">
            <div class="space-y-1">
              <span
                v-for="{ user } in row.original.members"
                :key="user.id"
                class="block text-sm"
              >
                <SearchHighlight
                  :text="`${user.givenName} ${user.familyName}`.trim()"
                  :term="highlightTerm"
                />

                <span class="text-muted block text-xs">
                  <SearchHighlight
                    :text="user.emailAddress"
                    :term="highlightTerm"
                  />
                </span>
              </span>
            </div>
          </template>

          <template #visibility-cell="{ row }">
            <UTooltip
              v-if="row.original.hiddenAt"
              :text="row.original.hiddenReason"
            >
              <UBadge
                color="error"
                variant="subtle"
                size="sm"
                icon="i-heroicons-eye-slash"
              >
                Hidden
              </UBadge>
            </UTooltip>

            <UBadge
              v-else
              :color="row.original.profilePublic ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ row.original.profilePublic ? "Public" : "Private" }}
            </UBadge>
          </template>

          <template #created-cell="{ row }">
            {{ formatDate(row.original.created) }}
          </template>

          <template #actions-cell="{ row }">
            <div class="flex items-center justify-end gap-2">
              <UButton
                :to="organizationPath(row.original.profileId)"
                target="_blank"
                size="xs"
                color="neutral"
                variant="outline"
                label="View"
              />

              <UButton
                size="xs"
                :color="row.original.hiddenAt ? 'neutral' : 'error'"
                variant="subtle"
                :label="row.original.hiddenAt ? 'Restore' : 'Hide'"
                @click="openModerate(row.original)"
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
      v-model:open="moderateOpen"
      :title="willHide ? 'Hide organization' : 'Restore organization'"
      :description="
        moderateTarget
          ? willHide
            ? `Take down the page for ${moderateTarget.name}. Its posters stay published.`
            : `Bring back the page for ${moderateTarget.name}, subject to its owner's visibility setting.`
          : ''
      "
    >
      <template #body>
        <UFormField
          label="Reason"
          :help="
            willHide
              ? 'Kept in the audit log and shown to its members.'
              : 'Kept in the audit log.'
          "
          required
        >
          <UTextarea
            v-model="moderateReason"
            :rows="3"
            :maxlength="1000"
            class="w-full"
          />
        </UFormField>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-3">
          <UButton
            color="neutral"
            variant="subtle"
            label="Cancel"
            @click="close"
          />

          <UButton
            :color="willHide ? 'error' : 'primary'"
            :label="willHide ? 'Hide organization' : 'Restore organization'"
            :disabled="!moderateReason.trim()"
            :loading="moderating"
            @click="confirmModerate"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
