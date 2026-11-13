<script setup lang="ts">
import type { MyCollection } from "#shared/types/collection";
import type { CollectionDetails } from "#shared/utils/collection";
import { parseApiError } from "~/utils/apiError";

// Managing one collection: its posters, where it's shown and its details, one
// tab each.

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { origin } = useRequestURL();
const collectionId = route.params.id as string;

const {
  data: collection,
  error,
  refresh,
} = await useFetch<MyCollection>(
  `/api/collections/${encodeURIComponent(collectionId)}`,
);

useSeoMeta({
  title: () => collection.value?.name ?? "Collection",
  robots: "noindex",
});

const publicUrl = computed(() =>
  collection.value ? `${origin}${collection.value.path}` : "",
);

// The tab lives in the address, ?tab=settings, so a link opens it.
const TABS = ["posters", "organizations", "settings"] as const;
type Tab = (typeof TABS)[number];

const tabItems = [
  { label: "Posters", value: "posters", icon: "i-lucide-image" },
  {
    label: "Organizations",
    value: "organizations",
    icon: "i-lucide-building-2",
  },
  { label: "Settings", value: "settings", icon: "i-lucide-settings" },
];

const activeTab = computed<Tab>({
  get: () => {
    const tab = route.query.tab;

    return TABS.includes(tab as Tab) ? (tab as Tab) : "posters";
  },
  set: (tab) => {
    router.replace({
      query: { ...route.query, tab: tab === "posters" ? undefined : tab },
    });
  },
});

