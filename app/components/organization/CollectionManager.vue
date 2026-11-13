<script setup lang="ts">
import type {
  OrganizationCollections,
  OrganizationListedCollection,
} from "#shared/types/collection";
import type { OrganizationRole } from "#shared/types/organization";
import { parseApiError } from "~/utils/apiError";

// The collections on an organization's page. Members add their own; an owner
// can take any of them off, but only the collection's owner edits it.

const props = defineProps<{
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}>();

const toast = useToast();

const base = computed(
  () =>
    `/api/organizations/${encodeURIComponent(props.organizationId)}/collections`,
);

const collections = ref<OrganizationCollections | null>(null);
const loadError = ref("");

async function load() {
  loadError.value = "";

  try {
    collections.value = await $fetch<OrganizationCollections>(base.value);
  } catch (err: unknown) {
    loadError.value =
      parseApiError(err).statusMessage ?? "Could not load the collections.";
  }
}

onMounted(load);
watch(() => props.organizationId, load);

function showError(title: string, err: unknown) {
  toast.add({
    title,
    description:
      parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
    color: "error",
    icon: "i-heroicons-exclamation-circle",
  });
}

function postersLabel(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "poster" : "posters"}`;
}

const selected = ref(new Set<string>());
const adding = ref(false);

function toggle(id: string, checked: boolean | "indeterminate") {
  const next = new Set(selected.value);

  if (checked === true) next.add(id);
  else next.delete(id);

  selected.value = next;
}

async function addSelected() {
  if (selected.value.size === 0 || adding.value) return;

  adding.value = true;

  try {
    await $fetch(base.value, {
      method: "POST",
      body: { collectionIds: [...selected.value] },
    });

    window.umami?.track("collection_org_listed", {
      count: selected.value.size,
    });

    selected.value = new Set();
    await load();
    toast.add({
      title: "Collections added",
      description: `They show on the ${props.organizationName} page while they are public.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not add the collections", err);
  } finally {
    adding.value = false;
  }
}

// Taking another member's collection off needs a second look, since only
// they can add it back.
const removeTarget = ref<OrganizationListedCollection | null>(null);
const removeConfirmOpen = computed({
  get: () => removeTarget.value !== null,
  set: (open) => {
    if (!open) removeTarget.value = null;
  },
});
const removingId = ref<string | null>(null);

function askRemove(collection: OrganizationListedCollection) {
  if (collection.isMine) remove(collection);
  else removeTarget.value = collection;
}

async function remove(collection: OrganizationListedCollection) {
  removingId.value = collection.collectionId;

  try {
    await $fetch(
      `${base.value}/${encodeURIComponent(collection.collectionId)}`,
      {
        method: "DELETE",
      },
    );

    window.umami?.track("collection_org_unlisted");
    removeTarget.value = null;
    await load();
    toast.add({
      title: "Collection removed from the page",
      description: "The collection itself is unchanged.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not remove the collection", err);
  } finally {
    removingId.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
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

    <UiSpinner v-else-if="!collections" :loading="true" subtle>
      <div class="h-24" />
    </UiSpinner>

    <template v-else>
      <div class="space-y-3">
        <h4 class="font-medium">
          On the page ({{ collections.listed.length.toLocaleString() }})
        </h4>

        <p v-if="collections.listed.length === 0" class="text-muted text-sm">
          No collections yet. Members choose which of their collections appear
          here.
        </p>

        <ul
          v-else
          class="divide-default border-default divide-y rounded-lg border"
        >
          <li
            v-for="collection in collections.listed"
            :key="collection.collectionId"
            class="flex items-center gap-3 p-3"
          >
            <UIcon
              name="i-lucide-library-big"
              class="text-muted size-5 shrink-0"
            />

            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="collection.path"
                class="line-clamp-2 text-sm font-medium break-words hover:underline"
              >
                {{ collection.name }}
              </NuxtLink>

              <p class="text-muted mt-0.5 text-xs">
                {{ collection.isMine ? "Yours" : `By ${collection.ownerName}` }}
                · {{ postersLabel(collection.posterCount) }}
                <template v-if="!collection.isPublic">
                  · Private, so visitors don't see it yet
                </template>
              </p>
            </div>

            <UButton
              v-if="collection.canRemove"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              label="Remove"
              :aria-label="`Remove ${collection.name} from the page`"
              :loading="removingId === collection.collectionId"
              @click="askRemove(collection)"
            />
          </li>
        </ul>
      </div>

      <div class="space-y-3">
        <h4 class="font-medium">Add your collections</h4>

        <p v-if="collections.available.length === 0" class="text-muted text-sm">
          All of your collections are on this page already, or you don't have
          any yet.
          <ULink to="/collections?new=1" class="text-primary underline"
            >Create a collection</ULink
          >.
        </p>

        <template v-else>
          <ul
            class="divide-default border-default max-h-80 divide-y overflow-y-auto rounded-lg border"
          >
            <li
              v-for="collection in collections.available"
              :key="collection.collectionId"
              class="p-3"
            >
              <UCheckbox
                :model-value="selected.has(collection.collectionId)"
                :label="collection.name"
                :description="`${postersLabel(collection.posterCount)}, ${collection.isPublic ? 'public' : 'private'}`"
                :disabled="adding"
                :ui="{ label: 'break-words' }"
                @update:model-value="toggle(collection.collectionId, $event)"
              />
            </li>
          </ul>

          <UButton
            size="sm"
            icon="i-heroicons-plus"
            :label="
              selected.size > 0
                ? `Add ${selected.size.toLocaleString()} to the page`
                : 'Add to the page'
            "
            :disabled="selected.size === 0"
            :loading="adding"
            @click="addSelected"
          />
        </template>
      </div>
    </template>

    <UModal
      v-model:open="removeConfirmOpen"
      title="Remove this collection from the page?"
      :description="`It was added by ${removeTarget?.ownerName ?? 'another member'}, and only they can add it back. The collection itself stays as it is.`"
    >
      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-3">
          <UButton
            color="neutral"
            variant="subtle"
            label="Cancel"
            @click="close"
          />

          <UButton
            color="error"
            label="Remove from page"
            icon="i-lucide-x"
            :loading="removingId !== null"
            @click="removeTarget && remove(removeTarget)"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
