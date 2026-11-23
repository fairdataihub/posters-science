<script setup lang="ts">
// The top of the dashboard sidebar: whether the person's profile is public,
// since it lists what they publish here, and a link to it or to the setting.

defineProps<{
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  navigate: [];
}>();

// Lazy so it never holds up the poster list.
const { data: profileSettings } = useFetch("/api/user", { lazy: true });

const profileListing = computed(() =>
  profileSettings.value?.profileShowLikes
    ? "the posters you published, claimed and liked"
    : "the posters you published and claimed",
);

const summary = computed(() => {
  const settings = profileSettings.value;
  if (!settings) return null;

  if (settings.profilePublic && settings.profilePath) {
    return {
      title: "Public profile",
      icon: "i-lucide-globe",
      to: settings.profilePath,
      description: `Shows ${profileListing.value}.`,
    };
  }

  return {
    title: "Private profile",
    icon: "i-lucide-lock",
    to: "/profile",
    description: `Make it public to share ${profileListing.value}.`,
  };
});
</script>

<template>
  <USkeleton
    v-if="!summary"
    :class="collapsed ? 'mx-auto size-8 rounded-md' : 'h-[74px] w-full'"
  />

  <UTooltip
    v-else-if="collapsed"
    :text="summary.title"
    :content="{ side: 'right' }"
  >
    <UButton
      :to="summary.to"
      :icon="summary.icon"
      :aria-label="summary.title"
      color="neutral"
      variant="ghost"
      size="md"
      square
      class="mx-auto"
      @click="emit('navigate')"
    />
  </UTooltip>

  <NuxtLink
    v-else
    :to="summary.to"
    class="group border-default bg-default hover:border-primary/40 block rounded-lg border p-3 transition-colors"
    @click="emit('navigate')"
  >
    <span class="flex items-center gap-2">
      <UIcon :name="summary.icon" class="text-primary size-4 shrink-0" />

      <span
        class="text-highlighted min-w-0 flex-1 truncate text-sm font-medium"
      >
        {{ summary.title }}
      </span>

      <UIcon
        name="i-lucide-arrow-right"
        class="text-dimmed group-hover:text-primary size-4 shrink-0 transition-colors"
      />
    </span>

    <span class="text-muted mt-1 block text-xs">
      {{ summary.description }}
    </span>
  </NuxtLink>
</template>
