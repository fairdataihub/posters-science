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

    <UPageList>
      <UPageCard
        v-for="(poster, index) in posters"
        :key="index + 1"
        variant="ghost"
        class="group cursor-pointer overflow-hidden rounded-none border-t border-b border-gray-100 transition-all duration-300"
        :to="`/share/${poster.id}`"
      >
        <div class="flex gap-8">
          <div class="relative overflow-hidden">
            <NuxtImg
              :src="poster.imageUrl || 'https://placehold.co/200x200'"
              :alt="poster.title"
              class="w-[200px] object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          <div class="">
            <div class="flex flex-col gap-2">
              <h3 class="line-clamp-2 text-lg font-semibold">
                {{ poster.title || "No title available" }}
              </h3>

              <p class="line-clamp-3 text-sm">
                {{ poster.description || "No description available" }}
              </p>

              <div
                class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs"
              >
                <div class="flex items-center gap-2">
                  <span class="flex items-center gap-1">
                    <Icon name="heroicons:calendar-days" class="h-3 w-3" />

                    Created
                    {{ dayjs(poster.created).format("MMMM D, YYYY") }}
                  </span>

                  <span
                    v-if="poster.publishedAt"
                    class="flex items-center gap-1 border-l border-gray-100 pl-2"
                  >
                    <Icon
                      name="heroicons:presentation-chart-bar"
                      class="h-3 w-3"
                    />
                    Published
                    {{ dayjs(poster.publishedAt).format("MMMM D, YYYY") }}
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <UButton
                    color="secondary"
                    variant="subtle"
                    label="Add additional publication information"
                    icon="heroicons:plus"
                    size="xs"
                  />

                  <UBadge
                    :color="
                      poster.status === 'published' ? 'success' : 'warning'
                    "
                    variant="solid"
                    size="sm"
                  >
                    {{ poster.status === "published" ? "Published" : "Draft" }}
                  </UBadge>
                </div>
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

      <!-- <NuxtLink to="/share/new">
        <UButton color="primary" size="lg">
          <Icon name="heroicons:plus" class="mr-2 h-5 w-5" />
          Create Poster
        </UButton>
      </NuxtLink> -->
    </div>
  </div>
</template>
