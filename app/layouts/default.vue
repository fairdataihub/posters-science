<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const { clear, user } = useUserSession();
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
  {
    label: "Metrics",
    to: "/metrics",
    active: route.path.startsWith("/metrics"),
  },
  // {
  //   label: "Provide feedback",
  //   onSelect: () => {
  //     feedbackOpen.value = true;
  //   },
  // },
]);

const profileDropdownItems = ref([
  [
    {
      label: `${user?.value?.givenName} ${user?.value?.familyName}`,
      avatar: {
        src: `https://api.dicebear.com/9.x/shapes/svg?seed=${user?.value?.id}`,
      },
      type: "label",
    },
    {
      icon: "material-symbols:account-circle",
      label: "Profile",
      to: "/profile",
    },
    {
      icon: "material-symbols:star",
      label: "Liked posters",
      to: "/liked",
    },
  ],
  [
    {
      icon: "majesticons:logout",
      label: "Logout",
      onSelect: logout,
    },
  ],
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
        <UButton
          color="neutral"
          variant="ghost"
          label="Give Feedback"
          @click="feedbackOpen = true"
        />

        <UColorModeButton />

        <AuthState>
          <template #default="{ loggedIn }">
            <NuxtLink v-if="!loggedIn" to="/login">
              <UButton size="lg" label="Log in" />
            </NuxtLink>

            <NuxtLink v-if="!loggedIn" to="/register">
              <UButton size="lg" label="Get started" />
            </NuxtLink>

            <UDropdownMenu
              :items="profileDropdownItems"
              arrow
              :content="{
                align: 'end',
              }"
              :ui="{
                content: 'w-48',
              }"
            >
              <UButton
                v-if="loggedIn"
                :avatar="{
                  src: `https://api.dicebear.com/9.x/shapes/svg?seed=${user?.id}`,
                }"
                size="xl"
                color="neutral"
                variant="ghost"
              />
            </UDropdownMenu>
          </template>

          <template #placeholder>
            <!-- this will be rendered on server side -->
            <USkeleton class="h-12 w-12 rounded-full" />
          </template>
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
