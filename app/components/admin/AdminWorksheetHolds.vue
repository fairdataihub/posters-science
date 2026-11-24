<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import { parseApiError } from "~/utils/apiError";

import type { HeldPoster } from "#shared/types/bulkWorksheetHold";

/**
 * Batches waiting on us: an unsupported platform or a refused worksheet hold
 * the whole batch on step 1; posters with no worksheet row hold only those.
 */
type HoldKind =
  | "unsupported_platform"
  | "worksheet_error"
  | "posters_unmatched";

type WorksheetHold = {
  jobId: string;
  name: string;
  heldAt: string;
  batchHeld: boolean;
  kind: HoldKind;
  platform: string | null;
  problems: string[];
  files: string[];
  posters: HeldPoster[];
  user: { givenName: string; familyName: string; emailAddress: string };
};

const emit = defineEmits<{
  changed: [];
}>();

const HOLD_DAYS = 7;

const KINDS: Record<
  HoldKind,
  {
    label: string;
    color: "info" | "error" | "warning";
    icon: string;
    todo: string;
  }
> = {
  unsupported_platform: {
    label: "Unsupported platform",
    color: "info",
    icon: "i-lucide-puzzle",
    todo: "Look into supporting this platform, then release whether or not you add it. Whole batch waits on step 1.",
  },
  worksheet_error: {
    label: "Worksheet problem",
    color: "error",
    icon: "i-lucide-file-warning",
    todo: "Fix the worksheet (or the reader), then release. Whole batch waits on step 1.",
  },
  posters_unmatched: {
    label: "Posters without a row",
    color: "warning",
    icon: "i-lucide-file-question",
    todo: "Only these posters wait; the rest can be published.",
  },
};

const toast = useToast();

const { data, status, refresh } = await useFetch<{ data: WorksheetHold[] }>(
  "/api/admin/worksheet-holds",
  { key: "admin-worksheet-holds" },
);

const holds = computed(() => data.value?.data ?? []);

const columns: ColumnDef<WorksheetHold>[] = [
  { id: "batch", header: "Batch" },
  { id: "organizer", header: "Organizer" },
  { id: "held", header: "Held" },
  { id: "kind", header: "Why" },
  { id: "files", header: "Files" },
  { id: "actions", header: "", enableSorting: false },
];

/** Day N of the 7, starting at day 1 on the day it was sent. */
function holdDay(heldAt: string) {
  return Math.floor((Date.now() - new Date(heldAt).getTime()) / 86_400_000) + 1;
}

function dueDate(heldAt: string) {
  return new Date(
    new Date(heldAt).getTime() + HOLD_DAYS * 86_400_000,
  ).toLocaleDateString();
}

const releaseTarget = ref<WorksheetHold | null>(null);
const releaseOpen = computed({
  get: () => releaseTarget.value !== null,
  set: (open) => {
    if (!open) releaseTarget.value = null;
  },
});
const releasing = ref(false);

