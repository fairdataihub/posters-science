<script setup lang="ts">
import type { PosterSheetFlaggedRow } from "#shared/types/posterSheetMapping";

/**
 * Shown above the metadata grid while poster sheet pairings need checking:
 * rows matched to posters by title (more than the exact title was needed),
 * a file picked by the row's number, and rows paired by file name or number
 * whose title does not agree with the extracted poster. Each stays listed,
 * saved or not, until the organizer accepts it or unlinks it. Unlinking puts
 * that poster's extracted values back and the pair is never made again.
 *
 * Each pairing shows the title and authors read from the poster next to the
 * sheet row's, with the names found on both sides marked.
 */

const props = defineProps<{
  /** Pairings to check */
  matches: PosterSheetFlaggedRow[];
  /** Sheet rows with no poster yet */
  waiting: number;
}>();

const emit = defineEmits<{
  (e: "unlink" | "accept", rowKey: string): void;
}>();

/** Why the pairing was made, in the organizer's words. */
const METHOD_LABELS: Record<PosterSheetFlaggedRow["method"], string> = {
  title: "Paired by the same title",
  title_authors: "Paired by a similar title and the same authors",
  words_fuzzy: "Paired by the same title words, some spelled differently",
  best_remaining: "Paired as the closest match among the posters left",
  number_suggested: "Paired because the row's number is in the file name",
  column: "Paired by the file name in your sheet",
  column_fuzzy: "Paired by a close file name in your sheet",
  column_unverified: "Paired by the file name in your sheet",
  number: "Paired by the row number at the start of the file name",
};

/** Authors shown before "+N more". */
const AUTHORS_SHOWN = 8;

const expanded = ref(new Set<string>());

function toggleAuthors(key: string) {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

function isFilePairing(match: PosterSheetFlaggedRow) {
  return ["column", "column_fuzzy", "column_unverified", "number"].includes(
    match.method,
  );
}

/** What made us unsure, for pairings made by file name or number. */
function concern(match: PosterSheetFlaggedRow) {
  if (!isFilePairing(match)) return null;

  return match.reason === "authors"
    ? "No author names in common"
    : "The titles don't agree";
}

function percent(score: number) {
  return `${Math.round(score * 100)}%`;
}

function scoreColor(score: number) {
  if (score >= 0.8) return "success" as const;
  if (score >= 0.5) return "warning" as const;

  return "error" as const;
}

/** Last word of "Given Family", or the part before the comma in "Family, Given". */
function familyName(name: string) {
  const family = name.includes(",") ? name.split(",")[0]! : name;
  const words = family
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);

  return words?.at(-1) ?? "";
}

type Side = { names: string[]; shared: Set<string>; known: boolean };

/** Both author lists, with the family names that appear on both sides. */
function authorSides(match: PosterSheetFlaggedRow) {
  const poster = match.poster_authors ?? [];
  const sheet = match.row_authors ?? [];
  const posterFamilies = new Set(poster.map(familyName).filter(Boolean));
  const sheetFamilies = new Set(sheet.map(familyName).filter(Boolean));
  const shared = new Set(
    [...posterFamilies].filter((name) => sheetFamilies.has(name)),
  );

  return {
    poster: {
      names: poster,
      shared,
      known: match.poster_authors !== null,
    } as Side,
    sheet: { names: sheet, shared, known: true } as Side,
  };
}

function shownNames(side: Side, key: string) {
  return expanded.value.has(key)
    ? side.names
    : side.names.slice(0, AUTHORS_SHOWN);
}

function acceptAll() {
  for (const match of [...props.matches]) emit("accept", match.row_key);
}
</script>

