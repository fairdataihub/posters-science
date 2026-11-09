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
  discard: () => void;
  prepareStepTransition: () => Promise<boolean>;
  dirty: boolean;
  saving: boolean;
} | null>(null);

/** Save pending grid edits; resolves false if saving failed. */
async function saveIfDirty(): Promise<boolean> {
  if (!gridRef.value?.dirty) return true;
  return gridRef.value.save();
}

async function prepareStepTransition(): Promise<boolean> {
  return (await gridRef.value?.prepareStepTransition()) ?? true;
}

/** Save draft (wizard footer): save edits and show any issues, stay on the step. */
async function saveDraft(): Promise<boolean> {
  return (await gridRef.value?.save()) ?? true;
}

/** Discard changes (wizard footer): same as the grid toolbar button. */
function discardChanges() {
  gridRef.value?.discard();
}

defineExpose({
  saveIfDirty,
  saveDraft,
  discardChanges,
  prepareStepTransition,
  dirty: computed(() => gridRef.value?.dirty ?? false),
  saving: computed(() => gridRef.value?.saving ?? false),
});

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
      Review the metadata (use
      <strong class="text-default font-medium">Full screen</strong> to see more
      of the spreadsheet at once) for each poster. At a minimum, fill in every
      required field (marked <span class="text-error">*</span>), and add
      anything else that is missing.
      Use the tabs to move between sections, such as creators, funding and
      poster content, and add rows where a poster needs additional metadata.
      You can continue without filling in every
      required field here, but anything required and still missing will need to
      be added on the next step before you can publish.
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
