<script setup lang="ts">
import type { FormSubmitEvent } from "#ui/types";
import {
  COLLECTION_CONFERENCE_MAX,
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_NAME_MAX,
  collectionDetailsSchema,
  type CollectionDetails,
} from "#shared/utils/collection";

const props = defineProps<{
  initial?: Partial<CollectionDetails>;
  submitLabel: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  submit: [details: CollectionDetails];
}>();

const state = reactive<CollectionDetails>({
  name: props.initial?.name ?? "",
  description: props.initial?.description ?? "",
  conference: props.initial?.conference ?? "",
});

function onSubmit(event: FormSubmitEvent<CollectionDetails>) {
  emit("submit", event.data);
}
</script>

<template>
  <UForm
    :schema="collectionDetailsSchema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UFormField label="Name" name="name" required>
      <UInput
        v-model="state.name"
        :maxlength="COLLECTION_NAME_MAX"
        placeholder="e.g. Our posters at AGU 2026"
        class="w-full"
      />
    </UFormField>

    <UFormField
      label="Description"
      name="description"
      :hint="`${state.description.length}/${COLLECTION_DESCRIPTION_MAX}`"
    >
      <UTextarea
        v-model="state.description"
        :maxlength="COLLECTION_DESCRIPTION_MAX"
        :rows="4"
        placeholder="What brings these posters together?"
        class="w-full"
      />
    </UFormField>

    <UFormField
      label="Conference or event"
      name="conference"
      help="Optional. Shown on the collection's card."
    >
      <UInput
        v-model="state.conference"
        :maxlength="COLLECTION_CONFERENCE_MAX"
        placeholder="e.g. AGU Fall Meeting 2026"
        class="w-full"
      />
    </UFormField>

    <slot name="extra" />

    <div class="flex flex-wrap items-center gap-2">
      <UButton type="submit" :label="submitLabel" :loading="loading" />

      <slot name="actions" />
    </div>
  </UForm>
</template>
