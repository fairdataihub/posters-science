<script setup lang="ts">
import dayjs from "dayjs";
import { LICENSE_OPTIONS } from "~/utils/poster_schema";
import { normalizeDoi, validateDoi } from "~/utils/doi";

definePageMeta({
  middleware: ["auth"],
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Posters.science")}&description=${encodeURIComponent("Manage and track your scientific posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Dashboard - Posters.science",
  description: "Manage and track your scientific posters.",
  ogTitle: "Dashboard - Posters.science",
  ogDescription: "Manage and track your scientific posters.",
  ogImage,
});

type Poster = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  status: "draft" | "downloaded" | "published";
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  posterMetadata: {
    publisher: string | null;
    publicationYear: number | null;
    doi: string | null;
    license: string | null;
  };
  extractionJob?: {
    status: string;
  } | null;
};

const posters = ref<Poster[]>([]);

const { data, error, refresh } = await useFetch("/api/poster");

if (data.value) {
  posters.value = data.value as unknown as Poster[];
}

if (error.value) {
  console.error(error.value);
}

// Publication info modal state
const modalOpen = ref(false);
const modalPoster = ref<Poster | null>(null);
const modalDoi = ref("");
const modalLicense = ref("");
const modalPublisher = ref("");
const isSaving = ref(false);
const doiError = ref("");
const toast = useToast();

const regeneratingThumbnailIds = ref<number[]>([]);
const thumbnailCacheBust = reactive<Record<number, number>>({});

const expandedDescriptions = ref(new Set<number>());

function toggleDescription(posterId: number) {
  const updated = new Set(expandedDescriptions.value);
  if (updated.has(posterId)) {
    updated.delete(posterId);
  } else {
    updated.add(posterId);
  }
  expandedDescriptions.value = updated;
}

async function regenerateThumbnail(poster: Poster) {
  regeneratingThumbnailIds.value = [
    ...regeneratingThumbnailIds.value,
    poster.id,
  ];

  try {
    await $fetch<{ success: boolean }>(`/api/poster/${poster.id}/thumbnail`, {
      method: "POST",
    });

    thumbnailCacheBust[poster.id] = Date.now();

    toast.add({
      title: "Thumbnail regenerated",
      description:
        "The poster thumbnail has been updated. It may take a few minutes to reflect the changes.",
      color: "success",
    });
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem regenerating the thumbnail.",
      color: "error",
    });
  } finally {
    regeneratingThumbnailIds.value = regeneratingThumbnailIds.value.filter(
      (id) => id !== poster.id,
    );
  }
}

// Delete draft state
const deleteModalOpen = ref(false);
const posterToDelete = ref<Poster | null>(null);
const isDeleting = ref(false);

function openDeleteModal(poster: Poster) {
  posterToDelete.value = poster;
  deleteModalOpen.value = true;
}

async function deletePoster() {
  if (!posterToDelete.value) return;

  isDeleting.value = true;

  try {
    await $fetch(`/api/poster/${posterToDelete.value.id}`, {
      method: "DELETE",
    });

    toast.add({
      title: "Poster deleted",
      description: "Your draft poster has been deleted.",
      color: "success",
    });

    deleteModalOpen.value = false;
    await refresh();
    posters.value = data.value as unknown as Poster[];
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem deleting the poster.",
      color: "error",
    });
  } finally {
    isDeleting.value = false;
  }
}

function openPublicationModal(poster: Poster) {
  modalPoster.value = poster;
  modalDoi.value = poster.posterMetadata.doi ?? "";
  modalLicense.value = poster.posterMetadata.license ?? "";
  modalPublisher.value = poster.posterMetadata.publisher ?? "";
  doiError.value = "";
  modalOpen.value = true;
}

async function savePublicationInfo() {
  if (!modalPoster.value) return;

  doiError.value = validateDoi(modalDoi.value);
  if (doiError.value) return;

  isSaving.value = true;

  try {
    await $fetch(`/api/poster/${modalPoster.value.id}/publication`, {
      method: "PATCH",
      body: {
        doi: modalDoi.value ? normalizeDoi(modalDoi.value) : undefined,
        license: modalLicense.value || undefined,
        publisher: modalPublisher.value || undefined,
      },
    });

    toast.add({
      title: "Publication Info Saved",
      description: "Your poster record has been updated.",
      color: "success",
    });

    modalOpen.value = false;
    await refresh();
    posters.value = data.value as unknown as Poster[];
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem saving your publication info.",
      color: "error",
    });
  } finally {
    isSaving.value = false;
  }
}

