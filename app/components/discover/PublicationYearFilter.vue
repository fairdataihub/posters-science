<script setup lang="ts">
type Option = { value: number; label: string; count: number };

const props = defineProps<{ options: Option[] }>();
const modelValue = defineModel<number[]>({ required: true });

const items = computed(() =>
  props.options.map((o) => ({
    value: o.value,
    label: `${o.label} (${o.count})`,
  })),
);
</script>

<template>
  <div>
    <h4 class="mb-3 text-sm font-medium">Publication Year</h4>

    <div v-if="props.options.length === 0" class="text-sm text-gray-500">
      No publication year data yet.
    </div>

    <USelectMenu
      v-else
      v-model="modelValue"
      :items="items"
      value-key="value"
      multiple
      searchable
      :search-input="{ placeholder: 'Search years...', icon: 'i-lucide-search' }"
      placeholder="Any year"
      class="w-full"
    />
  </div>
</template>
