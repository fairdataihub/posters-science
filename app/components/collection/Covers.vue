<script setup lang="ts">
import type { CollectionCover } from "#shared/types/collection";

// Up to four poster thumbnails in a 2x2 grid, the face of a collection card.

defineProps<{
  covers: CollectionCover[];
}>();
</script>

<template>
  <div
    class="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800"
  >
    <div
      v-for="slot in 4"
      :key="slot"
      class="flex items-center justify-center overflow-hidden bg-white dark:bg-gray-900"
    >
      <img
        v-if="covers[slot - 1]"
        :src="covers[slot - 1]!.imageUrl"
        alt=""
        loading="lazy"
        class="h-full w-full object-contain"
      />

      <UIcon
        v-else-if="slot === 1 && covers.length === 0"
        name="i-lucide-library-big"
        class="text-muted size-6"
      />
    </div>
  </div>
</template>
