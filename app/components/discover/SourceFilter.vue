<script setup lang="ts">
const modelValue = defineModel<string[]>({ required: true });

const sources = [
  { value: "zenodo", label: "Zenodo" },
  { value: "figshare", label: "Figshare" },
  { value: "user_submitted", label: "User-submitted" },
];

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
    <h4 class="mb-3 text-sm font-medium">Source</h4>

    <div class="flex flex-col gap-2">
      <UCheckbox
        v-for="src in sources"
        :key="src.value"
        :model-value="modelValue.includes(src.value)"
        :label="src.label"
        @update:model-value="toggle(src.value)"
      />
    </div>
  </div>
</template>
