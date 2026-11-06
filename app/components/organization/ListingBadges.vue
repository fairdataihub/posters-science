<script setup lang="ts">
const props = defineProps<{
  organizations: { id: string; name: string }[];
}>();

// A poster can be on many pages, so long lists collapse into a count.
const SHOWN = 2;

const shown = computed(() => props.organizations.slice(0, SHOWN));
const rest = computed(() => props.organizations.slice(SHOWN));
</script>

<template>
  <UTooltip
    v-for="organization in shown"
    :key="organization.id"
    :text="`Shown on the ${organization.name} organization page`"
  >
    <UBadge
      color="neutral"
      variant="outline"
      size="sm"
      icon="i-lucide-building-2"
      class="max-w-48 cursor-help"
    >
      <span class="truncate">{{ organization.name }}</span>
    </UBadge>
  </UTooltip>

  <UTooltip
    v-if="rest.length"
    :text="`Also shown on ${rest.map((organization) => organization.name).join(', ')}`"
  >
    <UBadge color="neutral" variant="outline" size="sm" class="cursor-help">
      +{{ rest.length }}
    </UBadge>
  </UTooltip>
</template>
