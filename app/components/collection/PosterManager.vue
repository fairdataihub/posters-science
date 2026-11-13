<script setup lang="ts">
import dayjs from "dayjs";
import type {
  CollectionListedPoster,
  CollectionPosters,
} from "#shared/types/collection";
import { parseApiError } from "~/utils/apiError";

const props = defineProps<{
  collectionId: string;
  collectionName: string;
}>();

const emit = defineEmits<{
  /** A poster was added or removed. */
  changed: [];
}>();

const toast = useToast();

const posters = ref<CollectionPosters | null>(null);
const loadError = ref("");

const base = computed(
  () => `/api/collections/${encodeURIComponent(props.collectionId)}/posters`,
);

async function load() {
  loadError.value = "";

  try {
    posters.value = await $fetch<CollectionPosters>(base.value);
  } catch (err: unknown) {
    loadError.value =
      parseApiError(err).statusMessage ?? "Could not load the posters.";
  }
}

onMounted(load);
watch(() => props.collectionId, load);

function thumbnail(poster: { posterId: number; imageUrl: string }) {
  return (
    poster.imageUrl ||
    `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.posterId}`
  );
}

function showError(title: string, err: unknown) {
  toast.add({
    title,
    description:
      parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
    color: "error",
    icon: "i-heroicons-exclamation-circle",
  });
}

// Your posters that aren't in the collection yet
const filter = ref("");
const selected = ref(new Set<number>());
const adding = ref(false);

const available = computed(() => posters.value?.available ?? []);
const remaining = computed(() => posters.value?.remaining ?? 0);
const filteredAvailable = computed(() => {
  const query = filter.value.trim().toLowerCase();

  return query
    ? available.value.filter((poster) =>
        poster.title.toLowerCase().includes(query),
      )
    : available.value;
});
const allFilteredSelected = computed(
  () =>
    filteredAvailable.value.length > 0 &&
    filteredAvailable.value.every((poster) =>
      selected.value.has(poster.posterId),
    ),
);
const overLimit = computed(() => selected.value.size > remaining.value);

function toggle(posterId: number, checked: boolean | "indeterminate") {
  const next = new Set(selected.value);

  if (checked === true) next.add(posterId);
  else next.delete(posterId);

  selected.value = next;
}

function toggleAll() {
  const next = new Set(selected.value);
  const selectAll = !allFilteredSelected.value;

  for (const poster of filteredAvailable.value) {
    if (selectAll) next.add(poster.posterId);
    else next.delete(poster.posterId);
  }

  selected.value = next;
}

// The server takes up to 200 ids a request, so large picks go in batches.
const BATCH = 200;

