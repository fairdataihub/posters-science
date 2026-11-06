<script setup lang="ts">
import type {
  PosterOrganizationChoice,
  PosterOrganizationChoices,
} from "#shared/types/organization";
import { parseApiError } from "~/utils/apiError";

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  choices: PosterOrganizationChoices | null;
  title: string;
  description: string;
  /** Label for the button that closes without saving. */
  dismissLabel?: string;
}>();

const emit = defineEmits<{
  saved: [choices: PosterOrganizationChoices];
  /** After the modal has fully closed, saved or not. */
  closed: [];
}>();

const toast = useToast();
const selected = ref(new Set<string>());
const saving = ref(false);

watch(
  () => props.choices,
  (choices) => {
    selected.value = new Set(
      choices?.organizations.filter((org) => org.listed).map((org) => org.id),
    );
  },
  { immediate: true },
);

// Another member's listing can only be removed by an owner, from the
// organization's manage pane.
function locked(org: PosterOrganizationChoice) {
  if (org.listed) return !org.addedByMe;

  return !props.choices?.canList;
}

function note(org: PosterOrganizationChoice) {
  if (org.role === null)
    return "You're no longer a member. You can still take your poster off.";
  if (org.listed && !org.addedByMe)
    return "Already shown, added by another member";
  if (org.hidden) return "Hidden by the Posters.science team";
  if (!org.isPublic) return "Private page. Only members can see it for now.";

  return "Public page";
}

function toggle(
  org: PosterOrganizationChoice,
  checked: boolean | "indeterminate",
) {
  const next = new Set(selected.value);

  if (checked === true) next.add(org.id);
  else next.delete(org.id);

  selected.value = next;
}

const changed = computed(() =>
  (props.choices?.organizations ?? []).some(
    (org) => org.listed !== selected.value.has(org.id),
  ),
);

async function save() {
  if (!props.choices || saving.value) return;

  saving.value = true;

  try {
    const result = await $fetch<PosterOrganizationChoices>(
      `/api/poster/${props.choices.posterId}/organizations`,
      { method: "PUT", body: { organizationIds: [...selected.value] } },
    );
    const names = result.organizations
      .filter((org) => org.listed)
      .map((org) => org.name);

    toast.add({
      title: "Organizations saved",
      description:
        names.length > 0
          ? `This poster is shown on ${names.join(", ")}.`
          : "This poster isn't shown on any of your organizations.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });

    emit("saved", result);
    open.value = false;
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
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!saving"
    @after:leave="emit('closed')"
  >
    <template #body>
      <div v-if="choices" class="space-y-4">
        <UAlert
          v-if="!choices.canList"
          color="warning"
          variant="subtle"
          icon="i-heroicons-information-circle"
          title="This poster can't be added right now"
          description="Only published posters you published or claimed can be shown on an organization page."
        />

        <p v-if="choices.organizations.length === 0" class="text-muted text-sm">
          You aren't part of an organization yet.
          <ULink to="/organizations?new=1" class="text-primary underline"
            >Create one</ULink
          >
          to show posters on its page.
        </p>

        <ul
          v-else
          class="divide-default border-default divide-y rounded-lg border"
        >
          <li
            v-for="org in choices.organizations"
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
              :disabled="locked(org) || saving"
              :label="org.name"
              :description="note(org)"
              class="min-w-0 flex-1"
              :ui="{ label: 'break-words' }"
              @update:model-value="toggle(org, $event)"
            />
          </li>
        </ul>

        <p class="text-muted text-xs">
          The poster stays yours. Organization owners can take it off their
          page, but they can't edit it.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <UButton
          color="neutral"
          variant="subtle"
          :label="dismissLabel ?? 'Not now'"
          :disabled="saving"
          @click="open = false"
        />

        <UButton
          label="Save"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="!changed"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
