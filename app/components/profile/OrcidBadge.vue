<script setup lang="ts">
import { orcidUrl } from "#shared/utils/orcid";

// An ORCID iD in ORCID's compact display format: the iD icon, then the iD
// linked to the record.
defineProps<{
  orcid: string;
}>();
</script>

<template>
  <a
    :href="orcidUrl(orcid)"
    target="_blank"
    rel="noopener noreferrer"
    class="border-default bg-default hover:bg-elevated inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm transition-colors"
  >
    <UIcon name="i-simple-icons-orcid" class="size-4 shrink-0 text-[#A6CE39]" />

    <span class="font-medium whitespace-nowrap">{{ orcid }}</span>

    <UIcon
      name="i-heroicons-arrow-top-right-on-square"
      class="text-muted size-3.5 shrink-0"
    />
  </a>
</template>
