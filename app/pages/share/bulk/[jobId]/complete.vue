<script setup lang="ts">
import BulkImportBatchComplete from "~/components/conferences/BulkImportBatchComplete.vue";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();

const jobId = computed(() => {
  const raw = route.params.jobId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
});
</script>

<template>
  <BulkImportBatchComplete v-if="jobId" :job-id="jobId" />
</template>
