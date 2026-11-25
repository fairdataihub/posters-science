<script setup lang="ts">
// A poster thumbnail that falls back to a generated shape when there is no
// image or it fails to load, such as a thumbnail the CDN no longer has, so a
// card never shows a broken image with its alt text spilling out.

const props = defineProps<{
  src?: string | null;
  /** Picks the generated shape, so a poster always gets the same one. */
  seed: string | number;
  alt: string;
}>();

const fallbackSrc = computed(
  () =>
    `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(String(props.seed))}`,
);
const failed = ref(false);
const image = useTemplateRef<HTMLImageElement>("image");

watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);

const shownSrc = computed(() =>
  !props.src || failed.value ? fallbackSrc.value : props.src,
);

function onError() {
  if (shownSrc.value !== fallbackSrc.value) failed.value = true;
}

// An image that failed before the page hydrated fired its error event before
// this listener existed. A lazy image that hasn't loaded yet isn't complete,
// so only a finished image with no size counts as broken here.
onMounted(() => {
  const element = image.value;

  if (element?.complete && element.naturalWidth === 0) {
    onError();
  }
});
</script>

<template>
  <img ref="image" :src="shownSrc" :alt="alt" @error="onError" />
</template>
