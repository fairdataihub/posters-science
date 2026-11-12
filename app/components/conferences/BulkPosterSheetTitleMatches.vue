<script setup lang="ts">
import type { PosterSheetTitleMatch } from "#shared/types/posterSheetMapping";

/**
 * Shown above the metadata grid when poster sheet rows were linked to posters
 * by title (the sheet had no file name column). Matches that needed the
 * authors to decide are listed for the organizer to check; a wrong one is
 * unlinked and never matched again.
 */

defineProps<{
  /** Title matches to check, not saved yet */
  matches: PosterSheetTitleMatch[];
  /** Sheet rows with no poster yet */
  waiting: number;
  /** The grid has unsaved edits (unlinking reloads it) */
  dirty: boolean;
}>();

const emit = defineEmits<{ (e: "unlink", rowKey: string): void }>();

const METHOD_LABELS: Record<PosterSheetTitleMatch["method"], string> = {
  title: "same title",
  title_authors: "similar title, same authors",
  words_fuzzy: "same words, some spelled differently",
  best_remaining: "closest of the posters left",
};

function percent(score: number) {
  return `${Math.round(score * 100)}%`;
}
</script>

<template>
  <div class="space-y-2">
    <UAlert
      v-if="matches.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-link"
      title="Check these matches from your poster sheet"
    >
      <template #description>
        <p>
          These rows in your poster sheet had no file name that matches an
          upload, so they were matched to posters by title and authors. Your
          sheet's values replace what was read from these posters. Unlink any
          match that is wrong before you save.
          <span v-if="dirty"
            >Unlinking reloads the grid, so save other edits first.</span
          >
        </p>

        <ul class="mt-2 space-y-1">
          <li
            v-for="match in matches"
            :key="match.row_key"
            class="flex flex-wrap items-center gap-x-2"
          >
            <span class="font-medium">{{ match.file_name }}</span>

            <span class="text-muted">
              matched to "{{ match.row_title }}" ({{
                METHOD_LABELS[match.method] ?? match.method
              }}, score {{ percent(match.score)
              }}<template v-if="match.author_score !== null"
                >, authors {{ percent(match.author_score) }}</template
              >)
            </span>

            <UButton
              size="xs"
              color="neutral"
              variant="link"
              label="Unlink"
              @click="emit('unlink', match.row_key)"
            />
          </li>
        </ul>
      </template>
    </UAlert>

    <p v-if="waiting" class="text-muted text-sm">
      {{ waiting }} row(s) in your poster sheet are not linked to a poster yet.
      They link when a matching poster finishes extracting; otherwise they are
      not used, and posters without a row keep what was read from them.
    </p>
  </div>
</template>
