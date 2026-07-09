<script setup lang="ts">
const modelValue = defineModel<string[]>({ required: true });

const items = [
  { value: "zenodo", label: "Zenodo" },
  { value: "figshare", label: "Figshare" },
  { value: "user_submitted", label: "User-submitted" },
];
</script>

<template>
  <div>
    <h4 class="mb-3 text-sm font-medium">Source</h4>

    <USelectMenu
      v-model="modelValue"
      :items="items"
      value-key="value"
      multiple
      placeholder="Any source"
      class="w-full"
    />
  </div>
</template>
