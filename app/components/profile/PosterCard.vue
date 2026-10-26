<script setup lang="ts">
import dayjs from "dayjs";

export type ProfilePoster = {
  posterId: number;
  versionId: number;
  /** How the profile owner relates to the poster. Null for liked posters. */
  role: "publisher" | "author" | null;
  /** When it joined this list: published, claimed or liked. */
  addedAt: string | null;
  title: string;
  description: string;
  imageUrl: string;
  automated: boolean;
  created: string;
  updated: string;
  publishedAt: string | null;
  keywords: string[];
  language: string | null;
  languageLabel: string | null;
  license: string | null;
  likes: number;
  doi: string | null;
  publicationYear: number | null;
  conferenceName: string | null;
  conferenceAcronym: string | null;
  conferenceYear: number | null;
};

const props = defineProps<{
  poster: ProfilePoster;
  /** Search terms to mark, as on the Discover cards. */
  highlight?: { title: string[]; description: string[]; keyword: string[] };
}>();

const ROLE_BADGES = {
  publisher: {
    label: "Publisher",
    color: "success",
    icon: "i-lucide-upload",
    tooltip: "Shared on Posters.science by this author.",
  },
  author: {
    label: "Author",
    color: "info",
    icon: "i-lucide-user-check",
    tooltip: "Claimed by this author as one of the poster's authors.",
  },
} as const;

const roleBadge = computed(() =>
  props.poster.role ? ROLE_BADGES[props.poster.role] : null,
);

const subtitle = computed(() => {
  const year = props.poster.conferenceYear ?? props.poster.publicationYear;

  return [props.poster.conferenceName || props.poster.conferenceAcronym, year]
    .filter(Boolean)
    .join(", ");
});

const fallbackImage = computed(
  () => `https://api.dicebear.com/9.x/shapes/svg?seed=${props.poster.posterId}`,
);

// Same fallback as the Discover cards when a thumbnail fails to load.
function onImageError(event: Event) {
  const img = event.target as HTMLImageElement;

  if (img.src === fallbackImage.value) return;

  img.src = fallbackImage.value;
}
</script>

<template>
  <!-- Matches the Discover cards, plus the author's role and the conference
       so a profile reads as a list of their work. -->
  <NuxtLink :to="`/discover/${poster.posterId}`" class="relative h-full">
    <UCard
      class="group relative flex h-full flex-1 cursor-pointer flex-col shadow-sm ring-0 transition-shadow duration-300 hover:shadow-md"
    >
      <div class="relative h-full flex-1">
        <div class="relative overflow-hidden">
          <img
            :src="poster.imageUrl || fallbackImage"
            :alt="poster.title"
            loading="lazy"
            class="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-105"
            @error="onImageError"
          />

          <UTooltip
            v-if="poster.automated"
            text="This poster was picked up by our automated system."
          >
            <UBadge
              color="primary"
              variant="solid"
              size="xs"
              icon="i-lucide-sparkles"
              class="absolute top-2 left-2 z-10 cursor-help"
            >
              Auto-indexed
            </UBadge>
          </UTooltip>

          <UTooltip v-if="roleBadge" :text="roleBadge.tooltip">
            <UBadge
              :color="roleBadge.color"
              variant="solid"
              size="xs"
              :icon="roleBadge.icon"
              class="absolute top-2 right-2 z-10 cursor-help"
            >
              {{ roleBadge.label }}
            </UBadge>
          </UTooltip>
        </div>

        <div class="relative flex flex-col justify-between gap-2 p-2">
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <h3 class="line-clamp-2 text-lg font-semibold">
                <SearchHighlight
                  :text="poster.title || 'Untitled poster'"
                  :term="highlight?.title"
                />
              </h3>

              <p
                v-if="subtitle"
                class="text-muted flex items-center gap-1 text-sm"
                :title="subtitle"
              >
                <Icon
                  name="heroicons:presentation-chart-bar"
                  class="shrink-0"
                />

                <span class="line-clamp-1">{{ subtitle }}</span>
              </p>
            </div>

            <p class="line-clamp-3 text-sm leading-relaxed">
              <SearchHighlight
                :text="poster.description"
                :term="highlight?.description"
              />
            </p>

            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="tag in poster.keywords.slice(0, 2)"
                :key="tag"
                color="neutral"
                variant="soft"
                class="capitalize"
              >
                <SearchHighlight :text="tag" :term="highlight?.keyword" />
              </UBadge>

              <UBadge
                v-if="poster.keywords.length > 2"
                color="neutral"
                variant="soft"
              >
                + {{ poster.keywords.length - 2 }}
              </UBadge>
            </div>
          </div>

          <div
            class="flex items-center justify-between border-t border-gray-100 pt-2 text-sm"
          >
            <div class="flex items-center gap-4">
              <span class="flex items-center gap-1">
                <Icon name="heroicons:heart" />
                {{ poster.likes }}
              </span>
            </div>

            <span class="flex items-center gap-1">
              <Icon name="heroicons:calendar-days" />
              {{ dayjs(poster.created).format("MMM D, YYYY") }}
            </span>
          </div>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