async function confirmRelease() {
  const hold = releaseTarget.value;
  if (!hold || releasing.value) return;

  releasing.value = true;
  try {
    await $fetch(`/api/admin/worksheet-holds/${hold.jobId}/release`, {
      method: "POST",
    });
    releaseTarget.value = null;
    await refresh();
    emit("changed");
    toast.add({
      title: "Hold released",
      description:
        hold.kind === "unsupported_platform"
          ? `${hold.name} can continue. Email ${hold.user.emailAddress} whether their platform is supported now.`
          : `${hold.name} can continue. Email ${hold.user.emailAddress} what's ready.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not release the hold",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    releasing.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        size="sm"
        color="neutral"
        variant="subtle"
        icon="material-symbols:refresh"
        label="Refresh"
        @click="refresh()"
      />

      <span class="text-muted ml-auto text-sm">
        {{ holds.length.toLocaleString() }}
        {{ holds.length === 1 ? "hold" : "holds" }}
      </span>
    </div>

    <p class="text-muted text-sm">
      Batches waiting on us, oldest first. Download the files, look into it,
      email the organizer, then release the hold.
    </p>

    <UiSpinner :loading="status === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable
          :data="holds"
          :columns="columns"
          :ui="{
            th: 'text-center',
            td: 'whitespace-normal text-center align-top',
          }"
        >
          <template #empty>
            <p class="text-muted py-6 text-center text-sm">
              No batches on hold.
            </p>
          </template>

          <template #batch-cell="{ row }">
            <span
              class="mx-auto line-clamp-3 block max-w-60 text-sm font-medium [overflow-wrap:anywhere]"
              :title="row.original.name"
            >
              {{ row.original.name }}
            </span>

            <span
              class="text-muted mx-auto block max-w-60 truncate font-mono text-xs"
              :title="row.original.jobId"
            >
              {{ row.original.jobId }}
            </span>
          </template>

          <template #organizer-cell="{ row }">
            <span
              class="mx-auto block max-w-56 truncate text-sm"
              :title="
                `${row.original.user.givenName} ${row.original.user.familyName}`.trim()
              "
            >
              {{
                `${row.original.user.givenName} ${row.original.user.familyName}`.trim()
              }}
            </span>

            <span
              class="text-muted mx-auto block max-w-56 truncate text-xs"
              :title="row.original.user.emailAddress"
            >
              {{ row.original.user.emailAddress }}
            </span>
          </template>

          <template #held-cell="{ row }">
            <UBadge
              :color="
                holdDay(row.original.heldAt) > HOLD_DAYS ? 'error' : 'warning'
              "
              variant="subtle"
              size="sm"
              class="whitespace-nowrap"
            >
              Day {{ holdDay(row.original.heldAt) }} of {{ HOLD_DAYS }}
            </UBadge>

            <span class="text-muted block text-xs">
              Email by {{ dueDate(row.original.heldAt) }}
            </span>
          </template>

          <template #kind-cell="{ row }">
            <UBadge
              :color="KINDS[row.original.kind].color"
              :icon="KINDS[row.original.kind].icon"
              variant="subtle"
              size="sm"
              :label="KINDS[row.original.kind].label"
            />

            <span
              v-if="row.original.platform"
              class="mx-auto mt-1 line-clamp-2 block max-w-56 text-xs font-medium [overflow-wrap:anywhere]"
              :title="row.original.platform"
            >
              {{
                row.original.kind === "unsupported_platform"
                  ? row.original.platform
                  : `Chosen as ${row.original.platform}`
              }}
            </span>

            <span class="text-muted mx-auto mt-0.5 block max-w-56 text-xs">
              {{ KINDS[row.original.kind].todo }}
            </span>
          </template>

          <template #files-cell="{ row }">
            <UButton
              v-if="row.original.files.length || row.original.posters.length"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-download"
              label="Download files"
              :href="`/api/admin/worksheet-holds/${row.original.jobId}/download`"
              external
              download
            />

            <span v-else class="text-muted text-xs">No files saved</span>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              size="xs"
              color="primary"
              variant="subtle"
              icon="i-lucide-unlock"
              label="Release"
              @click="releaseTarget = row.original"
            />
          </template>
        </UTable>
      </div>
    </UiSpinner>

    <UModal
      v-model:open="releaseOpen"
      title="Release hold"
      :ui="{ description: '[overflow-wrap:anywhere]' }"
      :description="
        releaseTarget
          ? releaseTarget.batchHeld
            ? `${releaseTarget.name} can leave the first step again, and its worksheet can be added again. The app doesn't email the organizer.`
            : `${releaseTarget.name}'s held posters can be published again. The app doesn't email the organizer.`
          : ''
      "
    >
      <template #body>
        <p class="text-sm">
          Email
          <span class="font-medium [overflow-wrap:anywhere]">{{
            releaseTarget?.user.emailAddress
          }}</span>

          <template v-if="releaseTarget?.kind === 'unsupported_platform'">
            whether {{ releaseTarget.platform || "their platform" }} is
            supported now: if so, which option to add their worksheet under; if
            not, that they can continue without a worksheet.
          </template>

          <template v-else-if="releaseTarget?.kind === 'worksheet_error'">
            that their worksheet is fixed: send the fixed file, or say what to
            change, and they add it again.
          </template>

          <template v-else>what to fix for these posters at Review.</template>
        </p>
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
            color="primary"
            label="Release"
            :loading="releasing"
            @click="confirmRelease"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