function showError(title: string, err: unknown) {
  toast.add({
    title,
    description:
      parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
    color: "error",
    icon: "i-heroicons-exclamation-circle",
  });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    toast.add({
      title: "Link copied",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch {
    toast.add({
      title: "Could not copy the link",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  }
}

async function patch(
  body: Partial<CollectionDetails> & { isPublic?: boolean },
) {
  collection.value = await $fetch<MyCollection>(
    `/api/collections/${encodeURIComponent(collectionId)}`,
    { method: "PATCH", body },
  );
}

const updatingVisibility = ref(false);

async function setVisibility(isPublic: boolean) {
  updatingVisibility.value = true;

  try {
    await patch({ isPublic });
    window.umami?.track("collection_visibility_changed", { public: isPublic });
    toast.add({
      title: isPublic
        ? "The collection is public"
        : "The collection is private",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not update the collection", err);
  } finally {
    updatingVisibility.value = false;
  }
}

const saving = ref(false);

async function saveDetails(details: CollectionDetails) {
  saving.value = true;

  try {
    await patch(details);
    toast.add({
      title: "Collection updated",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not update the collection", err);
  } finally {
    saving.value = false;
  }
}

const deleteOpen = ref(false);
const deleting = ref(false);

async function deleteCollection() {
  deleting.value = true;

  try {
    await $fetch(`/api/collections/${encodeURIComponent(collectionId)}`, {
      method: "DELETE",
    });
    window.umami?.track("collection_deleted");
    toast.add({
      title: "Collection deleted",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    deleteOpen.value = false;
    await navigateTo("/collections");
  } catch (err: unknown) {
    showError("Could not delete the collection", err);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer>
      <UPage>
        <UEmpty
          v-if="error || !collection"
          class="py-16"
          icon="i-lucide-library-big"
          title="Collection not found"
          description="This collection doesn't exist or isn't yours."
          :actions="[
            {
              label: 'Your collections',
              to: '/collections',
              color: 'neutral',
              variant: 'subtle',
            },
          ]"
        />

        <template v-else>
          <UPageHeader
            :links="[
              {
                label:
                  collection.isPublic && !collection.hidden
                    ? 'View page'
                    : 'Preview',
                icon: 'i-heroicons-arrow-top-right-on-square',
                to: collection.path,
                color: 'neutral',
                variant: 'subtle',
              },
            ]"
          >
            <template #headline>
              <ULink
                to="/collections"
                class="text-muted hover:text-default flex items-center gap-1 text-sm"
              >
                <UIcon name="i-heroicons-arrow-left" />
                All collections
              </ULink>
            </template>

            <template #title>
              <span class="min-w-0 break-words">{{ collection.name }}</span>
            </template>

            <template #description>
              <span class="flex flex-wrap items-center gap-2 text-sm">
                <UBadge
                  v-if="collection.hidden"
                  color="error"
                  variant="subtle"
                  icon="i-heroicons-eye-slash"
                >
                  Hidden
                </UBadge>

                <UBadge
                  v-else
                  :color="collection.isPublic ? 'success' : 'neutral'"
                  variant="subtle"
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

                <span v-if="collection.conference">
                  {{ collection.conference }}
                </span>
              </span>
            </template>
          </UPageHeader>

          <UPageBody class="space-y-6">
            <UAlert
              v-if="collection.hidden"
              color="error"
              variant="subtle"
              icon="i-heroicons-eye-slash"
              title="Hidden by the Posters.science team"
              :description="`The public page is unavailable, and posters are not affected. Reason: ${collection.hiddenReason}`"
            />

            <UTabs
              v-model="activeTab"
              :items="tabItems"
              :content="false"
              class="w-full"
            />

            <UCard v-if="activeTab === 'posters'">
              <CollectionPosterManager
                :collection-id="collection.id"
                :collection-name="collection.name"
                @changed="refresh()"
              />
            </UCard>

            <UCard v-else-if="activeTab === 'organizations'">
              <CollectionOrganizationManager :collection-id="collection.id" />
            </UCard>

            <div v-else class="space-y-6">
              <UCard>
                <template #header>
                  <h2 class="text-base font-semibold">Public page</h2>
                </template>

                <div class="space-y-3">
                  <p class="text-muted text-sm">
                    {{
                      collection.hidden
                        ? "Only you and site admins can see this collection while it is hidden."
                        : collection.isPublic
                          ? "Anyone with the link can see this collection's name, description and posters, and your name as its owner. It can also appear on Discover, your public profile and organization pages. Search engines are asked not to index it."
                          : "Only you can see this collection. Make it public to share its name, description and posters, with your name as its owner."
                    }}
                  </p>

                  <div class="flex flex-wrap items-center gap-2">
                    <code
                      class="rounded bg-gray-100 px-2 py-1 text-sm break-all dark:bg-gray-800"
                    >
                      {{ publicUrl }}
                    </code>

                    <UButton
                      size="xs"
                      color="neutral"
                      variant="subtle"
                      icon="i-heroicons-clipboard"
                      label="Copy link"
                      @click="copyLink"
                    />
                  </div>

                  <template v-if="!collection.hidden">
                    <UButton
                      v-if="collection.isPublic"
                      size="sm"
                      color="warning"
                      variant="subtle"
                      icon="i-heroicons-lock-closed"
                      label="Make collection private"
                      :loading="updatingVisibility"
                      @click="setVisibility(false)"
                    />

                    <UButton
                      v-else
                      size="sm"
                      icon="i-heroicons-globe-alt"
                      label="Make collection public"
                      :loading="updatingVisibility"
                      @click="setVisibility(true)"
                    />
                  </template>
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <h2 class="text-base font-semibold">Details</h2>
                </template>

                <CollectionDetailsForm
                  :key="collection.id"
                  :initial="{
                    name: collection.name,
                    description: collection.description,
                    conference: collection.conference,
                  }"
                  submit-label="Save changes"
                  :loading="saving"
                  @submit="saveDetails"
                />
              </UCard>

              <UCard>
                <template #header>
                  <h2 class="text-base font-semibold">Delete collection</h2>
                </template>

                <div class="space-y-3">
                  <p class="text-muted text-sm">
                    {{
                      collection.hidden
                        ? "A hidden collection can't be deleted. Contact the Posters.science team if you need it removed."
                        : "This removes the collection and takes it off any organization pages. The posters themselves stay published."
                    }}
                  </p>

                  <UButton
                    size="sm"
                    color="error"
                    variant="subtle"
                    icon="i-heroicons-trash"
                    label="Delete collection"
                    :disabled="collection.hidden"
                    @click="deleteOpen = true"
                  />
                </div>
              </UCard>
            </div>
          </UPageBody>
        </template>
      </UPage>
    </UContainer>

    <UModal
      v-model:open="deleteOpen"
      title="Delete collection"
      :description="`Delete ${collection?.name ?? 'this collection'}? This can't be undone. Its posters stay published.`"
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
            label="Delete collection"
            :loading="deleting"
            @click="deleteCollection"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
