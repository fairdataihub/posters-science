<script setup lang="ts">
type Option = { value: string; label: string; count: number };

const props = defineProps<{ options: Option[] }>();
const modelValue = defineModel<string[]>({ required: true });

const items = computed(() =>
  props.options.map((o) => ({
    value: o.value,
    label: `${o.label} (${o.count})`,
  })),
);
</script>

<template>
  <div>
    <h4 class="mb-3 text-sm font-medium">Institution</h4>

    <USelectMenu
      v-model="modelValue"
      :items="items"
      value-key="value"
      multiple
      searchable
      :search-input="{ placeholder: 'Search institutions...', icon: 'i-lucide-search' }"
      placeholder="Any institution"
      class="w-full"
    />
  </div>
</template>
