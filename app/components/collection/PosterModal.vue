<script setup lang="ts">
import type {
  MyCollection,
  PosterCollectionChoice,
  PosterCollectionChoices,
} from "#shared/types/collection";
import { COLLECTION_NAME_MAX } from "#shared/utils/collection";
import { parseApiError } from "~/utils/apiError";

// Which of your collections hold one poster. A new collection can be made
// right here, with the poster already in it.

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  choices: PosterCollectionChoices | null;
}>();

const emit = defineEmits<{
  saved: [choices: PosterCollectionChoices];
}>();

const toast = useToast();
const selected = ref(new Set<string>());
const saving = ref(false);

// A collection made in this pop-up already holds the poster.
const created = ref<PosterCollectionChoice[]>([]);

watch(
  () => props.choices,
  (choices) => {
    created.value = [];
    selected.value = new Set(
      choices?.collections.filter((c) => c.listed).map((c) => c.id),
    );
  },
  { immediate: true },
);

const collections = computed(() => [
  ...created.value,
  ...(props.choices?.collections ?? []),
]);

function locked(collection: PosterCollectionChoice) {
  if (collection.listed) return false;

  return !props.choices?.canAdd || collection.full;
}

function note(collection: PosterCollectionChoice) {
  if (collection.full && !collection.listed) return "Full";
  if (collection.hidden) return "Hidden by the Posters.science team";

  return collection.isPublic ? "Public" : "Private";
}

function toggle(id: string, checked: boolean | "indeterminate") {
  const next = new Set(selected.value);

  if (checked === true) next.add(id);
  else next.delete(id);

  selected.value = next;
}

const changed = computed(() =>
  collections.value.some((c) => c.listed !== selected.value.has(c.id)),
);

// New collection, inline
const newName = ref("");
const creating = ref(false);
const canCreate = computed(
  () => !!props.choices?.canAdd && !!props.choices?.canCreate,
);

async function createCollection() {
  const name = newName.value.trim();

  if (!props.choices || !name || creating.value) return;

  creating.value = true;

  try {
    const collection = await $fetch<MyCollection>("/api/collections", {
      method: "POST",
      body: {
        name,
        posterIds: [props.choices.posterId],
        source: "poster_modal",
      },
    });

    window.umami?.track("collection_created", { source: "poster_modal" });

    created.value = [
      {
        id: collection.id,
        name: collection.name,
        path: collection.path,
        isPublic: false,
        hidden: false,
        listed: true,
        full: false,
      },
      ...created.value,
    ];
    selected.value = new Set([...selected.value, collection.id]);
    newName.value = "";

    toast.add({
      title: `${collection.name} created`,
      description:
        "The poster is in it. Make it public from Collections when you're ready.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not create the collection",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    creating.value = false;
  }
}

async function save() {
  if (!props.choices || saving.value) return;

  saving.value = true;

  const before = new Set(
    collections.value.filter((c) => c.listed).map((c) => c.id),
  );

  try {
    const result = await $fetch<PosterCollectionChoices>(
      `/api/poster/${props.choices.posterId}/collections`,
      { method: "PUT", body: { collectionIds: [...selected.value] } },
    );

    const added = [...selected.value].filter((id) => !before.has(id)).length;
    const removed = [...before].filter((id) => !selected.value.has(id)).length;

    if (added > 0) {
      window.umami?.track("collection_posters_added", {
        count: added,
        source: "poster_modal",
      });
    }

    if (removed > 0) {
      window.umami?.track("collection_poster_removed", {
        source: "poster_modal",
      });
    }

    toast.add({
      title: "Collections saved",
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
    title="Collections"
    description="Choose which of your collections hold this poster."
    :dismissible="!saving && !creating"
  >
    <template #body>
      <div v-if="choices" class="space-y-4">
        <UAlert
          v-if="!choices.canAdd"
          color="warning"
          variant="subtle"
          icon="i-heroicons-information-circle"
          title="This poster can't be added right now"
          description="Only published posters you published or claimed can go in a collection. You can still take it out of one."
        />

        <ul
          v-if="collections.length > 0"
          class="divide-default border-default max-h-72 divide-y overflow-y-auto rounded-lg border"
        >
          <li
            v-for="collection in collections"
            :key="collection.id"
            class="flex items-center gap-3 p-3"
          >
            <UCheckbox
              :model-value="selected.has(collection.id)"
              :disabled="locked(collection) || saving"
              :label="collection.name"
              :description="note(collection)"
              class="min-w-0 flex-1"
              :ui="{ label: 'break-words' }"
              @update:model-value="toggle(collection.id, $event)"
            />
          </li>
        </ul>

        <p v-else class="text-muted text-sm">
          You don't have any collections yet. Name one below to start it with
          this poster.
        </p>

        <form
          v-if="canCreate"
          class="flex items-end gap-2"
          @submit.prevent="createCollection"
        >
          <UFormField label="New collection" class="min-w-0 flex-1">
            <UInput
              v-model="newName"
              :maxlength="COLLECTION_NAME_MAX"
              placeholder="Name"
              class="w-full"
              :disabled="creating || saving"
            />
          </UFormField>

          <UButton
            type="submit"
            color="neutral"
            variant="subtle"
            icon="i-heroicons-plus"
            label="Create"
            :loading="creating"
            :disabled="!newName.trim() || saving"
          />
        </form>

        <p class="text-muted text-xs">
          The poster stays yours. A collection only groups posters for viewing.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <UButton
          color="neutral"
          variant="subtle"
          label="Cancel"
          :disabled="saving || creating"
          @click="open = false"
        />

        <UButton
          label="Save"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="!changed || creating"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
