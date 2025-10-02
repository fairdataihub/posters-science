<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const { clear } = useUserSession();
const route = useRoute();

const logout = async () => {
  clear();
  await navigateTo("/login");
};

const headerItems = computed<NavigationMenuItem[]>(() => [
  {
    label: "Dashboard",
    to: "/app/dashboard",
    active: route.path.startsWith("/app/dashboard"),
  },
  {
    label: "Changelog",
    to: "https://github.com/fairdataihub/nuxt-starter/CHANGELOG.md",
    target: "_blank",
  },
]);

const footerItems: NavigationMenuItem[] = [
  {
    label: "Made with ♥ by the FAIR Data Innovations Hub",
    to: "https://fairdataihub.org",
    target: "_blank",
  },
];
</script>

<template>
  <div class="relative">
    <UiAuroraBackground class="absolute inset-0 -z-10 h-full" />

    <UHeader class="!hidden">
      <template #title>
        <NuxtLink to="/" class="flex text-2xl font-bold"> Nuxt App </NuxtLink>
      </template>

      <UNavigationMenu :items="headerItems" />

      <template #right>
        <UColorModeButton />

        <UTooltip text="Open on GitHub" :kbds="['meta', 'G']">
          <UButton
            color="neutral"
            variant="ghost"
            to="https://github.com/fairdataihub/nuxt-starter"
            target="_blank"
            icon="i-simple-icons-github"
            aria-label="GitHub"
          />
        </UTooltip>

        <AuthState v-slot="{ loggedIn }">
          <UButton
            v-if="loggedIn"
            color="neutral"
            variant="outline"
            @click="logout"
          >
            Logout
          </UButton>

          <div v-else class="flex items-center justify-center gap-3">
            <UButton to="/login" color="neutral" variant="outline">
              Sign in
            </UButton>

            <UButton to="/signup" color="neutral">
              <template #trailing>
                <Icon name="i-heroicons-arrow-right-20-solid" size="20" />
              </template>
              Sign up
            </UButton>
          </div>
        </AuthState>
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>

    <UFooter class="">
      <template #left>
        <p class="text-muted text-sm">
          Copyright © {{ new Date().getFullYear() }}
        </p>
      </template>

      <UNavigationMenu :items="footerItems" variant="link" color="primary" />

      <template #right>
        <UColorModeButton />

        <UButton
          icon="i-simple-icons-github"
          color="neutral"
          variant="ghost"
          to="https://github.com/fairdataihub/posters-science"
          target="_blank"
          aria-label="GitHub"
        />
      </template>
    </UFooter>
  </div>
</template>
