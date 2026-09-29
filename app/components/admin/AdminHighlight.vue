<script setup lang="ts">
import { splitHighlight } from "#shared/utils/adminSearch";

// Marks the part of a cell that the current search actually matched, so a row's
// relevance is visible rather than inferred.
const props = defineProps<{
  text?: string | number | null;
  term?: string | null;
}>();

const segments = computed(() =>
  splitHighlight(
    props.text === null || props.text === undefined ? "" : String(props.text),
    props.term,
  ),
);

const MARK_CLASS =
  "rounded-xs bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-700/60";
</script>

<!--
  One repeated element rather than a v-if/v-else pair: the linter wants a blank
  line between sibling tags, which would put a text node between the branches
  and could split a highlighted word.
-->
<template>
  <span
    ><component
      :is="segment.match ? 'mark' : 'span'"
      v-for="(segment, index) in segments"
      :key="index"
      :class="segment.match ? MARK_CLASS : undefined"
      >{{ segment.text }}</component
    ></span
  >
</template>
