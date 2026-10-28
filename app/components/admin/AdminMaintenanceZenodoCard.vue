<script setup lang="ts">
import {
  MAINTENANCE_FALLBACK_MESSAGES,
  ZENODO_MODE_DESCRIPTIONS,
  ZENODO_MODE_LABELS,
  ZENODO_MODES,
  ZENODO_OFF_FALLBACK_MESSAGE,
  ZENODO_OFF_LABEL,
  zenodoModeFor,
  type ZenodoMode,
} from "#shared/utils/maintenance";

import type { AdminMaintenanceRow } from "./types";

// The zenodoOAuth and zenodoToken switches edited as one Zenodo mode, so an
// admin picks the outcome instead of working out what two switches add up to.
const props = defineProps<{
  oauthRow: AdminMaintenanceRow;
  tokenRow: AdminMaintenanceRow;
  dirty: boolean;
}>();

const mode = defineModel<ZenodoMode>("mode", { required: true });
const message = defineModel<string>("message", { required: true });

const savedMode = computed(() =>
  zenodoModeFor({
    zenodoOAuth: props.oauthRow.enabled,
    zenodoToken: props.tokenRow.enabled,
  }),
);

const modeItems = ZENODO_MODES.map((value) => ({
  value,
  label: ZENODO_MODE_LABELS[value],
  description: ZENODO_MODE_DESCRIPTIONS[value],
}));

// Only these two modes show users a message. With tokens paused the page
// simply offers the Sign in to Zenodo button on its own.
const showsMessage = computed(
  () => mode.value === "oauthPaused" || mode.value === "off",
);

const previewMessage = computed(
  () =>
    message.value.trim() ||
    (mode.value === "off"
      ? ZENODO_OFF_FALLBACK_MESSAGE
      : MAINTENANCE_FALLBACK_MESSAGES.zenodoOAuth),
);

const PREVIEW_NOTES: Record<ZenodoMode, string> = {
  live: "No notice. The publish page offers the Sign in to Zenodo button and the personal access token form as two tabs.",
  oauthPaused:
    "Shown on the publish page in place of the Sign in to Zenodo button, followed by the steps to create a token. Users who are already connected are not affected.",
  tokenPaused:
    "No notice. The publish page offers the Sign in to Zenodo button only. Users who are already connected are not affected.",
  off: "Shown once at the top of the dashboard and the publish page. The Zenodo option is disabled in the repository picker and publishing is blocked.",
};

function modeColor(value: ZenodoMode) {
  if (value === "live") return "success" as const;

  return value === "off" ? ("error" as const) : ("warning" as const);
}

const rows = computed(() => [props.oauthRow, props.tokenRow]);

// Zenodo has been in its saved mode since the most recent switch was paused.
const pausedSince = computed(
  () =>
    rows.value
      .flatMap((row) => (row.enabled && row.enabledAt ? [row.enabledAt] : []))
      .sort()
      .at(-1) ?? null,
);

const lastChangedRow = computed(
  () =>
    rows.value
      .filter((row) => row.updated !== null)
      .sort((a, b) => (a.updated ?? "").localeCompare(b.updated ?? ""))
      .at(-1) ?? null,
);
</script>

<template>
  <UCard :class="dirty ? 'ring-primary ring-2' : ''">
    <template #header>
      <h3 class="font-semibold">Zenodo publishing</h3>

      <p class="text-muted mt-1 text-xs">
        Users connect their Zenodo account with OAuth sign-in or a personal
        access token, and either one can be paused on its own. Pausing both
        turns Zenodo off.
      </p>
    </template>

    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <UBadge :color="modeColor(savedMode)" variant="subtle" size="sm">
          {{ ZENODO_MODE_LABELS[savedMode] }}
        </UBadge>

        <UBadge v-if="dirty" color="primary" variant="subtle" size="sm">
          {{
            mode === savedMode
              ? "Message changed"
              : `Will change to ${ZENODO_MODE_LABELS[mode]}`
          }}
        </UBadge>
      </div>

      <URadioGroup
        v-model="mode"
        variant="card"
        :items="modeItems"
        :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2', item: 'p-3' }"
      />

      <div class="grid gap-4" :class="showsMessage ? 'lg:grid-cols-2' : ''">
        <UFormField
          v-if="showsMessage"
          label="Message shown to users"
          hint="Leave blank to use the default"
        >
          <UTextarea
            v-model="message"
            :rows="3"
            :maxlength="500"
            :placeholder="
              mode === 'off'
                ? 'Explain what is happening and when it should be back'
                : 'Explain why signing in with Zenodo is unavailable'
            "
            class="w-full"
          />
        </UFormField>

        <div class="space-y-2">
          <p class="text-muted text-xs">What users see</p>

          <UAlert
            v-if="mode === 'off'"
            color="warning"
            variant="subtle"
            icon="material-symbols:build"
            :title="`${ZENODO_OFF_LABEL} is paused`"
            :description="previewMessage"
          />

          <p
            v-else-if="mode === 'oauthPaused'"
            class="border-default rounded-lg border p-3 text-sm"
          >
            {{ previewMessage }}
          </p>

          <p class="text-muted text-xs">{{ PREVIEW_NOTES[mode] }}</p>
        </div>
      </div>

      <dl class="text-muted grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt>Paused since</dt>

        <dd>{{ formatDateTime(pausedSince) }}</dd>

        <dt>Last changed</dt>

        <dd>{{ formatDateTime(lastChangedRow?.updated) }}</dd>

        <dt>Changed by</dt>

        <dd class="truncate">
          {{ lastChangedRow?.updatedBy?.emailAddress ?? "-" }}
        </dd>
      </dl>
    </div>
  </UCard>
</template>
