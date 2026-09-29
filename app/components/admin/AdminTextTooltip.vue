<script setup lang="ts">
// Admin tables truncate long values to keep rows scannable. This reveals the
// full value on hover, overriding the tooltip's default single line height.
defineProps<{ text?: string | null }>();
</script>

<template>
  <UTooltip
    v-if="text"
    :delay-duration="150"
    :ui="{ content: 'h-auto max-w-md items-start p-2.5' }"
  >
    <slot />

    <template #content>
      <p class="text-xs break-words whitespace-pre-wrap">{{ text }}</p>
    </template>
  </UTooltip>

  <slot v-else />
</template>
