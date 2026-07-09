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
    <h4 class="mb-3 text-sm font-medium">Language</h4>

    <div v-if="props.options.length === 0" class="text-sm text-gray-500">
      No language data yet.
    </div>

    <USelectMenu
      v-else
      v-model="modelValue"
      :items="items"
      value-key="value"
      multiple
      searchable
      :search-input="{
        placeholder: 'Search languages...',
        icon: 'i-lucide-search',
      }"
      placeholder="Any language"
      class="w-full"
    />
  </div>
</template>
