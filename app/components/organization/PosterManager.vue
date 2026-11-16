<script setup lang="ts">
import dayjs from "dayjs";
import type {
  OrganizationListedPoster,
  OrganizationPosters,
  OrganizationRole,
} from "#shared/types/organization";
import { parseApiError } from "~/utils/apiError";

const props = defineProps<{
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}>();

const emit = defineEmits<{
  /** A poster was added or removed. */
  changed: [];
}>();

const toast = useToast();

const posters = ref<OrganizationPosters | null>(null);
const loadError = ref("");

async function load() {
  loadError.value = "";

  try {
    posters.value = await $fetch<OrganizationPosters>(
      `/api/organizations/${encodeURIComponent(props.organizationId)}/posters`,
    );
  } catch (err: unknown) {
    loadError.value =
      parseApiError(err).statusMessage ?? "Could not load the posters.";
  }
}

onMounted(load);
watch(() => props.organizationId, load);

function thumbnail(poster: { posterId: number; imageUrl: string }) {
  return (
    poster.imageUrl ||
    `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.posterId}`
  );
}

function addedByLabel(poster: OrganizationListedPoster) {
  if (poster.addedByMe) return "Added by you";
  if (!poster.addedByMember)
    return `Added by ${poster.addedByName}, a former member,`;

  return `Added by ${poster.addedByName}`;
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

// Your own posters that aren't on the page yet
const filter = ref("");
const selected = ref(new Set<number>());
const adding = ref(false);

const available = computed(() => posters.value?.available ?? []);
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

async function addSelected() {
  if (selected.value.size === 0 || adding.value) return;

  adding.value = true;

  try {
    const { added } = await $fetch<{ added: number }>(
      `/api/organizations/${encodeURIComponent(props.organizationId)}/posters`,
      { method: "POST", body: { posterIds: [...selected.value] } },
    );

    selected.value = new Set();
    await load();
    emit("changed");
    toast.add({
      title:
        added === 1
          ? "1 poster added"
          : `${added.toLocaleString()} posters added`,
      description: `They now show on the ${props.organizationName} page.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not add the posters", err);
  } finally {
    adding.value = false;
  }
}

// Taking a poster off the page
const removeTarget = ref<OrganizationListedPoster | null>(null);

// Only the person who added a listing can add it back, and only while they
// are still a member.
const removeDescription = computed(() => {
  const target = removeTarget.value;
  const name = target?.addedByName ?? "another member";
  const comeBack = target?.addedByMember
    ? "only they can add it back"
    : "they have left the organization, so it can only come back if they rejoin";

  return `It was added by ${name}, and ${comeBack}. The poster itself stays published and keeps its owner.`;
});

const removeConfirmOpen = computed({
  get: () => removeTarget.value !== null,
  set: (open) => {
    if (!open) removeTarget.value = null;
  },
});
const removingId = ref<number | null>(null);

function askRemove(poster: OrganizationListedPoster) {
  // Only someone else's poster needs a second look, since its member is the
  // only one who can add it back.
  if (poster.addedByMe) remove(poster);
  else removeTarget.value = poster;
}

async function remove(poster: OrganizationListedPoster) {
  removingId.value = poster.posterId;

  try {
    await $fetch(
      `/api/organizations/${encodeURIComponent(props.organizationId)}/posters/${poster.posterId}`,
      { method: "DELETE" },
    );

    removeTarget.value = null;
    await load();
    emit("changed");
    toast.add({
      title: "Poster removed from the page",
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
          On the page ({{ posters.listed.length.toLocaleString() }})
        </h4>

        <p v-if="posters.listed.length === 0" class="text-muted text-sm">
          No posters are showing yet. Members choose which of their published
          posters appear here.
        </p>

        <ul
          v-else
          class="divide-default border-default divide-y rounded-lg border"
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
                {{ addedByLabel(poster) }}
                on {{ dayjs(poster.addedAt).format("MMMM D, YYYY") }}
              </p>
            </div>

            <UButton
              v-if="poster.canRemove"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              label="Remove"
              :aria-label="`Remove ${poster.title || 'this poster'} from the page`"
              :loading="removingId === poster.posterId"
              @click="askRemove(poster)"
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
                  ? `Add ${selected.size.toLocaleString()} to the page`
                  : 'Add to the page'
              "
              :disabled="selected.size === 0"
              :loading="adding"
              @click="addSelected"
            />
          </div>

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

    <UModal
      v-model:open="removeConfirmOpen"
      title="Remove this poster from the page?"
      :description="removeDescription"
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
