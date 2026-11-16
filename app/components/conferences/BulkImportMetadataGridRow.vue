<script setup lang="ts">
import type {
  BulkReviewGridColumn,
  BulkReviewGridRow,
} from "#shared/types/bulkReviewMetadataGrid";
import { vAutoGrow } from "~/utils/autoGrowTextarea";
import BulkImportMetadataGridListCell from "~/components/conferences/BulkImportMetadataGridListCell.vue";

/**
 * One editable row of the batch metadata grid. A separate component so typing
 * in a cell re-renders only this row, not the whole table (slow for big batches).
 * Cell values are read here; the parent only reads row structure.
 */
const props = defineProps<{
  row: BulkReviewGridRow & { _key: string };
  rowPos: number;
  index: number;
  columns: BulkReviewGridColumn[];
  posterName: string;
  firstOfPoster: boolean;
  repeatable: boolean;
  showReorder: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  posterNameClass: string;
  /** Rows the poster name cell spans (merged like Excel); 0 = covered by a row above. */
  posterRowSpan: number;
  cellChoices: (fillKey: string) => readonly string[] | undefined;
  /** Text shown for a dropdown value (the stored value is unchanged). */
  choiceLabel: (fillKey: string, value: string) => string;
  /** Every other poster's rows are shaded so posters are easy to tell apart. */
  shaded: boolean;
  cellStyle: (column: BulkReviewGridColumn) => Record<string, string>;
  isMissingRequired: (
    column: BulkReviewGridColumn,
    row: BulkReviewGridRow,
  ) => boolean;
  /** ORCID / ROR lookup the cell offers (search button + open-record link). */
  lookupKind: (
    column: BulkReviewGridColumn,
    row: BulkReviewGridRow,
  ) => "orcid" | "ror" | null;
  /** The lookup has a name to search with. */
  canLookup: (column: BulkReviewGridColumn, row: BulkReviewGridRow) => boolean;
}>();

const emit = defineEmits<{
  cellInput: [row: BulkReviewGridRow, fillKey: string, value: string];
  cellKeydown: [
    event: KeyboardEvent,
    rowPos: number,
    colPos: number,
    multiline: boolean,
  ];
  cellPaste: [event: ClipboardEvent, rowPos: number, colPos: number];
  cellAreaMouseDown: [event: MouseEvent];
  move: [index: number, direction: -1 | 1];
  remove: [index: number];
  lookup: [row: BulkReviewGridRow, column: BulkReviewGridColumn];
}>();

/** "Find ORCID" / "Find ROR", as on the single-poster editor. */
function lookupLabel(column: BulkReviewGridColumn, row: BulkReviewGridRow) {
  return props.lookupKind(column, row) === "orcid" ? "Find ORCID" : "Find ROR";
}

/** ↗ button text: what opens, e.g. the creator's ORCID profile. */
function openRecordLabel(column: BulkReviewGridColumn, row: BulkReviewGridRow) {
  return props.lookupKind(column, row) === "orcid"
    ? "Open creator on ORCID"
    : "Open organization on ROR";
}

function cellIsEmpty(value: string | undefined) {
  return !(value ?? "").trim();
}

function identifierUrl(value: string | undefined) {
  const url = (value ?? "").trim();

  return /^https?:\/\//i.test(url) ? url : "";
}

function onInput(fillKey: string, event: Event) {
  const target = event.target as HTMLTextAreaElement | HTMLSelectElement;
  emit("cellInput", props.row, fillKey, target.value);
}
</script>

