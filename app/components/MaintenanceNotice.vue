<script setup lang="ts">
import {
  MAINTENANCE_LABELS,
  type MaintenanceKey,
} from "#shared/utils/maintenance";

const props = defineProps<{
  /** Which paused workflow this notice speaks for. */
  maintenanceKey: MaintenanceKey;
}>();

const { entryFor } = useMaintenance();

const entry = computed(() => entryFor(props.maintenanceKey));

const since = computed(() => {
  const value = entry.value?.since;
  if (!value) return "";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
});
</script>

<template>
  <UAlert
    v-if="entry"
    color="warning"
    variant="subtle"
    icon="material-symbols:build"
    :title="`${MAINTENANCE_LABELS[maintenanceKey]} is paused`"
  >
    <template #description>
      <p>{{ entry.message }}</p>

      <p v-if="since" class="mt-1 text-xs opacity-80">
        Paused since {{ since }}
      </p>
    </template>
  </UAlert>
</template>
