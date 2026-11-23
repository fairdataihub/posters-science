<script setup lang="ts">
import type { ColumnDef } from "@tanstack/vue-table";
import { parseApiError } from "~/utils/apiError";

/**
 * Bulk batches whose organizer sent a refused poster worksheet to the team.
 * Each waits on its first step until released here. The team emails the
 * organizer (the app doesn't), who then adds their worksheet again.
 */
type WorksheetHold = {
  jobId: string;
  name: string;
  heldAt: string;
  files: string[];
  user: { givenName: string; familyName: string; emailAddress: string };
};

const emit = defineEmits<{
  changed: [];
}>();

const HOLD_DAYS = 7;
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
  { id: "files", header: "Files in Bunny" },
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

async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
    toast.add({ title: "Path copied", color: "neutral" });
  } catch {
    // Clipboard blocked: the path is on screen to select.
  }
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
      description: `${hold.name} can continue. Email ${hold.user.emailAddress} that the worksheet is ready.`,
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
      <p class="text-muted text-sm">
        Organizers who sent us a worksheet we couldn't read. Their batch waits
        on the first step until you release it. Add support for the format or
        fix the file, email them, then release: they add the worksheet again.
      </p>

      <UButton
        size="sm"
        color="neutral"
        variant="subtle"
        icon="material-symbols:refresh"
        label="Refresh"
        class="ml-auto"
        @click="refresh()"
      />
    </div>

    <UiSpinner :loading="status === 'pending'" overlay subtle>
      <div class="overflow-x-auto">
        <UTable :data="holds" :columns="columns">
          <template #empty>
            <p class="text-muted py-6 text-center text-sm">
              No batches on hold.
            </p>
          </template>

          <template #batch-cell="{ row }">
            <span class="text-sm font-medium">{{ row.original.name }}</span>

            <span class="text-muted block font-mono text-xs">
              {{ row.original.jobId }}
            </span>
          </template>

          <template #organizer-cell="{ row }">
            <span class="text-sm">
              {{
                `${row.original.user.givenName} ${row.original.user.familyName}`.trim()
              }}

              <span class="text-muted block text-xs">
                {{ row.original.user.emailAddress }}
              </span>
            </span>
          </template>

          <template #held-cell="{ row }">
            <UBadge
              :color="
                holdDay(row.original.heldAt) > HOLD_DAYS ? 'error' : 'warning'
              "
              variant="subtle"
              size="sm"
            >
              Day {{ holdDay(row.original.heldAt) }} of {{ HOLD_DAYS }}
            </UBadge>

            <span class="text-muted block text-xs">
              Email by {{ dueDate(row.original.heldAt) }}
            </span>
          </template>

          <template #files-cell="{ row }">
            <ul v-if="row.original.files.length" class="space-y-1">
              <li
                v-for="path in row.original.files"
                :key="path"
                class="flex items-center gap-1"
              >
                <span class="max-w-xs truncate font-mono text-xs" :title="path">
                  {{ path }}
                </span>

                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-copy"
                  :aria-label="`Copy ${path}`"
                  @click="copyPath(path)"
                />
              </li>
            </ul>

            <span v-else class="text-muted text-xs">Not saved</span>
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
      :description="
        releaseTarget
          ? `${releaseTarget.name} can leave the first step again. The app doesn't email the organizer.`
          : ''
      "
    >
      <template #body>
        <p class="text-sm">
          Email
          <span class="font-medium">{{
            releaseTarget?.user.emailAddress
          }}</span>
          that their worksheet is ready to add again, and under which option.
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
