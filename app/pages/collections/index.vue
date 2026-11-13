<script setup lang="ts">
import type { CollectionDraft, MyCollection } from "#shared/types/collection";
import { parseApiError } from "~/utils/apiError";

definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Collections",
  description: "Your poster collections on Posters.science.",
  robots: "noindex",
});

const route = useRoute();
const router = useRouter();
const toast = useToast();

const { data, status, error, refresh } = await useFetch<{
  collections: MyCollection[];
}>("/api/collections");

const collections = computed(() => data.value?.collections ?? []);

// Creating happens in a side pane that lives in the address, ?new=1, so a
// link or a refresh opens it again. Managing has its own page.
const createOpen = ref(route.query.new !== undefined);

watch(
  () => route.query.new,
  (value) => {
    createOpen.value = value !== undefined;
  },
);

// Set once a collection is created, so closing the pane doesn't clear the
// address over the move to its manage page.
let leaving = false;

watch(createOpen, (isOpen) => {
  if (!isOpen && !leaving && route.query.new !== undefined) {
    router.replace({ query: {} });
  }
});

function openCreate() {
  router.replace({ query: { new: "1" } });
}

// ?fromBatch=<jobId> prefills the pane from a bulk upload. The pane waits for
// the draft so the form doesn't change under the person's cursor.
const fromBatch = computed(() =>
  typeof route.query.fromBatch === "string" ? route.query.fromBatch : null,
);
const draft = ref<CollectionDraft | null>(null);

const paneOpen = computed({
  get: () => createOpen.value && (!fromBatch.value || draft.value !== null),
  set: (value: boolean) => {
    createOpen.value = value;
  },
});

const paneDraft = computed(() =>
  draft.value && fromBatch.value
    ? {
        details: draft.value.details,
        posterIds: draft.value.posterIds,
        sourceBulkSubmissionId: fromBatch.value,
        skippedCount: draft.value.skippedCount,
      }
    : null,
);

async function loadDraft(jobId: string | null) {
  draft.value = null;

  if (!jobId) return;

  try {
    const result = await $fetch<CollectionDraft>(
      `/api/bulk-poster-submissions/${encodeURIComponent(jobId)}/collection-draft`,
    );

    if (result.existingCollection) {
      toast.add({
        title: "This upload already has a collection",
        description: result.existingCollection.name,
        color: "info",
        icon: "i-lucide-library-big",
      });
      leaving = true;
      await navigateTo(managePath(result.existingCollection.id), {
        replace: true,
      });

      return;
    }

    draft.value = result;
  } catch (err: unknown) {
    toast.add({
      title: "Could not load the bulk upload",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
    router.replace({ query: {} });
  }
}

onMounted(() => loadDraft(fromBatch.value));
watch(fromBatch, loadDraft);

function managePath(id: string) {
  return `/collections/${id}`;
}

function onCreated(collection: MyCollection) {
  leaving = true;
  navigateTo(managePath(collection.id));
}

function onExists(collectionId: string) {
  leaving = true;
  navigateTo(managePath(collectionId));
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer>
      <UPage>
        <UPageHeader
          title="Collections"
          description="Group posters you published or claimed, such as the posters from one conference or project, and share them as one page. Each poster still belongs to the person who published it."
          :links="[
            {
              label: 'New collection',
              icon: 'i-heroicons-plus',
              onClick: openCreate,
            },
          ]"
        />

        <UPageBody>
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-heroicons-exclamation-circle"
            title="Could not load your collections"
            :actions="[
              {
                label: 'Try again',
                color: 'error',
                variant: 'solid',
                onClick: () => refresh(),
              },
            ]"
          />

          <UiSpinner v-else :loading="status === 'pending'" subtle>
            <UEmpty
              v-if="collections.length === 0"
              icon="i-lucide-library-big"
              title="You don't have any collections yet"
              description="Make one for a conference, a project or a lab, then add your published or claimed posters to it."
              :actions="[
                {
                  label: 'Create a collection',
                  icon: 'i-heroicons-plus',
                  onClick: openCreate,
                },
              ]"
            />

            <ul v-else class="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <li v-for="collection in collections" :key="collection.id">
                <UCard class="h-full" :ui="{ body: 'space-y-3' }">
                  <NuxtLink :to="managePath(collection.id)" class="block">
                    <CollectionCovers :covers="collection.covers" />
                  </NuxtLink>

                  <div class="min-w-0">
                    <NuxtLink
                      :to="managePath(collection.id)"
                      class="line-clamp-2 font-semibold break-words hover:underline"
                    >
                      {{ collection.name }}
                    </NuxtLink>

                    <p
                      v-if="collection.conference"
                      class="text-muted mt-0.5 truncate text-sm"
                    >
                      {{ collection.conference }}
                    </p>
                  </div>

                  <div
                    class="text-muted flex flex-wrap items-center gap-2 text-sm"
                  >
                    <UBadge
                      v-if="collection.hidden"
                      color="error"
                      variant="subtle"
                      size="sm"
                      icon="i-heroicons-eye-slash"
                    >
                      Hidden
                    </UBadge>

                    <UBadge
                      v-else
                      :color="collection.isPublic ? 'success' : 'neutral'"
                      variant="subtle"
                      size="sm"
                      :icon="
                        collection.isPublic
                          ? 'i-heroicons-globe-alt'
                          : 'i-heroicons-lock-closed'
                      "
                    >
                      {{ collection.isPublic ? "Public" : "Private" }}
                    </UBadge>

                    <span>
                      {{ collection.posterCount.toLocaleString() }}
                      {{ collection.posterCount === 1 ? "poster" : "posters" }}
                    </span>
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      :to="collection.path"
                      size="sm"
                      color="neutral"
                      variant="subtle"
                      :label="
                        collection.isPublic && !collection.hidden
                          ? 'View page'
                          : 'Preview'
                      "
                    />

                    <UButton
                      size="sm"
                      color="neutral"
                      variant="outline"
                      icon="i-heroicons-cog-6-tooth"
                      label="Manage"
                      :to="managePath(collection.id)"
                    />
                  </div>
                </UCard>
              </li>
            </ul>
          </UiSpinner>
        </UPageBody>
      </UPage>
    </UContainer>

    <CollectionCreatePane
      v-model:open="paneOpen"
      :draft="paneDraft"
      @created="onCreated"
      @exists="onExists"
    />
  </div>
</template>
