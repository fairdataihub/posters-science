<script setup lang="ts">
import type { CollectionSummary } from "#shared/types/collection";

// A public collection on profiles, organization pages and Discover.

const props = defineProps<{
  collection: CollectionSummary;
  /** Why it matched a search, such as "Name match". */
  reason?: string;
  /** Hide the owner, for example on the owner's own profile. */
  hideOwner?: boolean;
}>();

const emit = defineEmits<{
  /** The card was opened. */
  open: [];
}>();

const posterCountLabel = computed(() => {
  const count = props.collection.posterCount;

  return `${count.toLocaleString()} ${count === 1 ? "poster" : "posters"}`;
});
</script>

<template>
  <UCard
    class="group h-full transition-shadow hover:shadow-md"
    :ui="{ body: 'space-y-3 p-3 sm:p-4' }"
  >
    <NuxtLink
      :to="collection.path"
      class="block"
      tabindex="-1"
      aria-hidden="true"
      @click="emit('open')"
    >
      <CollectionCovers :covers="collection.covers" />
    </NuxtLink>

    <div class="min-w-0 space-y-1">
      <NuxtLink
        :to="collection.path"
        class="line-clamp-2 font-semibold break-words group-hover:underline"
        @click="emit('open')"
      >
        <slot name="name">{{ collection.name }}</slot>
      </NuxtLink>

      <p v-if="!hideOwner" class="text-muted truncate text-sm">
        By {{ collection.owner.name }}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <UBadge color="neutral" variant="subtle" size="sm">
        {{ posterCountLabel }}
      </UBadge>

      <UBadge
        v-if="collection.conference"
        color="neutral"
        variant="outline"
        size="sm"
        class="max-w-full"
      >
        <span class="truncate">{{ collection.conference }}</span>
      </UBadge>

      <UBadge
        v-if="reason"
        color="primary"
        variant="subtle"
        size="sm"
        icon="i-lucide-search-check"
      >
        {{ reason }}
      </UBadge>
    </div>
  </UCard>
</template>
