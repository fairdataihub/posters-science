<script lang="ts" setup>
defineProps<{
  title: string;
  collapse: boolean;
}>();
</script>

<template>
  <UCollapsible
    :ui="{ root: 'w-full', content: 'bg-red' }"
    class="flex w-48 flex-col gap-2"
  >
    <UButton
      class="group"
      label="Open"
      color="neutral"
      variant="subtle"
      trailing-icon="i-lucide-chevron-down"
      :ui="{
        trailingIcon:
          'group-data-[state=open]:rotate-180 transition-transform duration-200',
      }"
      block
    />

    <template #content>
      <slot />
    </template>
  </UCollapsible>
</template>
