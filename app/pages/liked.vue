<script setup lang="ts">
import dayjs from "dayjs";

definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Liked Posters - Posters.science",
  description: "Posters you have liked on Posters.science.",
  ogTitle: "Liked Posters - Posters.science",
  ogDescription: "Posters you have liked on Posters.science.",
});

type LikedPoster = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  keywords: string[];
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  views: number;
  likes: number;
  likedAt: Date;
};

const { data, error, status } = await useFetch("/api/user/liked");

const posters = computed<LikedPoster[]>(() => {
  if (!data.value) return [];

  return (data.value as unknown as LikedPoster[]).map((poster) => ({
    ...poster,
    title: poster.title ?? "Untitled poster",
    description: poster.description ?? "",
    imageUrl:
      poster.imageUrl ||
      `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.id ?? poster.title}`,
    keywords: Array.isArray(poster.keywords) ? poster.keywords : [],
    publishedAt: poster.publishedAt ? new Date(poster.publishedAt) : null,
  }));
});

if (error.value) {
  console.error(error.value);
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageHeader
      title="Liked Posters"
      description="Posters you have liked."
      :links="[
        {
          label: 'Discover Posters',
          to: '/discover',
          icon: 'heroicons:magnifying-glass',
          color: 'primary' as const,
          variant: 'outline' as const,
        },
      ]"
    />

    <UiSpinner :loading="status === 'pending'" overlay>
      <UPageGrid v-if="posters.length > 0">
        <NuxtLink
          v-for="poster in posters"
          :key="poster.id"
          :to="`/discover/${poster.id}`"
          class="relative h-full"
        >
          <UCard
            class="group relative flex h-full flex-1 cursor-pointer flex-col transition-all duration-300 hover:shadow-lg"
          >
            <div class="relative h-full flex-1">
              <div class="relative overflow-hidden">
                <NuxtImg
                  :src="poster.imageUrl"
                  :alt="poster.title"
                  class="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              <div class="relative flex flex-col justify-between gap-2 p-2">
                <div class="flex flex-col gap-3">
                  <h3 class="line-clamp-2 text-lg font-semibold">
                    {{ poster.title }}
                  </h3>

                  <p class="line-clamp-3 text-sm leading-relaxed">
                    {{ poster.description }}
                  </p>

                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="tag in poster.keywords.slice(0, 2)"
                      :key="tag"
                      color="neutral"
                      variant="soft"
                      class="capitalize"
                    >
                      {{ tag }}
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
                      <Icon name="heroicons:heart" class="text-red-500" />
                      {{ poster.likes }}
                    </span>
                  </div>

                  <span class="flex items-center gap-1 text-xs">
                    <Icon name="heroicons:clock" />
                    Liked {{ dayjs(poster.likedAt).format("MMM D, YYYY") }}
                  </span>
                </div>
              </div>
            </div>
          </UCard>
        </NuxtLink>
      </UPageGrid>

      <UEmpty
        v-else-if="status !== 'pending'"
        icon="heroicons:heart"
        title="No liked posters yet"
        description="Explore posters and like the ones you find interesting."
      >
        <template #actions>
          <UButton to="/discover" label="Discover Posters" color="primary" />
        </template>
      </UEmpty>
    </UiSpinner>
  </div>
</template>
