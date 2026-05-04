<script setup lang="ts">
import cloud from "d3-cloud";
import type { Word } from "d3-cloud";

const props = withDefaults(
  defineProps<{
    words: Array<{ text: string; value: number }>;
    height?: number;
  }>(),
  { height: 400 },
);

const COLORS = [
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

type PlacedWord = Word & {
  text: string;
  size: number;
  x: number;
  y: number;
  rotate: number;
};

const container = ref<HTMLDivElement | null>(null);
const placedWords = ref<PlacedWord[]>([]);
const svgWidth = ref(0);

function colorFor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++)
    hash = text.charCodeAt(i) + ((hash << 5) - hash);

  return COLORS[Math.abs(hash) % COLORS.length]!;
}

function scaleSize(value: number, min: number, max: number): number {
  if (max === min) return 28;

  return Math.round(14 + ((value - min) / (max - min)) * 42);
}

function runLayout(width: number) {
  if (!props.words.length || width <= 0) return;

  const values = props.words.map((w) => w.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  cloud()
    .size([width, props.height])
    .words(
      props.words.map((w) => ({
        text: w.text,
        size: scaleSize(w.value, minVal, maxVal),
      })),
    )
    .padding(5)
    .rotate(0)
    .font("sans-serif")
    .fontSize((d) => (d as { size?: number }).size ?? 14)
    .on("end", (computed) => {
      placedWords.value = computed as PlacedWord[];
    })
    .start();
}

onMounted(async () => {
  await nextTick();
  if (!container.value) return;

  svgWidth.value = container.value.offsetWidth || 600;
  runLayout(svgWidth.value);

  const observer = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    if (w > 0 && Math.abs(w - svgWidth.value) > 10) {
      svgWidth.value = w;
      runLayout(w);
    }
  });
  observer.observe(container.value);
  onUnmounted(() => observer.disconnect());
});
</script>

<template>
  <div ref="container" class="w-full">
    <svg
      v-if="placedWords.length && svgWidth > 0"
      :width="svgWidth"
      :height="height"
      :viewBox="`0 0 ${svgWidth} ${height}`"
      class="w-full"
    >
      <g :transform="`translate(${svgWidth / 2}, ${height / 2})`">
        <text
          v-for="word in placedWords"
          :key="word.text"
          :transform="`translate(${word.x ?? 0}, ${word.y ?? 0}) rotate(${word.rotate ?? 0})`"
          :font-size="`${word.size}px`"
          :fill="colorFor(word.text)"
          font-family="sans-serif"
          text-anchor="middle"
          class="cursor-default select-none"
        >
          {{ word.text }}
        </text>
      </g>
    </svg>

    <div
      v-else-if="svgWidth === 0"
      :style="`height: ${height}px`"
      class="flex items-center justify-center"
    >
      <div
        class="bg-muted h-6 w-6 animate-spin rounded-full border-2 border-pink-600 border-t-transparent"
      />
    </div>

    <p v-else class="text-muted py-8 text-center text-sm">
      No data available yet.
    </p>
  </div>
</template>
