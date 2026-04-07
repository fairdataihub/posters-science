<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const { clear } = useUserSession();
const feedbackOpen = useState("feedbackOpen", () => false);

const route = useRoute();

const logout = async () => {
  clear();
  await navigateTo("/");
};

const headerItems = computed<NavigationMenuItem[]>(() => [
  {
    label: "Dashboard",
    to: "/dashboard",
    active: route.path.startsWith("/dashboard"),
  },
  {
    label: "Find Posters",
    to: "/discover",
    active: route.path.startsWith("/discover"),
  },
  {
    label: "Share a Poster",
    to: "/share/new",
    active: route.path.startsWith("/share"),
  },
  // {
  //   label: "Learn More",
  //   to: "/about",
  //   active: route.path.startsWith("/about"),
  // },
  // {
  //   label: "Metrics",
  //   to: "/metrics",
  //   active: route.path.startsWith("/metrics"),
  // },
  {
    label: "GitHub",
    to: "https://github.com/fairdataihub/posters-science",
    target: "_blank",
  },
  {
    label: "Provide feedback",
    onSelect: () => {
      feedbackOpen.value = true;
    },
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
    <!-- <UiAuroraBackground class="absolute inset-0 -z-10 h-full" /> -->

    <UHeader>
      <template #title>
        <NuxtLink to="/" class="flex text-2xl font-bold">
          Posters.science
        </NuxtLink>
      </template>

      <UNavigationMenu :items="headerItems" />

      <template #right>
        <UColorModeButton />

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
            <UButton to="/login" variant="outline"> Sign in </UButton>

            <UButton to="/signup">
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

    <UFooter>
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

    <div class="fixed right-6 bottom-6 z-30">
      <UButton
        color="info"
        variant="solid"
        size="xl"
        class="rounded-full p-3"
        aria-label="How are we doing? Give us feedback!"
        @click="feedbackOpen = true"
      >
        <template #leading>
          <Icon name="material-symbols:rate-review" size="25" />
        </template>
      </UButton>
    </div>

    <UModal
      v-model:open="feedbackOpen"
      title="Share Your Feedback"
      description="Tell us how the experience was using our platform!"
      class="max-w-2xl"
      :ui="{ title: 'text-xl font-semibold' }"
    >
      <template #body>
        <iframe
          src="https://tally.so/embed/XxEBYP?alignLeft=1&hideTitle=1"
          width="100%"
          height="500"
          frameborder="0"
          title="Feedback form"
          class="dark:[filter:invert(1)_contrast(0.9)_brightness(1.2)]"
        />
      </template>
    </UModal>
  </div>
</template>
