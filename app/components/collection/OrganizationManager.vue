<script setup lang="ts">
import type {
  CollectionOrganizationChoice,
  CollectionOrganizationChoices,
} from "#shared/types/collection";
import { parseApiError } from "~/utils/apiError";

// Which of the owner's organizations show this collection on their page.

const props = defineProps<{
  collectionId: string;
}>();

const toast = useToast();

const base = computed(
  () =>
    `/api/collections/${encodeURIComponent(props.collectionId)}/organizations`,
);

const organizations = ref<CollectionOrganizationChoice[] | null>(null);
const loadError = ref("");
const selected = ref(new Set<string>());
const saving = ref(false);

function apply(result: CollectionOrganizationChoices) {
  organizations.value = result.organizations;
  selected.value = new Set(
    result.organizations.filter((org) => org.listed).map((org) => org.id),
  );
}

async function load() {
  loadError.value = "";

  try {
    apply(await $fetch<CollectionOrganizationChoices>(base.value));
  } catch (err: unknown) {
    loadError.value =
      parseApiError(err).statusMessage ?? "Could not load your organizations.";
  }
}

onMounted(load);
watch(() => props.collectionId, load);

function note(org: CollectionOrganizationChoice) {
  if (org.role === null)
    return "You're no longer a member. You can still take your collection off.";
  if (org.hidden) return "Hidden by the Posters.science team";
  if (!org.isPublic) return "Private page. Only members can see it for now.";

  return "Public page";
}

function toggle(id: string, checked: boolean | "indeterminate") {
  const next = new Set(selected.value);

  if (checked === true) next.add(id);
  else next.delete(id);

  selected.value = next;
}

const changed = computed(() =>
  (organizations.value ?? []).some(
    (org) => org.listed !== selected.value.has(org.id),
  ),
);

async function save() {
  if (!organizations.value || saving.value) return;

  saving.value = true;

  const before = organizations.value;

  try {
    const result = await $fetch<CollectionOrganizationChoices>(base.value, {
      method: "PUT",
      body: { organizationIds: [...selected.value] },
    });

    for (const org of result.organizations) {
      const was = before.find((b) => b.id === org.id)?.listed ?? false;

      if (org.listed && !was) window.umami?.track("collection_org_listed");
      if (!org.listed && was) window.umami?.track("collection_org_unlisted");
    }

    apply(result);
    toast.add({
      title: "Organizations saved",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not save",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h4 class="font-medium">Show on organization pages</h4>

      <p class="text-muted text-sm">
        The collection appears on these pages while it is public. Organization
        owners can take it off their page, but they can't edit it.
      </p>
    </div>

    <UAlert
      v-if="loadError"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      :title="loadError"
      :actions="[
        { label: 'Try again', color: 'error', variant: 'solid', onClick: load },
      ]"
    />

    <UiSpinner v-else-if="!organizations" :loading="true" subtle>
      <div class="h-16" />
    </UiSpinner>

    <p v-else-if="organizations.length === 0" class="text-muted text-sm">
      You aren't part of an organization yet.
      <ULink to="/organizations?new=1" class="text-primary underline"
        >Create one</ULink
      >
      to show this collection on its page.
    </p>

    <template v-else>
      <ul class="divide-default border-default divide-y rounded-lg border">
        <li
          v-for="org in organizations"
          :key="org.id"
          class="flex items-center gap-3 p-3"
        >
          <UAvatar
            :src="org.avatarUrl"
            :alt="org.name"
            size="sm"
            class="shrink-0"
          />

          <UCheckbox
            :model-value="selected.has(org.id)"
            :disabled="(org.role === null && !org.listed) || saving"
            :label="org.name"
            :description="note(org)"
            class="min-w-0 flex-1"
            :ui="{ label: 'break-words' }"
            @update:model-value="toggle(org.id, $event)"
          />
        </li>
      </ul>

      <UButton
        label="Save"
        icon="i-heroicons-check"
        :loading="saving"
        :disabled="!changed"
        @click="save"
      />
    </template>
  </div>
</template>
