<script setup lang="ts">
import {
  MAINTENANCE_DESCRIPTIONS,
  MAINTENANCE_LABELS,
  MAINTENANCE_OVERLAPS,
  ZENODO_MODE_LABELS,
  ZENODO_SIGN_IN_KEYS,
  isZenodoSignInKey,
  zenodoModeFor,
  zenodoSwitchesFor,
  type MaintenanceKey,
  type ZenodoMode,
} from "#shared/utils/maintenance";

import type { AdminMaintenanceRow } from "./types";

const emit = defineEmits<{ (e: "changed"): void }>();

const toast = useToast();

const { refresh: refreshPublicMaintenance } = useMaintenance();

const {
  data: maintenanceData,
  refresh: refreshMaintenance,
  status: maintenanceStatus,
} = await useFetch<{ data: AdminMaintenanceRow[] }>("/api/admin/maintenance");

const flags = computed(() => maintenanceData.value?.data ?? []);

const standaloneFlags = computed(() =>
  flags.value.filter((row) => !isZenodoSignInKey(row.key)),
);

const zenodoOAuthRow = computed(() =>
  flags.value.find((row) => row.key === "zenodoOAuth"),
);

const zenodoTokenRow = computed(() =>
  flags.value.find((row) => row.key === "zenodoToken"),
);

type Draft = { enabled: boolean; message: string };

// Local edit buffers, so several switches can be adjusted and then saved as one
// change rather than one request per card.
const drafts = ref<Record<string, Draft>>({});

function seedDrafts(rows: AdminMaintenanceRow[]) {
  const next: Record<string, Draft> = {};

  for (const row of rows) {
    next[row.key] = { enabled: row.enabled, message: row.message };
  }

  drafts.value = next;
}

watch(flags, seedDrafts, { immediate: true });

function draftFor(key: string): Draft {
  return (drafts.value[key] ??= { enabled: false, message: "" });
}

function rowIsDirty(row: AdminMaintenanceRow) {
  const draft = draftFor(row.key);

  return draft.enabled !== row.enabled || draft.message !== row.message;
}

const dirtyRows = computed(() => flags.value.filter(rowIsDirty));

const isDirty = computed(() => dirtyRows.value.length > 0);

// Switches being turned on. These are the ones that actually stop user traffic,
// so they are what the confirmation is about.
const newlyPausedRows = computed(() =>
  dirtyRows.value.filter((row) => draftFor(row.key).enabled && !row.enabled),
);

const savedZenodoMode = computed(() =>
  zenodoModeFor({
    zenodoOAuth: zenodoOAuthRow.value?.enabled ?? false,
    zenodoToken: zenodoTokenRow.value?.enabled ?? false,
  }),
);

// The Zenodo card writes one message, saved on both switches.
const zenodoMessage = computed({
  get: () => draftFor("zenodoOAuth").message,
  set: (message: string) => {
    for (const key of ZENODO_SIGN_IN_KEYS) draftFor(key).message = message;
  },
});

const zenodoMode = computed<ZenodoMode>({
  get: () =>
    zenodoModeFor({
      zenodoOAuth: draftFor("zenodoOAuth").enabled,
      zenodoToken: draftFor("zenodoToken").enabled,
    }),
  set: (mode) => {
    if (mode === zenodoMode.value) return;

    const switches = zenodoSwitchesFor(mode);
    const backToSaved = mode === savedZenodoMode.value;

    // A message written for one mode rarely fits another, so a new mode
    // starts from the default and going back restores what was saved.
    for (const key of ZENODO_SIGN_IN_KEYS) {
      const saved = flags.value.find((row) => row.key === key);

      draftFor(key).enabled = switches[key];
      draftFor(key).message = backToSaved ? (saved?.message ?? "") : "";
    }
  },
});

const zenodoDirty = computed(() =>
  dirtyRows.value.some((row) => isZenodoSignInKey(row.key)),
);

const saving = ref(false);
const confirmOpen = ref(false);

function labelFor(key: string) {
  return MAINTENANCE_LABELS[key as MaintenanceKey] ?? key;
}

function zenodoLabel(mode: ZenodoMode) {
  return `Zenodo set to ${ZENODO_MODE_LABELS[mode]}`;
}

// Lists changes the way the panel shows them, so the two Zenodo switches read
// as one change to the Zenodo card.
function changeLabels(rows: AdminMaintenanceRow[]) {
  const labels = rows
    .filter((row) => !isZenodoSignInKey(row.key))
    .map((row) => labelFor(row.key));

  if (rows.some((row) => isZenodoSignInKey(row.key))) {
    labels.push(zenodoLabel(zenodoMode.value));
  }

  return labels;
}

const dirtyLabels = computed(() => changeLabels(dirtyRows.value));

const newlyPausedLabels = computed(() => changeLabels(newlyPausedRows.value));

function requestSave() {
  if (!isDirty.value || saving.value) return;

  if (newlyPausedRows.value.length > 0) {
    confirmOpen.value = true;

    return;
  }

  save();
}

