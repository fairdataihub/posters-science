<script setup lang="ts">
import dayjs from "dayjs";
import type { ProfilePoster } from "~/components/profile/PosterCard.vue";
import { parseApiError } from "~/utils/apiError";

type PublicCollection = {
  /** Null unless the viewer owns the collection. */
  id: string | null;
  path: string;
  name: string;
  description: string;
  conference: string;
  owner: { name: string; profilePath: string | null };
  isOwner: boolean;
  /** False only for the owner and site admins previewing the page. */
  isPublic: boolean;
  isHidden: boolean;
  hiddenReason: string;
  organizations: { name: string; path: string; avatarUrl: string }[];
  created: string;
  updated: string;
  posters: ProfilePoster[];
  /** Root ids matching `?search=`, or null when there is no search. */
  searchMatches: number[] | null;
};

const route = useRoute();
const handle = route.params.handle as string;

// The search runs on the server with the Discover search syntax, so a new
// search refetches the page. Filters and sorting happen on the page.
const committedSearch = computed(() =>
  typeof route.query.search === "string" ? route.query.search : undefined,
);

const {
  data: collection,
  error,
  refresh,
} = await useFetch<PublicCollection>(
  `/api/collection/${encodeURIComponent(handle)}`,
  { query: { search: committedSearch } },
);

// Ids are matched case-insensitively. Send other spellings to the lower case
// address so there is one canonical URL per collection.
if (collection.value && collection.value.path !== route.path) {
  await navigateTo(collection.value.path, {
    redirectCode: 301,
    replace: true,
  });
}

const posterCountLabel = computed(() => {
  const count = collection.value?.posters.length ?? 0;

  return `${count.toLocaleString()} ${count === 1 ? "poster" : "posters"}`;
});

const seoDescription = computed(() => {
  if (!collection.value) return "Collection not found.";

  return (
    collection.value.description ||
    `A collection of posters by ${collection.value.owner.name} on Posters.science.`
  );
});

// The preview card shown when the page is shared, drawn by Kalai like the other
// pages. Set for X as well, which would otherwise use the site default.
const ogImage = computed(() => {
  const title = collection.value?.name ?? "Collection not found";
  const description = collection.value
    ? `${posterCountLabel.value} collected by ${collection.value.owner.name}`
    : "This collection doesn't exist or is set to private.";

  return `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&app=posters-science&org=fairdataihub`;
});

useSeoMeta({
  // The title template adds " - Posters.science".
  title: () => collection.value?.name ?? "Collection",
  description: seoDescription,
  ogTitle: () =>
    collection.value
      ? `${collection.value.name} - Posters.science`
      : "Collection - Posters.science",
  ogDescription: seoDescription,
  ogImage,
  twitterImage: ogImage,
  robots: "noindex",
});

const toast = useToast();
const makingPublic = ref(false);

async function makePublic() {
  if (!collection.value?.id) return;

  makingPublic.value = true;

  try {
    await $fetch(`/api/collections/${collection.value.id}`, {
      method: "PATCH",
      body: { isPublic: true },
    });
    window.umami?.track("collection_visibility_changed", { public: true });
    await refresh();
    toast.add({
      title: "The collection is public",
      description: "Anyone with the link can now see this page.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not update the collection",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    makingPublic.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer class="py-10">
      <UEmpty
        v-if="error || !collection"
        icon="i-lucide-library-big"
        title="Collection not found"
        description="This collection doesn't exist or is set to private."
        :actions="[
          {
            label: 'Discover posters',
            to: '/discover',
            color: 'neutral',
            variant: 'subtle',
          },
        ]"
      />

      <div v-else class="space-y-8">
        <UAlert
          v-if="collection.isHidden"
          color="error"
          variant="subtle"
          icon="i-heroicons-eye-slash"
          title="Hidden by the Posters.science team"
          :description="`Only its owner and site admins can see this page. Reason: ${collection.hiddenReason}`"
        />

        <UAlert
          v-else-if="!collection.isPublic"
          color="warning"
          variant="subtle"
          icon="i-heroicons-lock-closed"
          title="This collection is private"
          description="Only you and site admins can see this page."
          :actions="
            collection.isOwner
              ? [
                  {
                    label: 'Make collection public',
                    color: 'warning',
                    variant: 'solid',
                    icon: 'i-heroicons-globe-alt',
                    loading: makingPublic,
                    onClick: makePublic,
                  },
                ]
              : []
          "
        />

        <UCard>
          <div class="space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <p
                  class="text-muted flex items-center gap-1.5 text-sm font-medium"
                >
                  <UIcon name="i-lucide-library-big" class="size-4" />
                  Collection
                </p>

                <h1 class="min-w-0 text-2xl font-bold break-words">
                  {{ collection.name }}
                </h1>
              </div>

              <UButton
                v-if="collection.id"
                size="sm"
                color="neutral"
                variant="subtle"
                icon="i-heroicons-cog-6-tooth"
                label="Manage"
                :to="`/collections/${collection.id}`"
              />
            </div>

            <div
              class="text-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"
            >
              <span>
                By
                <NuxtLink
                  v-if="collection.owner.profilePath"
                  :to="collection.owner.profilePath"
                  class="text-default font-medium hover:underline"
                >
                  {{ collection.owner.name }}
                </NuxtLink>

                <span v-else class="text-default font-medium">
                  {{ collection.owner.name }}
                </span>
              </span>

              <UBadge color="neutral" variant="subtle">
                {{ posterCountLabel }}
              </UBadge>

              <UBadge
                v-if="collection.conference"
                color="neutral"
                variant="outline"
                icon="i-lucide-calendar"
                class="max-w-full"
              >
                <span class="truncate">{{ collection.conference }}</span>
              </UBadge>

              <span>
                Updated {{ dayjs(collection.updated).format("MMMM D, YYYY") }}
              </span>
            </div>

            <p
              v-if="collection.description"
              class="pt-1 break-words whitespace-pre-line text-gray-700 dark:text-gray-300"
            >
              {{ collection.description }}
            </p>

            <div
              v-if="collection.organizations.length > 0"
              class="flex flex-wrap items-center gap-2 pt-1 text-sm"
            >
              <span class="text-muted">Shown on</span>

              <UButton
                v-for="organization in collection.organizations"
                :key="organization.path"
                :to="organization.path"
                size="xs"
                color="neutral"
                variant="outline"
                :avatar="{ src: organization.avatarUrl, alt: '' }"
                :label="organization.name"
              />
            </div>
          </div>
        </UCard>

        <section class="space-y-6">
          <h2 class="text-lg font-semibold">
            Posters ({{ collection.posters.length }})
          </h2>

          <ProfilePosterBrowser
            :posters="collection.posters"
            :search-matches="collection.searchMatches"
            kind="posters"
            audience="collection"
            :is-owner="false"
            :empty-description="
              collection.isOwner
                ? 'Open Manage to add your published or claimed posters.'
                : 'This collection has no public posters yet.'
            "
          />
        </section>
      </div>
    </UContainer>
  </div>
</template>