<template>
  <div class="space-y-3">
    <section
      v-if="matches.length"
      class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"
      aria-labelledby="poster-sheet-pairings-title"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 gap-3">
          <UIcon
            name="i-lucide-link"
            class="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
          />

          <div class="min-w-0">
            <h3 id="poster-sheet-pairings-title" class="font-semibold">
              Check {{ matches.length }}
              {{ matches.length === 1 ? "pairing" : "pairings" }} from your
              poster sheet
            </h3>

            <p class="text-muted mt-0.5 text-sm">
              We weren't sure these posters belong with these sheet rows.
              Compare what we read from each poster with your sheet. Accept a
              pairing and your sheet's values fill that poster. Unlink a wrong
              one and the poster keeps what was read from it.
            </p>
          </div>
        </div>

        <UButton
          v-if="matches.length > 1"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-check-check"
          label="Accept all"
          @click="acceptAll"
        />
      </div>

      <ul
        class="mt-4 max-h-[min(40rem,70vh)] space-y-3 overflow-y-auto overscroll-y-contain"
      >
        <li
          v-for="match in matches"
          :key="match.row_key"
          class="border-default bg-default rounded-lg border p-3 sm:p-4"
        >
          <!-- File, why it was paired, and the decision -->
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="flex min-w-0 items-center gap-1.5 font-medium">
                <UIcon
                  name="i-lucide-file-text"
                  class="text-muted size-4 shrink-0"
                />

                <span class="truncate" :title="match.file_name">
                  {{ match.file_name }}
                </span>
              </p>

              <p class="text-muted mt-0.5 text-sm">
                {{ METHOD_LABELS[match.method] ?? match.method }}
              </p>
            </div>

            <div class="flex shrink-0 gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-unlink"
                label="Unlink"
                :aria-label="`Unlink ${match.file_name}`"
                @click="emit('unlink', match.row_key)"
              />

              <UButton
                size="sm"
                color="primary"
                variant="soft"
                icon="i-lucide-check"
                label="Accept"
                :aria-label="`Accept ${match.file_name}`"
                @click="emit('accept', match.row_key)"
              />
            </div>
          </div>

          <!-- Poster vs sheet, side by side -->
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <div
              v-for="side in [
                {
                  key: 'poster',
                  icon: 'i-lucide-scan-text',
                  heading: 'Read from the poster',
                  source: 'AI extraction of the PDF',
                  title: match.poster_title,
                  authors: authorSides(match).poster,
                },
                {
                  key: 'sheet',
                  icon: 'i-lucide-sheet',
                  heading: 'In your poster sheet',
                  source: match.row_number
                    ? `Row ${match.row_number}`
                    : 'Your uploaded sheet',
                  title: match.row_title,
                  authors: authorSides(match).sheet,
                },
              ]"
              :key="side.key"
              class="rounded-md bg-gray-50 p-3 dark:bg-gray-900/60"
            >
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <UIcon :name="side.icon" class="text-muted size-4 shrink-0" />

                <span class="font-semibold">{{ side.heading }}</span>

                <span class="text-muted text-xs">{{ side.source }}</span>
              </p>

              <dl class="mt-2 space-y-2 text-sm">
                <div>
                  <dt class="text-muted text-xs font-medium">Title</dt>

                  <dd class="mt-0.5 break-words">
                    <template v-if="side.title">
                      {{ side.title }}
                    </template>

                    <span v-else class="text-muted italic">No title</span>
                  </dd>
                </div>

                <div>
                  <dt class="text-muted text-xs font-medium">
                    Authors
                    <template v-if="side.authors.names.length">
                      ({{ side.authors.names.length }})
                    </template>
                  </dt>

                  <dd class="mt-1">
                    <ul
                      v-if="side.authors.names.length"
                      class="flex flex-wrap gap-1.5"
                    >
                      <li
                        v-for="(name, index) in shownNames(
                          side.authors,
                          `${match.row_key}|${side.key}`,
                        )"
                        :key="`${index}-${name}`"
                        class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium"
                        :class="
                          side.authors.shared.has(familyName(name))
                            ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                            : 'bg-white text-gray-900 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700'
                        "
                      >
                        <UIcon
                          v-if="side.authors.shared.has(familyName(name))"
                          name="i-lucide-check"
                          class="size-3.5 shrink-0"
                          aria-label="Also on the other side"
                        />
                        {{ name }}
                      </li>

                      <li v-if="side.authors.names.length > AUTHORS_SHOWN">
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="link"
                          :label="
                            expanded.has(`${match.row_key}|${side.key}`)
                              ? 'Show fewer'
                              : `+${side.authors.names.length - AUTHORS_SHOWN} more`
                          "
                          @click="toggleAuthors(`${match.row_key}|${side.key}`)"
                        />
                      </li>
                    </ul>

                    <span v-else class="text-muted italic">
                      {{ side.authors.known ? "No authors" : "Not available" }}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <!-- How alike they are -->
          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <UBadge
              v-if="concern(match)"
              color="error"
              variant="subtle"
              size="sm"
              icon="i-lucide-triangle-alert"
              :label="concern(match)!"
            />

            <UBadge
              :color="scoreColor(match.score)"
              variant="subtle"
              size="sm"
              :label="`Titles ${percent(match.score)} alike`"
            />

            <UBadge
              v-if="match.author_score !== null"
              :color="scoreColor(match.author_score)"
              variant="subtle"
              size="sm"
              :label="`Authors ${percent(match.author_score)} alike`"
            />

            <span
              v-if="authorSides(match).sheet.shared.size"
              class="text-muted inline-flex items-center gap-1 text-xs"
            >
              <UIcon name="i-lucide-check" class="size-3.5" />
              Names on both sides
            </span>
          </div>
        </li>
      </ul>
    </section>

    <p v-if="waiting" class="text-muted flex items-start gap-2 text-sm">
      <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0" />

      <span>
        {{ waiting }} {{ waiting === 1 ? "row" : "rows" }} in your poster sheet
        {{ waiting === 1 ? "isn't" : "aren't" }} linked to a poster yet. A row
        links when its poster finishes extracting. Rows that never link aren't
        used, and posters without a row keep what was read from them.
      </span>
    </p>
  </div>
</template>