async function save() {
  if (!isDirty.value || saving.value) return;

  saving.value = true;
  confirmOpen.value = false;

  const payload = dirtyRows.value.map((row) => ({
    key: row.key,
    enabled: draftFor(row.key).enabled,
    message: draftFor(row.key).message,
  }));

  // Read now, the refresh below reseeds the drafts
  const zenodoChange = zenodoDirty.value ? zenodoMode.value : null;

  try {
    await $fetch("/api/admin/maintenance", {
      method: "PUT",
      body: { flags: payload },
    });

    const lines = [
      ...payload
        .filter((flag) => !isZenodoSignInKey(flag.key))
        .map(
          (flag) =>
            `${labelFor(flag.key)} ${flag.enabled ? "is now paused" : "is live again"}`,
        ),
      ...(zenodoChange ? [zenodoLabel(zenodoChange)] : []),
    ];

    toast.add({
      title:
        lines.length === 1 ? lines[0] : `${lines.length} workflows updated`,
      description: lines.length === 1 ? undefined : `${lines.join(". ")}.`,
      color: payload.some((flag) => flag.enabled) ? "warning" : "success",
    });

    await Promise.all([refreshMaintenance(), refreshPublicMaintenance()]);
    emit("changed");
  } catch (error) {
    const { statusMessage } = parseApiError(error);

    toast.add({
      title: "Failed to update maintenance",
      description: statusMessage,
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

function resetAll() {
  seedDrafts(flags.value);
}

function previewMessage(row: AdminMaintenanceRow) {
  return draftFor(row.key).message.trim() || row.previewMessage;
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="info"
      variant="subtle"
      icon="material-symbols:info-outline"
      title="Pausing a workflow takes effect within about ten seconds"
      description="Users see the notice on the affected pages, the matching buttons are disabled, and the server rejects the request even if a button is bypassed. Every change is recorded in the audit log."
    />

    <UiSpinner v-if="maintenanceStatus === 'pending'" size="lg" class="h-40" />

    <template v-else>
      <div
        class="border-default bg-elevated/40 flex flex-wrap items-center gap-3 rounded-lg border p-3"
      >
        <p v-if="isDirty" class="text-sm font-medium">
          {{ dirtyLabels.length }} unsaved
          {{ dirtyLabels.length === 1 ? "change" : "changes" }}:

          <span class="text-muted font-normal">
            {{ dirtyLabels.join(", ") }}
          </span>
        </p>

        <p v-else class="text-muted text-sm">Save any changes to apply them.</p>

        <div class="ml-auto flex items-center gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            label="Reset"
            :disabled="!isDirty || saving"
            @click="resetAll"
          />

          <UButton
            size="sm"
            label="Save changes"
            :loading="saving"
            :disabled="!isDirty || saving"
            @click="requestSave"
          />
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <UCard
          v-for="row in standaloneFlags"
          :key="row.key"
          :class="rowIsDirty(row) ? 'ring-primary ring-2' : ''"
        >
          <template #header>
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="font-semibold">{{ labelFor(row.key) }}</h3>

                <p class="text-muted mt-1 text-xs">
                  {{ MAINTENANCE_DESCRIPTIONS[row.key as MaintenanceKey] }}
                </p>

                <p
                  v-if="MAINTENANCE_OVERLAPS[row.key as MaintenanceKey]"
                  class="text-muted mt-1 flex gap-1 text-xs italic"
                >
                  <UIcon
                    name="material-symbols:info-outline"
                    class="mt-0.5 size-3.5 shrink-0"
                  />

                  {{ MAINTENANCE_OVERLAPS[row.key as MaintenanceKey] }}
                </p>
              </div>

              <USwitch v-model="draftFor(row.key).enabled" size="lg" />
            </div>
          </template>

          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <UBadge
                :color="row.enabled ? 'warning' : 'success'"
                variant="subtle"
                size="sm"
              >
                {{ row.enabled ? "Paused" : "Live" }}
              </UBadge>

              <UBadge
                v-if="rowIsDirty(row)"
                color="primary"
                variant="subtle"
                size="sm"
              >
                {{ draftFor(row.key).enabled ? "Will pause" : "Will resume" }}
              </UBadge>
            </div>

            <UFormField
              label="Message shown to users"
              hint="Leave blank to use the default"
            >
              <UTextarea
                v-model="draftFor(row.key).message"
                :rows="3"
                :maxlength="500"
                placeholder="Explain what is happening and when it should be back"
                class="w-full"
              />
            </UFormField>

            <div class="space-y-1">
              <p class="text-muted text-xs">Preview</p>

              <UAlert
                color="warning"
                variant="subtle"
                icon="material-symbols:build"
                :title="`${labelFor(row.key)} is paused`"
                :description="previewMessage(row)"
              />
            </div>

            <dl class="text-muted grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt>Paused since</dt>

              <dd>{{ formatDateTime(row.enabledAt) }}</dd>

              <dt>Last changed</dt>

              <dd>{{ formatDateTime(row.updated) }}</dd>

              <dt>Changed by</dt>

              <dd class="truncate">{{ row.updatedBy?.emailAddress ?? "-" }}</dd>
            </dl>
          </div>
        </UCard>

        <AdminMaintenanceZenodoCard
          v-if="zenodoOAuthRow && zenodoTokenRow"
          v-model:mode="zenodoMode"
          v-model:message="zenodoMessage"
          :oauth-row="zenodoOAuthRow"
          :token-row="zenodoTokenRow"
          :dirty="zenodoDirty"
          class="lg:col-span-2"
        />
      </div>
    </template>

    <UModal
      v-model:open="confirmOpen"
      title="Pause these workflows?"
      description="Users will not be able to use them until you switch them back on."
    >
      <template #body>
        <ul class="list-inside list-disc space-y-1 text-sm">
          <li v-for="label in newlyPausedLabels" :key="label">
            {{ label }}
          </li>
        </ul>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="Cancel"
            @click="confirmOpen = false"
          />

          <UButton
            color="warning"
            :label="
              newlyPausedLabels.length === 1
                ? 'Pause workflow'
                : `Pause ${newlyPausedLabels.length} workflows`
            "
            :loading="saving"
            @click="save"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
