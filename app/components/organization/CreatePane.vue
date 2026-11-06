<script setup lang="ts">
import type { MyOrganization } from "#shared/types/organization";
import type { OrganizationDetails } from "#shared/utils/organization";
import { parseApiError } from "~/utils/apiError";

// Side pane for creating an organization. Managing one has its own page.

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  created: [organization: MyOrganization];
}>();

const toast = useToast();
const creating = ref(false);

async function createOrganization(details: OrganizationDetails) {
  creating.value = true;

  try {
    const created = await $fetch<MyOrganization>("/api/organizations", {
      method: "POST",
      body: details,
    });

    toast.add({
      title: `${created.name} created`,
      description:
        "Add your posters, invite people and make the page public when you're ready.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    emit("created", created);
    open.value = false;
  } catch (err: unknown) {
    toast.add({
      title: "Could not create the organization",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
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
    title="New organization"
    description="You use your current account and become the organization's owner. It stays private until you make it public."
  >
    <template #body>
      <OrganizationDetailsForm
        submit-label="Create organization"
        :loading="creating"
        @submit="createOrganization"
      >
        <template #actions>
          <UButton
            color="neutral"
            variant="subtle"
            label="Cancel"
            @click="open = false"
          />
        </template>
      </OrganizationDetailsForm>
    </template>
  </USlideover>
</template>
