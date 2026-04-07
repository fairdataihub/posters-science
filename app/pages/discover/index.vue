<script setup lang="ts">
import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import {
  CalendarDate,
  DateFormatter,
  getLocalTimeZone,
} from "@internationalized/date";

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Discover Posters - Posters.science")}&description=${encodeURIComponent("Find and explore scientific posters on a variety of topics.")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Discover Posters - Posters.science",
  description: "Find and explore scientific posters on a variety of topics.",
  ogTitle: "Discover Posters - Posters.science",
  ogDescription: "Find and explore scientific posters on a variety of topics.",
  ogImage,
});

const df = new DateFormatter("en-US", {
  dateStyle: "medium",
});

const dateFilterValue = shallowRef({
  start: new CalendarDate(2022, 1, 20),
  end: new CalendarDate(2022, 2, 10),
});

type Poster = {
  id: number | undefined;
  title: string;
  description: string;
  imageUrl: string;
  keywords: string[];
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  views: number;
  likes: number;
};

const PAGE_SIZE = 9;

const page = ref(1);

const sortBy = ref("Newest");
const posters = ref<Poster[]>([]);
const total = ref(0);
const searchQuery = ref("");
const committedSearch = ref("");

const mapPosters = (apiPosters: Poster[]) => {
  if (apiPosters.length > 0 || committedSearch.value) {
    return apiPosters.map((poster) => ({
      id: poster.id,
      title: poster.title ?? "Untitled poster",
      description: poster.description ?? "",
      imageUrl:
        poster.imageUrl ||
        `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.id ?? poster.title}`,
      keywords: Array.isArray(poster.keywords) ? poster.keywords : [],
      publishedAt: poster.publishedAt ? new Date(poster.publishedAt) : null,
      created: poster.created ? poster.created : new Date(),
      updated: poster.updated ? poster.updated : new Date(),
      views: typeof poster.views === "number" ? poster.views : 0,
      likes: typeof poster.likes === "number" ? poster.likes : 0,
    }));
  } else {
    return Array.from({ length: 31 }, (_, index) => ({
      id: index + 1,
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
      imageUrl: faker.image.urlPicsumPhotos({
        width: 400,
        height: 300,
        blur: 0,
      }),
      keywords: Array.from({ length: faker.number.int(10) }, () =>
        faker.lorem.word(),
      ),
      publishedAt: faker.date.past(),
      created: faker.date.past(),
      updated: faker.date.past(),
      views: faker.number.int(100),
      likes: faker.number.int(100),
    }));
  }
};

const { data, error, status } = await useFetch("/api/discover", {
  query: { search: committedSearch, page, limit: PAGE_SIZE, sortBy },
});

function triggerSearch() {
  committedSearch.value = searchQuery.value.trim();
  page.value = 1;
}

watch(sortBy, () => {
  page.value = 1;
});

watch(
  data,
  (val) => {
    if (!val) return;
    const apiPosters = (val.posters || []) as unknown as Poster[];
    posters.value = mapPosters(apiPosters);
    total.value = val.total ?? posters.value.length;
  },
  { immediate: true },
);

if (error.value) {
  console.error(error.value);
}

const totalFiltered = computed(() => total.value);
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-6">
    <UPageHeader
      title="Discover Posters"
      description="Find and explore posters on a variety of topics."
      :links="[
        {
          label: 'Smart Search',
          to: '/discover/smart-search',
          icon: 'si:ai-fill',
          size: 'lg',
          variant: 'solid' as const,
          color: 'primary' as const,
        },
      ]"
    />

    <div class="flex gap-6">
      <div :class="['block w-80 flex-shrink-0 transition-all duration-300']">
        <UCard class="sticky top-4">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Filters</h3>
            </div>
          </template>

          <div class="space-y-6">
            <div>
              <h4 class="mb-3 text-sm font-medium">Published</h4>

              <UPopover>
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-calendar"
                >
                  <template v-if="dateFilterValue.start">
                    <template v-if="dateFilterValue.end">
                      {{
                        df.format(
                          dateFilterValue.start.toDate(getLocalTimeZone()),
                        )
                      }}
                      -
                      {{
                        df.format(
                          dateFilterValue.end.toDate(getLocalTimeZone()),
                        )
                      }}
                    </template>

                    <template v-else>
                      {{
                        df.format(
                          dateFilterValue.start.toDate(getLocalTimeZone()),
                        )
                      }}
                    </template>
                  </template>

                  <template v-else> Pick a date </template>
                </UButton>

                <template #content>
                  <UCalendar
                    v-model="dateFilterValue"
                    class="p-2"
                    :number-of-months="2"
                    range
                  />
                </template>
              </UPopover>
            </div>
          </div>
        </UCard>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 pb-4">
          <UInput
            v-model="searchQuery"
            placeholder="Search posters by title, description, or keywords..."
            icon="i-lucide-search"
            @keydown.enter="triggerSearch"
          />

          <UButton
            color="primary"
            variant="outline"
            label="Search Posters"
            icon="i-lucide-search"
            @click="triggerSearch"
          />
        </div>

        <div class="flex items-center justify-between pb-4">
          <div>
            <p class="text-sm">
              {{ totalFiltered }} poster{{ totalFiltered !== 1 ? "s" : "" }}
              found
            </p>
          </div>

          <div class="flex items-center gap-2">
            <p>Sort by:</p>

            <USelect
              v-model="sortBy"
              :items="['Most viewed', 'Most liked', 'Newest', 'Oldest']"
              class="w-34"
            />
          </div>
        </div>

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
              </UCard>
            </NuxtLink>
          </UPageGrid>

          <!-- Empty State -->
          <div v-else class="py-12 text-center">
            <div
              class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full"
            >
              <Icon name="heroicons:magnifying-glass" class="h-12 w-12" />
            </div>

            <h3 class="mb-2 text-lg font-medium">No posters found</h3>

            <p class="mb-6">Try adjusting your search criteria or filters.</p>
          </div>
        </UiSpinner>

        <div class="flex justify-center pt-8 pb-4">
          <UPagination
            v-model:page="page"
            :loading="status === 'pending'"
            :total="totalFiltered"
            variant="outline"
          />
        </div>
      </div>
    </div>
  </div>
</template>
