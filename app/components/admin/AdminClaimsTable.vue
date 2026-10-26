<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import { parseApiError } from "~/utils/apiError";

import type { AdminClaimRow, Paginated } from "./types";

const emit = defineEmits<{
  changed: [];
}>();

const LIMIT = 25;

const toast = useToast();

const page = ref(1);
const searchInput = ref("");
const searchCommitted = ref("");

function submitSearch() {
  searchCommitted.value = searchInput.value;
  page.value = 1;
}

function clearSearch() {
  searchInput.value = "";
  searchCommitted.value = "";
  page.value = 1;
}

const {
  data: claimsData,
  status: claimsStatus,
  refresh,
} = await useFetch<Paginated<AdminClaimRow>>("/api/admin/claims", {
  key: "admin-claims",
  query: computed(() => ({
    page: page.value,
    limit: LIMIT,
    q: searchCommitted.value,
  })),
});

const claims = computed(() => claimsData.value?.data ?? []);
const total = computed(() => claimsData.value?.total ?? 0);
const highlightTerm = computed(() => searchCommitted.value.trim());

const columns: ColumnDef<AdminClaimRow>[] = [
  { id: "poster", header: "Poster" },
  { id: "claimant", header: "Claimant" },
  { accessorKey: "created", header: "Claimed" },
  { id: "actions", header: "", enableSorting: false },
];

const revokeTarget = ref<AdminClaimRow | null>(null);
const revokeOpen = computed({
  get: () => revokeTarget.value !== null,
  set: (open) => {
    if (!open) revokeTarget.value = null;
  },
});
const revokeReason = ref("");
const revoking = ref(false);

function openRevoke(claim: AdminClaimRow) {
  revokeReason.value = "";
  revokeTarget.value = claim;
}

async function confirmRevoke() {
  const claim = revokeTarget.value;
  const reason = revokeReason.value.trim();

  if (!claim || !reason || revoking.value) return;

  revoking.value = true;

  try {
    await $fetch(`/api/admin/claims/${claim.id}`, {
      method: "DELETE",
      body: { reason },
    });

    revokeTarget.value = null;
    await refresh();
    emit("changed");

    toast.add({
      title: "Claim revoked",
      description: `${claim.user.emailAddress} is no longer an author of poster #${claim.posterId}.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not revoke the claim",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    revoking.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-model="searchInput"
        placeholder="Search by poster id, title or claimant"
        icon="material-symbols:search"
        class="w-full sm:w-96"
        @keydown.enter="submitSearch"
      />

      <UButton size="sm" label="Search" @click="submitSearch" />

      <UButton
        v-if="searchCommitted || searchInput"
        size="sm"
        color="neutral"
        variant="subtle"
        icon="material-symbols:close"
        label="Clear"
        @click="clearSearch"
      />

      <span class="text-muted ml-auto text-sm">
        {{ total.toLocaleString() }} claims
      </span>
    </div>

    <p class="text-muted text-sm">
      Claims are approved as soon as they are made, without any checks. Revoke
      one that isn't genuine.
    </p>

    <UiSpinner :loading="claimsStatus === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable :data="claims" :columns="columns">
          <template #poster-cell="{ row }">
            <div class="max-w-md">
              <NuxtLink
                :to="`/discover/${row.original.posterId}`"
                target="_blank"
                class="line-clamp-2 text-sm font-medium hover:underline"
              >
                <SearchHighlight
                  :text="row.original.poster.title"
                  :term="highlightTerm"
                />
              </NuxtLink>

              <span class="text-muted flex items-center gap-2 text-xs">
                <span class="font-mono">
                  #<SearchHighlight
                    :text="row.original.posterId"
                    :term="highlightTerm"
                  />
                </span>

                <UBadge
                  v-if="row.original.poster.tombstone"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Retired
                </UBadge>
              </span>
            </div>
          </template>

          <template #claimant-cell="{ row }">
            <span class="text-sm">
              <SearchHighlight
                :text="
                  `${row.original.user.givenName} ${row.original.user.familyName}`.trim()
                "
                :term="highlightTerm"
              />

              <span class="text-muted block text-xs">
                <SearchHighlight
                  :text="row.original.user.emailAddress"
                  :term="highlightTerm"
                />
              </span>
            </span>
          </template>

          <template #created-cell="{ row }">
            <span class="text-xs">{{
              formatDateTime(row.original.created)
            }}</span>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              size="xs"
              color="error"
              variant="subtle"
              icon="i-lucide-user-x"
              label="Revoke"
              @click="openRevoke(row.original)"
            />
          </template>
        </UTable>
      </div>
    </UiSpinner>

    <div v-if="total > LIMIT" class="flex justify-center">
      <UPagination v-model:page="page" :total="total" :items-per-page="LIMIT" />
    </div>

    <UModal
      v-model:open="revokeOpen"
      title="Revoke claim"
      :description="
        revokeTarget
          ? `Remove ${revokeTarget.user.emailAddress}'s claim on poster #${revokeTarget.posterId}.`
          : ''
      "
    >
      <template #body>
        <UFormField
          label="Reason"
          help="Kept in the audit log. The claimant is not notified."
          required
        >
          <UTextarea
            v-model="revokeReason"
            placeholder="e.g. Reported by the author, claimant is not on the poster"
            :rows="3"
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
            color="error"
            label="Revoke claim"
            :disabled="!revokeReason.trim()"
            :loading="revoking"
            @click="confirmRevoke"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
