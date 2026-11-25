<script setup lang="ts">
import type { UnmatchedPoster } from "#shared/types/posterSheetMapping";

/**
 * Lists the posters that didn't match a worksheet row at Review. The
 * worksheet is supplemental, so they keep what was read from them; the
 * organizer can fix the worksheet and add it again if they want.
 */
defineProps<{
  /** Posters without a row the organizer hasn't seen this notice for */
  posters: UnmatchedPoster[];
}>();

const emit = defineEmits<{
  (e: "dismiss"): void;
}>();

const REASONS: Record<UnmatchedPoster["reason"], string> = {
  no_row: "No row in your worksheet",
  unlinked: "You unlinked its row",
};
</script>

<template>
  <section
    class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"
    aria-labelledby="poster-sheet-unmatched-title"
  >
    <h3 id="poster-sheet-unmatched-title" class="font-semibold">
      {{ posters.length === 1 ? "1 poster" : `${posters.length} posters` }}
      didn't match your worksheet
    </h3>

    <p class="text-muted mt-1 text-sm">
      {{ posters.length === 1 ? "It keeps" : "They keep" }} what we read from
      {{ posters.length === 1 ? "the poster" : "the posters" }}. Check
      {{ posters.length === 1 ? "it" : "them" }} below, or fix your worksheet
      and add it again.
    </p>

    <ul class="mt-3 divide-y divide-amber-200 text-sm dark:divide-amber-900">
      <li
        v-for="poster in posters"
        :key="poster.posterId"
        class="flex flex-wrap items-center justify-between gap-x-3 py-1.5"
      >
        <span
          class="min-w-0 flex-1 truncate font-mono text-xs"
          :title="poster.fileName"
        >
          {{ poster.fileName }}
        </span>

        <span class="text-muted text-xs">{{ REASONS[poster.reason] }}</span>
      </li>
    </ul>

    <div class="mt-3 flex justify-end">
      <UButton color="primary" label="OK" @click="emit('dismiss')" />
    </div>
  </section>
</template>
