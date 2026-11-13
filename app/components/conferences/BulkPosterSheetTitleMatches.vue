<script setup lang="ts">
import type { PosterSheetFlaggedRow } from "#shared/types/posterSheetMapping";

/**
 * Shown above the metadata grid while poster sheet pairings need checking:
 * rows matched to posters by title (more than the exact title was needed),
 * a file picked by the row's number, and rows paired by file name or number
 * whose title does not agree with the extracted poster. Each stays listed,
 * saved or not, until the organizer accepts it or unlinks it. Unlinking puts
 * that poster's extracted values back and the pair is never made again.
 */

defineProps<{
  /** Pairings to check */
  matches: PosterSheetFlaggedRow[];
  /** Sheet rows with no poster yet */
  waiting: number;
}>();

const emit = defineEmits<{
  (e: "unlink" | "accept", rowKey: string): void;
}>();

const METHOD_LABELS: Record<PosterSheetFlaggedRow["method"], string> = {
  title: "same title",
  title_authors: "similar title, same authors",
  words_fuzzy: "same words, some spelled differently",
  best_remaining: "closest of the posters left",
  number_suggested: "the row's number is in the file name",
  column: "file name in your sheet",
  column_fuzzy: "close file name in your sheet",
  number: "number at the start of the file name",
};

function percent(score: number) {
  return `${Math.round(score * 100)}%`;
}

function isFilePairing(match: PosterSheetFlaggedRow) {
  return ["column", "column_fuzzy", "number"].includes(match.method);
}

/** How it was paired, what the poster reads when the titles disagree, and the scores. */
function detail(match: PosterSheetFlaggedRow) {
  const parts = [METHOD_LABELS[match.method] ?? match.method];
  if (isFilePairing(match)) {
    parts.push(
      match.reason === "authors"
        ? "but no author names in common"
        : `but the poster reads "${match.poster_title}"`,
    );
  }
  parts.push(`title ${percent(match.score)}`);
  if (match.author_score !== null)
    parts.push(`authors ${percent(match.author_score)}`);

  return parts.join(", ");
}
</script>

<template>
  <div class="space-y-2">
    <UAlert
      v-if="matches.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-link"
      title="Check these pairings from your poster sheet"
    >
      <template #description>
        <p>
          These posters were paired with a row in your poster sheet in a way
          that may be wrong. Your sheet's values fill these posters, so accept
          each pairing that is right and unlink any that is wrong. Unlinking
          puts back what was read from the poster.
        </p>

        <ul class="mt-2 space-y-1">
          <li
            v-for="match in matches"
            :key="match.row_key"
            class="flex flex-wrap items-center gap-x-2"
          >
            <span class="font-medium">{{ match.file_name }}</span>

            <span class="text-muted">
              paired with "{{ match.row_title }}" ({{ detail(match) }})
            </span>

            <UButton
              size="xs"
              color="neutral"
              variant="link"
              label="Accept"
              @click="emit('accept', match.row_key)"
            />

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
