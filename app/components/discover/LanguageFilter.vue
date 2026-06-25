<script setup lang="ts">
type Option = { value: string; label: string; count: number };

const props = defineProps<{ options: Option[] }>();
const modelValue = defineModel<string[]>({ required: true });

function toggle(value: string) {
  if (modelValue.value.includes(value)) {
    modelValue.value = modelValue.value.filter((v) => v !== value);
  } else {
    modelValue.value = [...modelValue.value, value];
  }
}
</script>

<template>
  <div>
    <h4 class="mb-3 text-sm font-medium">Language</h4>

    <div
      v-if="props.options.length === 0"
      class="text-sm text-gray-500"
    >
      No language data yet.
    </div>

    <div
      v-else
      class="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1"
    >
      <UCheckbox
        v-for="opt in props.options"
        :key="opt.value"
        :model-value="modelValue.includes(opt.value)"
        :label="`${opt.label} (${opt.count})`"
        @update:model-value="toggle(opt.value)"
      />
    </div>
  </div>
</template>
