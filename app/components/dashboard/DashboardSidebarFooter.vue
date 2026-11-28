<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

// The foot of the sidebar: the person's profile and settings, then the help
// and legal links the site footer carries on other pages. Contact Us stays in
// the site header, so it's in one place.

defineProps<{
  collapsed?: boolean;
}>();

// Lazy so it never holds up the page.
const { data: profileSettings } = useFetch("/api/user", { lazy: true });

// A public profile opens in a new tab, so the page you're on stays put. A
// private one leads to Settings, where it can be made public.
const profileItem = computed<NavigationMenuItem>(() => {
  const settings = profileSettings.value;

  if (!settings) {
    return {
      label: "Public profile",
      icon: "i-lucide-globe",
      disabled: true,
    };
  }

  if (settings.profilePublic && settings.profilePath) {
    return {
      label: "Public profile",
      icon: "i-lucide-globe",
      to: settings.profilePath,
      target: "_blank",
    };
  }

  return {
    label: "Private profile",
    icon: "i-lucide-lock",
    to: "/profile",
    // Settings is the link for that page.
    active: false,
  };
});

const items = computed<NavigationMenuItem[][]>(() => [
  [
    profileItem.value,
    {
      label: "Settings",
      icon: "i-lucide-settings",
      to: "/profile",
      exact: true,
    },
  ],
  [
    {
      label: "FAQ",
      icon: "i-lucide-circle-help",
      to: "/faq",
    },
    {
      label: "Terms of Use",
      icon: "i-lucide-scroll-text",
      to: "/terms",
    },
    {
      label: "Privacy Policy",
      icon: "i-lucide-shield-check",
      to: "/privacy",
    },
  ],
]);
</script>

<template>
  <UNavigationMenu
    :collapsed="collapsed"
    :items="items"
    orientation="vertical"
    tooltip
    aria-label="Account and help"
  />
</template>
