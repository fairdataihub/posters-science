<script setup lang="ts">
import { Motion } from "motion-v";

interface Props {
  blur?: string;
  class?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
}

const props = withDefaults(defineProps<Props>(), {
  blur: "20px",
  class: "",
  delay: 2,
  duration: 1,
  yOffset: 20,
});

const container = ref(null);
const childElements = ref([]);
const slots = useSlots();

const children = ref<any>([]);

onMounted(() => {
  // This will reactively capture all content provided in the default slot
  watchEffect(() => {
    children.value = slots.default ? slots.default() : [];
  });
});

function getInitial() {
  return {
    filter: `blur(${props.blur})`,
    opacity: 0,
    y: props.yOffset,
  };
}

function getAnimate() {
  return {
    filter: `blur(0px)`,
    opacity: 1,
    y: 0,
  };
}
</script>

<template>
  <div ref="container" :class="props.class">
    <Motion
      v-for="(child, index) in children"
      :key="index"
      ref="childElements"
      as="div"
      :initial="getInitial()"
      :while-in-view="getAnimate()"
      :transition="{
        duration: props.duration,
        ease: 'easeInOut',
        delay: props.delay * index,
      }"
    >
      <component :is="child" />
    </Motion>
  </div>
</template>
