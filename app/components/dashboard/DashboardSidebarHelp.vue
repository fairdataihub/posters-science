<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

// The foot of the dashboard sidebar: the help and legal links the site footer
// carries elsewhere, since the dashboard fills the window and has no footer.

defineProps<{
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  navigate: [];
}>();

const feedbackOpen = useState("feedbackOpen", () => false);

const helpItems = computed<NavigationMenuItem[]>(() => [
  {
    label: "Settings",
    icon: "i-lucide-settings",
    to: "/profile",
  },
  {
    label: "Contact Us",
    icon: "i-lucide-message-circle",
    onSelect: () => {
      emit("navigate");
      feedbackOpen.value = true;
    },
  },
  {
    label: "FAQ",
    icon: "i-lucide-circle-help",
    to: "/faq",
  },
]);
</script>

<template>
  <div class="flex flex-col gap-1">
    <UNavigationMenu
      :collapsed="collapsed"
      :items="helpItems"
      orientation="vertical"
      tooltip
      aria-label="Help"
    />

    <p
      v-if="!collapsed"
      class="text-dimmed flex flex-wrap gap-x-3 gap-y-1 px-2.5 text-xs"
    >
      <NuxtLink to="/terms" class="hover:text-default transition-colors">
        Terms of Use
      </NuxtLink>

      <NuxtLink to="/privacy" class="hover:text-default transition-colors">
        Privacy Policy
      </NuxtLink>
    </p>
  </div>
</template>