async function addSelected() {
  if (selected.value.size === 0 || adding.value || overLimit.value) return;

  adding.value = true;

  const ids = [...selected.value];
  let added = 0;

  try {
    for (let i = 0; i < ids.length; i += BATCH) {
      const result = await $fetch<{ added: number }>(base.value, {
        method: "POST",
        body: { posterIds: ids.slice(i, i + BATCH) },
      });

      added += result.added;
    }

    window.umami?.track("collection_posters_added", {
      count: added,
      source: "manager",
    });

    selected.value = new Set();
    toast.add({
      title:
        added === 1
          ? "1 poster added"
          : `${added.toLocaleString()} posters added`,
      description: `They're now in ${props.collectionName}.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not add the posters", err);
  } finally {
    adding.value = false;
    await load();
    emit("changed");
  }
}

const removingId = ref<number | null>(null);

async function remove(poster: CollectionListedPoster) {
  removingId.value = poster.posterId;

  try {
    await $fetch(`${base.value}/${poster.posterId}`, { method: "DELETE" });

    window.umami?.track("collection_poster_removed", { source: "manager" });

    await load();
    emit("changed");
    toast.add({
      title: "Poster removed from the collection",
      description: "The poster itself is still published.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not remove the poster", err);
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
        {
          label: 'Try again',
          color: 'error',
          variant: 'solid',
          onClick: load,
        },
      ]"
    />

    <UiSpinner v-else-if="!posters" :loading="true" subtle>
      <div class="h-24" />
    </UiSpinner>

    <template v-else>
      <div class="space-y-3">
        <h4 class="font-medium">
          In the collection ({{ posters.listed.length.toLocaleString() }})
        </h4>

        <p v-if="posters.listed.length === 0" class="text-muted text-sm">
          No posters yet. Add some of your published or claimed posters below.
        </p>

        <ul
          v-else
          class="divide-default border-default max-h-[32rem] divide-y overflow-y-auto rounded-lg border"
        >
          <li
            v-for="poster in posters.listed"
            :key="poster.posterId"
            class="flex items-center gap-3 p-3"
          >
            <img
              :src="thumbnail(poster)"
              alt=""
              class="h-14 w-12 shrink-0 rounded object-contain"
            />

            <div class="min-w-0 flex-1">
              <NuxtLink
                :to="`/discover/${poster.posterId}`"
                class="line-clamp-2 text-sm font-medium break-words hover:underline"
              >
                {{ poster.title || "Untitled poster" }}
              </NuxtLink>

              <p class="text-muted mt-0.5 text-xs">
                Added {{ dayjs(poster.addedAt).format("MMMM D, YYYY") }}
              </p>
            </div>

            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              label="Remove"
              :aria-label="`Remove ${poster.title || 'this poster'} from the collection`"
              :loading="removingId === poster.posterId"
              @click="remove(poster)"
            />
          </li>
        </ul>
      </div>

      <div class="space-y-3">
        <h4 class="font-medium">Add your posters</h4>

        <p class="text-muted text-sm">
          Published posters you shared or claimed. They stay yours, and only
          their publisher can edit them.
        </p>

        <p v-if="available.length === 0" class="text-muted text-sm">
          You have no other published or claimed posters to add. Posters you
          publish or claim later can be added here or from your dashboard.
        </p>

        <template v-else>
          <UInput
            v-if="available.length > 5"
            v-model="filter"
            icon="i-lucide-search"
            placeholder="Filter your posters by title"
            class="w-full"
          />

          <div class="flex flex-wrap items-center justify-between gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="link"
              :label="allFilteredSelected ? 'Clear selection' : 'Select all'"
              :disabled="filteredAvailable.length === 0"
              @click="toggleAll"
            />

            <UButton
              size="sm"
              icon="i-heroicons-plus"
              :label="
                selected.size > 0
                  ? `Add ${selected.size.toLocaleString()} to the collection`
                  : 'Add to the collection'
              "
              :disabled="selected.size === 0 || overLimit"
              :loading="adding"
              @click="addSelected"
            />
          </div>

          <p v-if="overLimit" class="text-warning text-sm">
            This collection has room for
            {{ remaining.toLocaleString() }} more
            {{ remaining === 1 ? "poster" : "posters" }}.
          </p>

          <p v-if="filteredAvailable.length === 0" class="text-muted text-sm">
            No posters match that title.
          </p>

          <ul
            v-else
            class="divide-default border-default max-h-96 divide-y overflow-y-auto rounded-lg border"
          >
            <li
              v-for="poster in filteredAvailable"
              :key="poster.posterId"
              class="flex items-center gap-3 p-3"
            >
              <img
                :src="thumbnail(poster)"
                alt=""
                class="h-14 w-12 shrink-0 rounded object-contain"
              />

              <UCheckbox
                :model-value="selected.has(poster.posterId)"
                :label="poster.title || 'Untitled poster'"
                :description="
                  poster.role === 'author'
                    ? 'Claimed by you'
                    : 'Published by you'
                "
                :disabled="adding"
                class="min-w-0 flex-1"
                :ui="{ label: 'line-clamp-2 break-words' }"
                @update:model-value="toggle(poster.posterId, $event)"
              />
            </li>
          </ul>
        </template>
      </div>
    </template>
  </div>
</template>
