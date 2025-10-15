<script setup lang="ts">
import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import {
  CalendarDate,
  DateFormatter,
  getLocalTimeZone,
} from "@internationalized/date";

useSeoMeta({
  title: "Discover Posters",
  description: "Discover posters on a variety of topics.",
});

const df = new DateFormatter("en-US", {
  dateStyle: "medium",
});

const dateFilterValue = shallowRef({
  start: new CalendarDate(2022, 1, 20),
  end: new CalendarDate(2022, 2, 10),
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
  tags: string[];
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  views: number;
  likes: number;
};

const page = ref(1);

const sortBy = ref("Newest");
const posters = ref<Poster[]>([]);
const total = ref(0);
const selectedTags = ref<string[]>([]);
const availableTags = ref<string[]>([]);

const { data, error } = await useFetch("/api/discover");

if (data.value) {
  posters.value = data.value.posters as unknown as Poster[];
  total.value = data.value.total;

  posters.value = Array.from({ length: 31 }, (_, index) => {
    return {
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
      tags: Array.from({ length: faker.number.int(10) }, () =>
        faker.lorem.word(),
      ),
      publishedAt: faker.date.past(),
      created: faker.date.past(),
      updated: faker.date.past(),
      views: faker.number.int(100),
      likes: faker.number.int(100),
    };
  });

  posters.value = posters.value.sort((a, b) => {
    return a.publishedAt && b.publishedAt
      ? new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      : a.created && b.created
        ? new Date(b.created).getTime() - new Date(a.created).getTime()
        : 0;
  });

  total.value = 100;
}

if (error.value) {
  console.error(error.value);
}

// Extract unique tags from all posters
const extractAvailableTags = () => {
  const allTags = new Set<string>();
  posters.value.forEach((poster) => {
    poster.tags.forEach((tag) => allTags.add(tag));
  });
  availableTags.value = Array.from(allTags).sort();
};

// Computed property for filtered posters
const filteredPosters = computed(() => {
  if (selectedTags.value.length === 0) {
    return posters.value;
  } else {
    return posters.value.filter((poster) =>
      selectedTags.value.some((selectedTag) =>
        poster.tags.includes(selectedTag),
      ),
    );
  }
});

// Computed property for total count
const totalFiltered = computed(() => filteredPosters.value.length);

// Toggle tag selection
const toggleTag = (tag: string, checked: boolean | string) => {
  const isChecked = Boolean(checked);
  if (isChecked) {
    if (!selectedTags.value.includes(tag)) {
      selectedTags.value.push(tag);
    }
  } else {
    selectedTags.value = selectedTags.value.filter((t) => t !== tag);
  }
};

// Initialize
extractAvailableTags();
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-6">
    <UPageHeader
      title="Discover Posters"
      description="Find and explore posters on a variety of topics."
    />

    <div class="flex gap-6">
      <!-- Sidebar -->
      <div :class="['block w-80 flex-shrink-0 transition-all duration-300']">
        <UCard class="sticky top-4">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Filters</h3>
            </div>
          </template>

          <div class="space-y-6">
            <!-- Date Filters -->
            <div>
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

            <!-- Tag Filters -->
            <div>
              <h4 class="mb-3 text-sm font-medium">Tags</h4>

              <div class="space-y-2">
                <div v-if="availableTags.length === 0" class="text-sm">
                  No tags available
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="tag in availableTags.slice(0, 10)"
                    :key="tag"
                    class="flex items-center"
                  >
                    <UCheckbox
                      :id="`tag-${tag}`"
                      :model-value="selectedTags.includes(tag)"
                      class="mr-2"
                      @update:model-value="(checked) => toggleTag(tag, checked)"
                    />

                    <label
                      :for="`tag-${tag}`"
                      class="flex-1 cursor-pointer text-sm"
                    >
                      {{ tag }}
                    </label>
                  </div>
                </div>

                <!-- Clear Filters -->
                <div v-if="selectedTags.length > 0" class="pt-2">
                  <UButton variant="ghost" size="xs" @click="selectedTags = []">
                    Clear all filters
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Main Content -->
      <div class="min-w-0 flex-1">
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
              :items="[
                'Most viewed',
                'Most liked',
                'Newest',
                'Oldest',
                'Random',
                'Best match',
                'Trending',
              ]"
              class="w-34"
            />
          </div>
        </div>

        <UPageGrid v-if="filteredPosters.length > 0">
          <NuxtLink
            v-for="poster in filteredPosters.slice((page - 1) * 9, page * 9)"
            :key="poster.id"
            :to="`/discover/${poster.id}`"
          >
            <UCard
              class="group flex h-full cursor-pointer flex-col overflow-hidden transition-all duration-300 hover:shadow-lg"
            >
              <div class="relative overflow-hidden">
                <NuxtImg
                  :src="poster.imageUrl"
                  :alt="poster.title"
                  class="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              <div class="flex h-full flex-col p-4">
                <div class="flex flex-1 flex-col gap-3">
                  <h3 class="line-clamp-2 text-lg font-semibold">
                    {{ poster.title }}
                  </h3>

                  <p class="line-clamp-3 text-sm leading-relaxed">
                    {{ poster.description }}
                  </p>

                  <!-- Tags -->
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="tag in poster.tags.slice(0, 3)"
                      :key="tag"
                      color="neutral"
                      variant="soft"
                    >
                      {{ tag }}
                    </UBadge>

                    <UBadge
                      v-if="poster.tags.length > 3"
                      color="neutral"
                      variant="soft"
                      size="xs"
                    >
                      +{{ poster.tags.length - 3 }}
                    </UBadge>
                  </div>
                </div>

                <!-- Author Info and Footer - Aligned to bottom -->
                <div class="mt-auto space-y-2">
                  <!-- Author Info -->
                  <div
                    class="flex items-center gap-3 border-t border-gray-100 pt-2"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium">
                        {{ poster.user.givenName }} {{ poster.user.familyName }}
                      </p>
                    </div>
                  </div>

                  <!-- Stats and Date -->
                  <div
                    class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs"
                  >
                    <div class="flex items-center gap-4">
                      <span class="flex items-center gap-1">
                        <Icon name="heroicons:eye" class="h-3 w-3" />
                        {{ poster.views }}
                      </span>

                      <span class="flex items-center gap-1">
                        <Icon name="heroicons:heart" class="h-3 w-3" />
                        {{ poster.likes }}
                      </span>
                    </div>

                    <span class="flex items-center gap-1">
                      <Icon name="heroicons:calendar-days" class="h-3 w-3" />
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

        <div class="flex justify-center pt-8 pb-4">
          <UPagination
            v-model:page="page"
            :total="totalFiltered"
            variant="outline"
          />
        </div>
      </div>
    </div>
  </div>
</template>
