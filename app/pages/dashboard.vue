<script setup lang="ts">
import dayjs from "dayjs";

definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Dashboard",
});

type Poster = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  status: string;
  publishedAt: Date | null;
  created: Date;
  updated: Date;
};

const posters = ref<Poster[]>([]);

const { data, error } = await useFetch("/api/poster");

if (data.value) {
  posters.value = data.value as unknown as Poster[];
}

if (error.value) {
  console.error(error.value);
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageHeader
      title="Dashboard"
      description="Keep track of all your submitted posters. Edit or delete them as needed."
      :links="[
        {
          label: 'Add Poster',
          to: '/share/new',
          icon: 'heroicons:plus',
          color: 'primary' as const,
        },
      ]"
    />

    <UPageGrid>
      <NuxtLink
        v-for="(poster, index) in posters"
        :key="index + 1"
        :to="`/share/${poster.id}`"
      >
        <UCard
          class="group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-lg"
        >
          <div class="relative overflow-hidden">
            <NuxtImg
              :src="poster.imageUrl"
              :alt="poster.title"
              class="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            <div class="absolute top-3 right-3">
              <UBadge
                :color="poster.status === 'published' ? 'success' : 'warning'"
                variant="solid"
                size="sm"
              >
                {{ poster.status === "published" ? "Published" : "Draft" }}
              </UBadge>
            </div>
          </div>

          <div class="p-4">
            <div class="flex flex-col gap-3">
              <h3 class="line-clamp-2 text-lg font-semibold">
                {{ poster.title }}
              </h3>

              <p class="line-clamp-3 text-sm leading-relaxed">
                {{ poster.description }}
              </p>

              <div
                class="flex flex-col justify-between gap-2 border-t border-gray-100 pt-2 text-xs"
              >
                <span v-if="poster.publishedAt" class="flex items-center gap-1">
                  <Icon name="heroicons:eye" class="h-3 w-3" />
                  Published
                  {{ dayjs(poster.publishedAt).format("MMMM D, YYYY") }}
                </span>

                <span class="flex items-center gap-1">
                  <Icon name="heroicons:calendar-days" class="h-3 w-3" />

                  Created {{ dayjs(poster.created).format("MMMM D, YYYY") }}
                </span>
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </UPageGrid>

    <div v-if="posters.length === 0" class="py-12 text-center">
      <div
        class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100"
      >
        <Icon name="heroicons:document-text" class="h-12 w-12 text-gray-400" />
      </div>

      <h3 class="mb-2 text-lg font-medium text-gray-900">No posters yet</h3>

      <p class="mb-6 text-gray-500">
        Get started by creating your first poster.
      </p>

      <!-- <NuxtLink to="/share/new">
        <UButton color="primary" size="lg">
          <Icon name="heroicons:plus" class="mr-2 h-5 w-5" />
          Create Poster
        </UButton>
      </NuxtLink> -->
    </div>
  </div>
</template>