const getImage = (poster: Poster) => {
  if (poster.status === "published") {
    return poster.imageUrl;
  }
  const bust = thumbnailCacheBust[poster.id];

  return `/api/poster/${poster.id}/thumbnail${bust ? `?t=${bust}` : ""}`;
};
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageHeader
      title="Dashboard"
      description="Keep track of all your submitted posters."
      :links="[
        {
          label: 'Share a Poster',
          to: '/share/new',
          icon: 'heroicons:plus',
          color: 'primary' as const,
        },
      ]"
    />

    <UPageList class="max-md:flex max-md:flex-col max-md:gap-4">
      <UPageCard
        v-for="(poster, index) in posters"
        :key="index + 1"
        variant="ghost"
        class="group h-50 cursor-pointer overflow-hidden rounded-none border-t border-b border-gray-100 transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm max-md:hover:shadow-md dark:max-md:border-gray-800 dark:max-md:bg-gray-950"
        @click="navigateTo(`/share/${poster.id}`)"
      >
        <div
          class="flex h-full gap-8 max-md:h-auto max-md:flex-col max-md:gap-0"
        >
          <div
            class="h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b max-md:border-gray-100 dark:max-md:border-gray-800"
          >
            <img
              :src="
                getImage(poster) ||
                `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.id}`
              "
              :alt="poster.title"
              class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 max-md:h-full max-md:max-h-none max-md:p-3"
            />
          </div>

          <div
            class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
          >
            <div class="flex flex-col gap-2">
              <h3 class="line-clamp-2 text-lg font-semibold">
                {{ poster.title || "No title available" }}
              </h3>

              <div class="flex flex-col gap-1">
                <p
                  :class="[
                    'text-sm',
                    expandedDescriptions.has(poster.id) ? '' : 'line-clamp-2',
                  ]"
                >
                  {{ poster.description || "No description available" }}
                </p>

                <button
                  v-if="(poster.description?.length ?? 0) > 100"
                  class="text-primary w-fit text-left text-xs font-medium md:hidden"
                  @click.stop="toggleDescription(poster.id)"
                >
                  {{
                    expandedDescriptions.has(poster.id)
                      ? "Show less"
                      : "Show more"
                  }}
                </button>
              </div>
            </div>

            <div
              class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs max-md:flex-wrap max-md:gap-y-2 dark:border-gray-800"
            >
              <div
                class="flex items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1"
              >
                <span class="flex items-center gap-1">
                  <Icon name="heroicons:calendar-days" class="h-3 w-3" />

                  Created
                  {{ dayjs(poster.created).format("MMMM D, YYYY") }}
                </span>

                <span
                  v-if="poster.publishedAt"
                  class="flex items-center gap-1 border-l border-gray-100 pl-2 max-md:border-l-0 max-md:pl-0 dark:border-gray-800"
                >
                  <Icon
                    name="heroicons:presentation-chart-bar"
                    class="h-3 w-3"
                  />
                  Published at
                  {{ dayjs(poster.publishedAt).format("MMMM D, YYYY") }}
                </span>
              </div>

              <div class="flex items-center gap-2 max-md:flex-wrap">
                <UButton
                  v-if="poster.status === 'downloaded'"
                  color="secondary"
                  variant="subtle"
                  label="Add publication metadata"
                  icon="heroicons:plus"
                  size="xs"
                  @click.stop="openPublicationModal(poster)"
                />

                <UTooltip text="Regenerate the thumbnail for this poster">
                  <UButton
                    v-if="
                      poster.status === 'draft' ||
                      poster.status === 'downloaded'
                    "
                    color="neutral"
                    variant="ghost"
                    label=""
                    :disabled="regeneratingThumbnailIds.includes(poster.id)"
                    icon="heroicons:arrow-path"
                    size="xs"
                    :loading="regeneratingThumbnailIds.includes(poster.id)"
                    @click.stop="regenerateThumbnail(poster)"
                  />
                </UTooltip>

                <UButton
                  v-if="
                    poster.status === 'draft' || poster.status === 'downloaded'
                  "
                  color="error"
                  variant="ghost"
                  label=""
                  icon="heroicons:trash"
                  size="xs"
                  @click.stop="openDeleteModal(poster)"
                />

                <UBadge
                  :color="
                    poster.status === 'published'
                      ? 'success'
                      : poster.status === 'downloaded'
                        ? 'primary'
                        : poster.extractionJob?.status ===
                              'pending-extraction' ||
                            poster.extractionJob?.status === 'processing'
                          ? 'secondary'
                          : 'warning'
                  "
                  variant="solid"
                  size="sm"
                >
                  {{
                    poster.status === "published"
                      ? "Published"
                      : poster.status === "downloaded"
                        ? "Downloaded"
                        : poster.extractionJob?.status ===
                              "pending-extraction" ||
                            poster.extractionJob?.status === "processing"
                          ? "Pending"
                          : "Draft"
                  }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </UPageCard>
    </UPageList>

    <div v-if="posters.length === 0" class="py-12 text-center">
      <div
        class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100"
      >
        <Icon name="heroicons:document-text" class="h-12 w-12 text-gray-400" />
      </div>

      <h3 class="mb-2 text-lg font-medium text-gray-900">No posters yet</h3>

      <p class="mb-6 text-gray-500">
        Get started by sharing your first poster.
      </p>
    </div>

    <!-- Delete draft modal -->
    <UModal v-model:open="deleteModalOpen" title="Delete Draft Poster">
      <template #body>
        <p class="text-sm">
          Are you sure you want to delete
          <span class="font-medium">{{
            posterToDelete?.title || "this poster"
          }}</span
          >? This cannot be undone.
        </p>
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" @click="deleteModalOpen = false">
            Cancel
          </UButton>

          <UButton color="error" :loading="isDeleting" @click="deletePoster">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Publication info modal -->
    <UModal v-model:open="modalOpen" title="Update Publication Information">
      <template #body>
        <p class="text-muted mb-4 text-sm">
          Now that your poster has been shared, add the details below to keep
          your record up to date.
        </p>

        <div class="space-y-4">
          <UFormField label="DOI" name="doi" :error="doiError">
            <UInput
              v-model="modalDoi"
              placeholder="e.g. 10.5281/zenodo.1234567 or https://doi.org/..."
              class="w-full"
              @input="doiError = ''"
            />
          </UFormField>

          <UFormField label="License" name="license">
            <USelect
              v-model="modalLicense"
              :items="LICENSE_OPTIONS"
              placeholder="Select a license"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Publisher" name="publisher">
            <UInput
              v-model="modalPublisher"
              placeholder="e.g. Zenodo, Figshare"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" @click="modalOpen = false">
            Cancel
          </UButton>

          <UButton
            color="primary"
            :loading="isSaving"
            @click="savePublicationInfo"
          >
            Save
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
