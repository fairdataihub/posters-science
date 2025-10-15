<script setup lang="ts">
import { faker } from "@faker-js/faker";
import dayjs from "dayjs";

useSeoMeta({
  title: "Smart Search",
  description: "Smart search for posters",
});

type Poster = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  user: {
    givenName: string;
    familyName: string;
  };
  keywords: string[];
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  views: number;
  likes: number;
};

const searchQuery = ref("");
const searchCompleted = ref(false);
const loading = ref(false);
const posters = ref<Poster[]>([]);
const loadingTime = ref(0);

const smartSearch = () => {
  loading.value = true;
  const startTime = Date.now();

  setTimeout(
    () => {
      searchCompleted.value = true;
      loading.value = false;
      const endTime = Date.now();
      loadingTime.value = endTime - startTime;

      posters.value = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        title: faker.lorem.sentence(),
        description: faker.lorem.paragraph(),
        imageUrl: faker.image.urlPicsumPhotos({
          width: 400,
          height: 300,
          blur: 0,
        }),
        user: {
          givenName: faker.person.firstName(),
          familyName: faker.person.lastName(),
        },
        keywords: Array.from({ length: faker.number.int(10) }, () =>
          faker.lorem.word(),
        ),
        publishedAt: faker.date.past(),
        created: faker.date.past(),
        updated: faker.date.past(),
        views: faker.number.int(100),
        likes: faker.number.int(100),
      }));
    },
    faker.number.int({ min: 3000, max: 5000 }),
  );
};
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageCTA
      title="Find posters faster with AI-powered natural language search"
      description="Experience lightning-fast poster discovery. Our advanced AI uses natural language understanding to instantly find the most relevant posters for your query. Just type your search and let the magic happen."
      variant="naked"
    >
      <template #body>
        <div class="flex flex-col items-center justify-center gap-4">
          <UTextarea
            v-model="searchQuery"
            placeholder="What new discoveries were presented at ARVO 2025 regarding the connection between the eye and Alzheimer's disease?"
            class="w-1/2 !text-center text-lg"
            autofocus
            highlight
            :disabled="loading"
            variant="soft"
            size="lg"
          />

          <UButton
            color="primary"
            size="lg"
            icon="si:ai-fill"
            label="Smart Search"
            :loading="loading"
            @click="smartSearch"
          />

          <div v-if="searchCompleted" class="mt-2 text-center">
            <UBadge color="success" variant="soft" icon="heroicons:clock">
              Search completed in {{ (loadingTime / 1000).toFixed(2) }}s
            </UBadge>
          </div>
        </div>
      </template>
    </UPageCTA>

    <div v-if="searchCompleted">
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

                <div class="flex flex-col">
                  <p
                    class="truncate border-t border-gray-100 py-2 text-sm font-medium"
                  >
                    {{ poster.user.givenName }} {{ poster.user.familyName }}
                  </p>

                  <div
                    class="flex items-center justify-between border-t border-gray-100 pt-2 text-sm"
                  >
                    <div class="flex items-center gap-4">
                      <span class="flex items-center gap-1">
                        <Icon name="heroicons:eye" />
                        {{ poster.views }}
                      </span>

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
            </div>
          </UCard>
        </NuxtLink>
      </UPageGrid>
    </div>
  </div>
</template>
