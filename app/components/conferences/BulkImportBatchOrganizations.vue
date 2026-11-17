<script setup lang="ts">
import type {
  BulkBatchOrganization,
  BulkBatchOrganizations,
} from "#shared/types/bulkSubmissionCompletion";
import { parseApiError } from "~/utils/apiError";

// Shows every published poster of one bulk upload on the organization pages
// the person picks. Adding only: single posters come off from the dashboard or
// the organization's own page.
const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  jobId: string;
}>();

const toast = useToast();
const data = ref<BulkBatchOrganizations | null>(null);
const loading = ref(false);
const loadError = ref<string>();
const selected = ref(new Set<string>());
const saving = ref(false);

// POST /api/organizations/[id]/posters takes at most this many per request.
const POSTERS_PER_REQUEST = 200;

async function load() {
  loading.value = true;
  loadError.value = undefined;

  try {
    data.value = await $fetch<BulkBatchOrganizations>(
      `/api/bulk-poster-submissions/${props.jobId}/organizations`,
    );
    selected.value = new Set();
  } catch (err: unknown) {
    loadError.value =
      parseApiError(err).statusMessage ?? "Could not load your organizations.";
  } finally {
    loading.value = false;
  }
}

watch(open, (isOpen) => {
  if (isOpen) void load();
});

const total = computed(() => data.value?.posterIds.length ?? 0);

function postersLabel(count: number) {
  return count === 1 ? "1 poster" : `${count.toLocaleString()} posters`;
}

function showsAll(org: BulkBatchOrganization) {
  return total.value > 0 && org.listedCount >= total.value;
}

function note(org: BulkBatchOrganization) {
  if (showsAll(org)) {
    return total.value === 1
      ? "Already shows this poster"
      : `Already shows all ${total.value.toLocaleString()} posters`;
  }

  const visibility = org.hidden
    ? "Hidden by the Posters.science team"
    : org.isPublic
      ? "Public page"
      : "Private page. Only members can see it for now.";

  return org.listedCount > 0
    ? `Shows ${org.listedCount.toLocaleString()} of ${total.value.toLocaleString()} already. ${visibility}`
    : visibility;
}

function toggle(
  org: BulkBatchOrganization,
  checked: boolean | "indeterminate",
) {
  const next = new Set(selected.value);

  if (checked === true) next.add(org.id);
  else next.delete(org.id);

  selected.value = next;
}

async function save() {
  if (!data.value || saving.value || selected.value.size === 0) return;

  saving.value = true;

  const { posterIds, organizations } = data.value;
  const chosen = organizations.filter((org) => selected.value.has(org.id));
  const done: string[] = [];

  try {
    for (const org of chosen) {
      for (let i = 0; i < posterIds.length; i += POSTERS_PER_REQUEST) {
        await $fetch(`/api/organizations/${org.id}/posters`, {
          method: "POST",
          body: { posterIds: posterIds.slice(i, i + POSTERS_PER_REQUEST) },
        });
      }

      done.push(org.name);
    }

    window.umami?.track("organization_batch_listed", {
      organizations: done.length,
      posters: posterIds.length,
    });

    toast.add({
      title: "Added to organizations",
      description: `This batch's posters are now shown on ${done.join(", ")}.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });

    open.value = false;
  } catch (err: unknown) {
    const message =
      parseApiError(err).statusMessage ?? "Something went wrong. Try again.";

    toast.add({
      title: "Could not add to every organization",
      description:
        done.length > 0 ? `Added to ${done.join(", ")}. ${message}` : message,
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });

    // Show the counts as they are now, after a partial add.
    await load();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Show this batch on an organization page"
    :description="
      total > 0
        ? `Adds this batch's ${postersLabel(total)} to the organizations you pick.`
        : 'Adds this batch\'s published posters to the organizations you pick.'
    "
    :dismissible="!saving"
  >
    <template #body>
      <div v-if="loading" class="flex justify-center py-6">
        <UIcon
          name="i-lucide-loader-circle"
          class="text-primary size-6 animate-spin"
        />
      </div>

      <UAlert
        v-else-if="loadError"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        :title="loadError"
      />

      <div v-else-if="data" class="space-y-4">
        <UAlert
          v-if="total === 0"
          color="warning"
          variant="subtle"
          icon="i-heroicons-information-circle"
          title="None of this batch's posters can be added yet"
          description="Only published posters you published or claimed can be shown on an organization page."
        />

        <p v-else-if="data.skippedCount > 0" class="text-muted text-sm">
          {{ postersLabel(data.skippedCount) }} from this batch
          {{ data.skippedCount === 1 ? "isn't" : "aren't" }} published yet, so
          {{ data.skippedCount === 1 ? "it's" : "they're" }} left out.
        </p>

        <p v-if="data.organizations.length === 0" class="text-muted text-sm">
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
            v-for="org in data.organizations"
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
              :model-value="showsAll(org) || selected.has(org.id)"
              :disabled="showsAll(org) || total === 0 || saving"
              :label="org.name"
              :description="note(org)"
              class="min-w-0 flex-1"
              :ui="{ label: 'break-words' }"
              @update:model-value="toggle(org, $event)"
            />
          </li>
        </ul>

        <p class="text-muted text-xs">
          The posters stay yours. Organization owners can take them off their
          page, but they can't edit them.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <UButton
          color="neutral"
          variant="subtle"
          label="Not now"
          :disabled="saving"
          @click="open = false"
        />

        <UButton
          label="Add"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="selected.size === 0"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
