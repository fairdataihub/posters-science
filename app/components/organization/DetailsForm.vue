<script setup lang="ts">
import type { FormSubmitEvent } from "#ui/types";
import {
  ORGANIZATION_DESCRIPTION_MAX,
  ORGANIZATION_NAME_MAX,
  organizationDetailsSchema,
  type OrganizationDetails,
} from "#shared/utils/organization";

const props = defineProps<{
  initial?: OrganizationDetails;
  submitLabel: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  submit: [details: OrganizationDetails];
}>();

const state = reactive<OrganizationDetails>({
  name: props.initial?.name ?? "",
  description: props.initial?.description ?? "",
  websiteUrl: props.initial?.websiteUrl ?? "",
});

function onSubmit(event: FormSubmitEvent<OrganizationDetails>) {
  emit("submit", event.data);
}
</script>

<template>
  <UForm
    :schema="organizationDetailsSchema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <UFormField label="Name" name="name" required>
      <UInput
        v-model="state.name"
        :maxlength="ORGANIZATION_NAME_MAX"
        placeholder="e.g. Institute for Marine Science"
        class="w-full"
      />
    </UFormField>

    <UFormField
      label="Description"
      name="description"
      :hint="`${state.description.length}/${ORGANIZATION_DESCRIPTION_MAX}`"
    >
      <UTextarea
        v-model="state.description"
        :maxlength="ORGANIZATION_DESCRIPTION_MAX"
        :rows="4"
        placeholder="What does your organization do?"
        class="w-full"
      />
    </UFormField>

    <UFormField label="Website" name="websiteUrl">
      <UInput
        v-model="state.websiteUrl"
        type="url"
        placeholder="https://example.org"
        class="w-full"
      />
    </UFormField>

    <div class="flex flex-wrap items-center gap-2">
      <UButton type="submit" :label="submitLabel" :loading="loading" />

      <slot name="actions" />
    </div>
  </UForm>
</template>
