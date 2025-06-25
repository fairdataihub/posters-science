<script setup lang="ts">
const props = defineProps({
  title: {
    default: "",
    type: String,
  },
  content: {
    default: "",
    type: String,
  },
});

const hasContent = computed(() => props.content.length > 0);
</script>

<template>
  <div>
    <h3 class="text-lg font-semibold">{{ title }}</h3>

    <p v-if="hasContent" class="text-lg">{{ content }}</p>

    <slot v-else />
  </div>
</template>
