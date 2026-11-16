<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
});

await navigateTo("/share/new-bulk", { replace: true });
</script>

<template>
  <div />
</template>
