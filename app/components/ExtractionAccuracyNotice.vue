<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: "Please review the extracted data",
  description:
    "Data is extracted automatically and is not always accurate. After extraction finishes, review the extracted data and correct anything that is wrong before publishing.",
});
</script>

<template>
  <UAlert
    color="info"
    variant="soft"
    icon="i-lucide-info"
    :title="title"
    :description="description"
  />
</template>
