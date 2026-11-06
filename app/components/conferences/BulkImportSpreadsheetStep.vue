<script setup lang="ts">
import BulkImportMetadataGrid from "~/components/conferences/BulkImportMetadataGrid.vue";

/**
 * Batch metadata step: edits every poster's metadata in an in-app,
 * spreadsheet-style grid (replaces the Excel download / upload round trip).
 */
const props = defineProps<{
  bulkJobId: string | null;
  completedPosterCount: number;
}>();

const emit = defineEmits<{
  imported: [posterIds: number[]];
  dirtyChange: [dirty: boolean];
}>();

const gridRef = ref<{
  reload: () => Promise<void>;
  save: () => Promise<boolean>;
  prepareStepTransition: () => Promise<boolean>;
  dirty: boolean;
} | null>(null);

/** Save pending grid edits; resolves false if saving failed. */
async function saveIfDirty(): Promise<boolean> {
  if (!gridRef.value?.dirty) return true;
  return gridRef.value.save();
}

async function prepareStepTransition(): Promise<boolean> {
  return (await gridRef.value?.prepareStepTransition()) ?? true;
}

defineExpose({ saveIfDirty, prepareStepTransition });

const disabled = computed(
  () => !props.bulkJobId || props.completedPosterCount === 0,
);


// Reload when more posters finish extracting.
watch(
  () => props.completedPosterCount,
  (next, prev) => {
    if (next > prev) gridRef.value?.reload();
  },
);
</script>

<template>
  <div class="space-y-4">
    <p class="text-muted text-sm">
      Review the metadata for each poster and fill in anything missing. Use the
      tabs to move between sections, such as creators, funding and poster
      content, and add rows where a poster needs additional metadata. You can
      continue without
      filling in every required field here, but anything still missing will
      need to be added on the next step before you can publish.
    </p>

    <UAlert
      v-if="disabled"
      color="neutral"
      variant="subtle"
      icon="i-lucide-hourglass"
      description="Metadata becomes editable once at least one poster has finished extraction."
    />

    <BulkImportMetadataGrid
      v-else
      ref="gridRef"
      :bulk-job-id="bulkJobId"
      @saved="(ids) => emit('imported', ids)"
      @dirty-change="(value) => emit('dirtyChange', value)"
    />
  </div>
</template>
