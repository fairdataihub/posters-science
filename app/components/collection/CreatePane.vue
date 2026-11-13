<script setup lang="ts">
import type { MyCollection } from "#shared/types/collection";
import type {
  CollectionDetails,
  CollectionSource,
} from "#shared/utils/collection";
import { parseApiError } from "~/utils/apiError";

// Side pane for creating a collection. Managing one has its own page. A bulk
// upload can prefill it, with its published posters already chosen.

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  /** Prefilled details and posters, such as from a bulk upload. */
  draft?: {
    details: Partial<CollectionDetails>;
    posterIds: number[];
    sourceBulkSubmissionId?: string;
    /** Posters in the upload that can't be added yet. */
    skippedCount?: number;
  } | null;
}>();

const emit = defineEmits<{
  created: [collection: MyCollection];
  /** The upload already has a collection. */
  exists: [collectionId: string];
}>();

const toast = useToast();
const creating = ref(false);

const source = computed<CollectionSource>(() =>
  props.draft?.sourceBulkSubmissionId ? "bulk_batch" : "page",
);

async function createCollection(details: CollectionDetails) {
  creating.value = true;

  try {
    const created = await $fetch<MyCollection>("/api/collections", {
      method: "POST",
      body: {
        ...details,
        posterIds: props.draft?.posterIds ?? [],
        sourceBulkSubmissionId: props.draft?.sourceBulkSubmissionId,
        source: source.value,
      },
    });

    window.umami?.track("collection_created", { source: source.value });

    toast.add({
      title: `${created.name} created`,
      description:
        created.posterCount > 0
          ? "Make it public when you're ready to share it."
          : "Add your posters, then make it public when you're ready.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    emit("created", created);
    open.value = false;
  } catch (err: unknown) {
    const { reason, data, statusMessage } = parseApiError(err);

    if (reason === "exists" && typeof data?.collectionId === "string") {
      emit("exists", data.collectionId);
      open.value = false;

      return;
    }

    toast.add({
      title: "Could not create the collection",
      description: statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    side="right"
    class="w-full max-w-xl"
    title="New collection"
    description="Group posters you published or claimed. It stays private until you make it public."
  >
    <template #body>
      <CollectionDetailsForm
        :key="draft?.sourceBulkSubmissionId ?? 'blank'"
        :initial="draft?.details"
        submit-label="Create collection"
        :loading="creating"
        @submit="createCollection"
      >
        <template v-if="draft" #extra>
          <UAlert
            color="info"
            variant="subtle"
            icon="i-lucide-library-big"
            :title="
              draft.posterIds.length === 1
                ? '1 poster will be added'
                : `${draft.posterIds.length.toLocaleString()} posters will be added`
            "
            :description="
              draft.skippedCount
                ? `${draft.skippedCount.toLocaleString()} more from this upload aren't published yet. Add them from the collection once they are.`
                : undefined
            "
          />
        </template>

        <template #actions>
          <UButton
            color="neutral"
            variant="subtle"
            label="Cancel"
            @click="open = false"
          />
        </template>
      </CollectionDetailsForm>
    </template>
  </USlideover>
</template>
