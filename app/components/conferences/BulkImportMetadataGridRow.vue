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
}>();

function onInput(fillKey: string, event: Event) {
  const target = event.target as HTMLTextAreaElement | HTMLSelectElement;
  emit("cellInput", props.row, fillKey, target.value);
}
</script>

<template>
  <tr
    class="group"
    :class="{
      'border-accented border-t-2': rowPos > 0 && firstOfPoster,
      'bg-muted': shaded,
    }"
  >
    <th scope="row" :class="posterNameClass">
      <span class="block text-sm font-normal [overflow-wrap:anywhere]">
        {{ posterName }}
      </span>
    </th>

    <td
      v-for="(column, colPos) in columns"
      :key="column.fillKey"
      class="border-default focus-within:ring-primary hover:bg-elevated/40 cursor-text border-r border-b p-0 align-top focus-within:ring-2 focus-within:ring-inset"
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
        class="block min-h-16 resize-y bg-transparent px-2 py-1.5 break-words whitespace-pre-wrap outline-none [field-sizing:content]"
        :style="cellStyle(column)"
        :aria-label="`${column.header}, ${posterName}`"
        @input="onInput(column.fillKey, $event)"
        @keydown="emit('cellKeydown', $event, rowPos, colPos, true)"
        @paste="emit('cellPaste', $event, rowPos, colPos)"
      />
      <!-- Single-line field that wraps and grows instead of scrolling sideways. -->
      <textarea
        v-else
        v-auto-grow
        :value="row[column.fillKey] ?? ''"
        rows="1"
        :data-cell="`${rowPos}:${colPos}`"
        class="block resize-none overflow-hidden bg-transparent px-2 py-1.5 break-words outline-none [field-sizing:content]"
        :style="cellStyle(column)"
        :aria-label="`${column.header}, ${posterName}`"
        @input="onInput(column.fillKey, $event)"
        @keydown="emit('cellKeydown', $event, rowPos, colPos, false)"
        @paste="emit('cellPaste', $event, rowPos, colPos)"
      />
    </td>

    <td
      v-if="repeatable"
      class="border-default border-b px-1 py-1 align-top whitespace-nowrap"
    >
      <div
        class="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100"
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
  </tr>
</template>
