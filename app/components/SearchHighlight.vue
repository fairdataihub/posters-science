<script setup lang="ts">
import { splitHighlight } from "#shared/utils/searchQuery";

// Marks the part of some text that the current search actually matched, so a
// result's relevance is visible rather than inferred.
const props = defineProps<{
  text?: string | number | null;
  term?: string | readonly string[] | null;
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