<template>
  <tr
    class="group hover:bg-[color-mix(in_oklab,var(--ui-primary)_12%,var(--ui-bg))]"
    :class="{
      'border-accented border-t-2': rowPos > 0 && firstOfPoster,
      'bg-elevated': shaded,
    }"
  >
    <th
      v-if="posterRowSpan > 0"
      scope="row"
      :rowspan="posterRowSpan"
      :class="posterNameClass"
    >
      <!-- Stays in view below the sticky header while scrolling a long group. -->
      <span
        class="sticky top-12 block text-sm font-normal [overflow-wrap:anywhere]"
      >
        {{ posterName }}
      </span>
    </th>

    <!-- Row actions: own untitled column, sticky beside the poster name. -->
    <td
      v-if="repeatable"
      class="border-default sticky left-[320px] z-10 w-px border-r border-b px-1 py-1 align-top whitespace-nowrap group-hover:bg-[color-mix(in_oklab,var(--ui-primary)_12%,var(--ui-bg))]"
      :class="shaded ? 'bg-elevated' : 'bg-default'"
    >
      <div
        class="flex items-center opacity-60 group-hover:opacity-100 focus-within:opacity-100"
      >
        <UTooltip v-if="showReorder" text="Move up">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-up"
            aria-label="Move up"
            :disabled="!canMoveUp"
            @click="emit('move', index, -1)"
          />
        </UTooltip>
        <UTooltip v-if="showReorder" text="Move down">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-down"
            aria-label="Move down"
            :disabled="!canMoveDown"
            @click="emit('move', index, 1)"
          />
        </UTooltip>
        <UTooltip text="Delete row">
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            aria-label="Delete row"
            @click="emit('remove', index)"
          />
        </UTooltip>
      </div>
    </td>

    <td
      v-for="(column, colPos) in columns"
      :key="column.fillKey"
      class="border-default focus-within:ring-primary hover:bg-primary/10 relative h-px cursor-text border-r border-b p-0 align-top focus-within:ring-2 focus-within:ring-inset"
      :class="{ 'bg-error/5': isMissingRequired(column, row) }"
      @mousedown="emit('cellAreaMouseDown', $event)"
    >
      <select
        v-if="cellChoices(column.fillKey)"
        :value="row[column.fillKey] ?? ''"
        :data-cell="`${rowPos}:${colPos}`"
        class="block cursor-pointer bg-transparent px-2 py-1.5 outline-none"
        :style="cellStyle(column)"
        :aria-label="`${column.header}, ${posterName}`"
        @input="onInput(column.fillKey, $event)"
        @keydown="emit('cellKeydown', $event, rowPos, colPos, false)"
      >
        <option value="" />
        <option
          v-for="choice in cellChoices(column.fillKey)"
          :key="choice"
          :value="choice"
        >
          {{ choiceLabel(column.fillKey, choice) }}
        </option>
      </select>
      <BulkImportMetadataGridListCell
        v-else-if="column.list"
        :value="row[column.fillKey] ?? ''"
        :data-cell="`${rowPos}:${colPos}`"
        :style="cellStyle(column)"
        :label="`${column.header}, ${posterName}`"
        :item-noun="column.header.toLowerCase().replace(/s$/, '')"
        @change="emit('cellInput', row, column.fillKey, $event)"
        @keydown="emit('cellKeydown', $event, rowPos, colPos, false)"
        @paste="emit('cellPaste', $event, rowPos, colPos)"
      />
      <textarea
        v-else-if="column.wrapText"
        v-auto-grow
        :value="row[column.fillKey] ?? ''"
        :data-cell="`${rowPos}:${colPos}`"
        rows="3"
        class="block [field-sizing:content] min-h-[max(4rem,100%)] resize-y bg-transparent px-2 py-1.5 break-words whitespace-pre-wrap outline-none"
        :style="cellStyle(column)"
        :aria-label="`${column.header}, ${posterName}`"
        @input="onInput(column.fillKey, $event)"
        @keydown="emit('cellKeydown', $event, rowPos, colPos, true)"
        @paste="emit('cellPaste', $event, rowPos, colPos)"
      />
      <!-- Single-line field that wraps and grows instead of scrolling sideways.
           Cells are h-px so fields can use min-h-full and fill a tall row. -->
      <textarea
        v-else
        v-auto-grow
        :value="row[column.fillKey] ?? ''"
        rows="1"
        :data-cell="`${rowPos}:${colPos}`"
        class="block [field-sizing:content] min-h-full resize-none overflow-hidden bg-transparent px-2 py-1.5 break-words outline-none"
        :class="
          lookupKind(column, row)
            ? cellIsEmpty(row[column.fillKey])
              ? 'pr-28'
              : 'pr-16'
            : undefined
        "
        :style="cellStyle(column)"
        :aria-label="`${column.header}, ${posterName}`"
        @input="onInput(column.fillKey, $event)"
        @keydown="emit('cellKeydown', $event, rowPos, colPos, false)"
        @paste="emit('cellPaste', $event, rowPos, colPos)"
      />

      <!-- ORCID / ROR lookup, as in single-poster editing: a labelled
           button while empty, compact icons once the cell has a value.
           Hidden when there is no name to search and nothing filled in. -->
      <div
        v-if="
          lookupKind(column, row) &&
          (canLookup(column, row) || !cellIsEmpty(row[column.fillKey]))
        "
        class="absolute top-1 right-1 flex items-center gap-0.5"
        @mousedown.stop
      >
        <UTooltip
          v-if="identifierUrl(row[column.fillKey])"
          :text="openRecordLabel(column, row)"
        >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-external-link"
            :to="identifierUrl(row[column.fillKey])"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`${openRecordLabel(column, row)} (opens in a new tab)`"
          />
        </UTooltip>
        <UTooltip
          :text="
            canLookup(column, row)
              ? lookupLabel(column, row)
              : 'Enter a name to search'
          "
        >
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-search"
            :label="
              cellIsEmpty(row[column.fillKey])
                ? lookupLabel(column, row)
                : undefined
            "
            :aria-label="`${lookupLabel(column, row)} (${column.header}) for ${posterName}`"
            :disabled="!canLookup(column, row)"
            @click="emit('lookup', row, column)"
          />
        </UTooltip>
      </div>
    </td>
  </tr>
</template>
