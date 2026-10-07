<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const { clear, user } = useUserSession();
const feedbackOpen = useState("feedbackOpen", () => false);
const mobileMenuOpen = ref(false);

const route = useRoute();

function openFeedback() {
  mobileMenuOpen.value = false;
  feedbackOpen.value = true;
}

const logout = async () => {
  clear();
  await navigateTo("/");
};

const postersNavChildren = [
  {
    label: "Share a Poster",
    description: "Upload and publish your research poster.",
    icon: "line-md:file-upload",
    to: "/share/new",
  },
  {
    label: "Share Posters in bulk",
    description: "Name a batch and import many posters with license metadata.",
    icon: "material-symbols:library-add",
    to: "/share/new-bulk",
  },
  {
    label: "Browse Posters",
    description: "Browse and discover scientific posters.",
    icon: "material-symbols:saved-search",
    to: "/discover",
  },
] as const;

const conferencesNavChildren = [
  {
    label: "Conference management",
    description:
      "Register a conference on Posters.Science. View pending registrations, manage conferences you organize, and import participant posters after acceptance.",
    icon: "material-symbols:event-available",
    to: "/conferences/management",
  },
  {
    label: "Browse Conferences",
    description:
      "Browse supported conferences and submit a poster to a conference.",
    icon: "material-symbols:saved-search",
    to: "/conferences",
  },
] as const;

type NavDropdownMenu = {
  label: string;
  contentWidth: string;
  children: readonly {
    label: string;
    description: string;
    icon: string;
    to: string;
  }[];
};

const desktopNavDropdowns: NavDropdownMenu[] = [
  {
    label: "Posters",
    contentWidth: "w-72",
    children: postersNavChildren,
  },
  {
    label: "Conferences",
    contentWidth: "w-96",
    children: conferencesNavChildren,
  },
];

function desktopNavLinkClass(active: boolean) {
  return [
    "group relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors before:absolute before:inset-x-px before:inset-y-0 before:-z-10 before:rounded-md",
    active
      ? "text-primary before:bg-elevated"
      : "text-muted hover:text-highlighted hover:before:bg-elevated/50",
  ];
}

const headerItems = computed<NavigationMenuItem[]>(() => [
  {
    label: "Dashboard",
    to: "/dashboard",
    active: route.path.startsWith("/dashboard"),
  },
  {
    label: "Posters",
    value: "posters",
    type: "trigger",
    children: [...postersNavChildren],
  },
  {
    label: "Conferences",
    value: "conferences",
    type: "trigger",
    children: [...conferencesNavChildren],
  },
  {
    label: "Documentation",
    to: "https://docs.posters.science",
    target: "_blank",
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

const profileDropdownItems = computed(() => [
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
    ...(user?.value?.role === "admin"
      ? [
          {
            icon: "material-symbols:admin-panel-settings",
            label: "Admin",
            to: "/admin",
          },
        ]
      : []),
  ],
  [
    {
      icon: "majesticons:logout",
      label: "Logout",
      onSelect: logout,
    },
  ],
]);

const mobileProfileNavItems = computed<NavigationMenuItem[]>(() => [
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
  {
    icon: "majesticons:logout",
    label: "Logout",
    onSelect: logout,
  },
]);

const mobileFeedbackNavItems: NavigationMenuItem[] = [
  {
    icon: "material-symbols:rate-review",
    label: "Contact Us",
    onSelect: openFeedback,
  },
];

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

    <UHeader
      v-model:open="mobileMenuOpen"
      :ui="{
        left: 'lg:flex-none',
        center: 'flex-1 justify-center overflow-visible',
        container: 'overflow-visible',
        right: 'lg:flex-none',
      }"
    >
      <template #title>
        <NuxtLink to="/" class="flex text-2xl font-bold">
          Posters.science
        </NuxtLink>
      </template>

      <nav class="hidden items-center gap-1.5 lg:flex">
        <ULink
          to="/dashboard"
          :class="desktopNavLinkClass(route.path.startsWith('/dashboard'))"
        >
          Dashboard
        </ULink>

        <UPopover
          v-for="dropdown in desktopNavDropdowns"
          :key="dropdown.label"
          arrow
          mode="hover"
          :content="{ side: 'bottom', align: 'start', sideOffset: 6 }"
          :ui="{ content: `${dropdown.contentWidth} p-0 z-50` }"
        >
          <button type="button" :class="desktopNavLinkClass(false)">
            {{ dropdown.label }}
            <UIcon
              name="i-lucide-chevron-down"
              class="size-5 shrink-0 opacity-70"
            />
          </button>

          <template #content>
            <ul class="flex flex-col gap-1 p-2">
              <li v-for="child in dropdown.children" :key="child.to">
                <ULink
                  :to="child.to"
                  class="group hover:bg-elevated/50 flex items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors"
                >
                  <UIcon
                    :name="child.icon"
                    class="text-dimmed group-hover:text-default size-5 shrink-0"
                  />
                  <span class="min-w-0">
                    <span class="text-highlighted block font-medium">
                      {{ child.label }}
                    </span>
                    <span class="text-muted text-balance whitespace-normal">
                      {{ child.description }}
                    </span>
                  </span>
                </ULink>
              </li>
            </ul>
          </template>
        </UPopover>

        <ULink
          to="https://docs.posters.science"
          target="_blank"
          :class="desktopNavLinkClass(false)"
        >
          Documentation
        </ULink>

        <ULink
          to="/metrics"
          :class="desktopNavLinkClass(route.path.startsWith('/metrics'))"
        >
          Metrics
        </ULink>
      </nav>

      <template #right>
        <UButton
          class="hidden lg:inline-flex"
          color="neutral"
          variant="ghost"
          label="Contact Us"
          @click="feedbackOpen = true"
        />

        <UColorModeButton />

        <AuthState>
          <template #default="{ loggedIn }">
            <NuxtLink
              v-if="!loggedIn"
              to="/login"
              class="hidden lg:inline-flex"
            >
              <UButton size="lg" label="Log in" />
            </NuxtLink>

            <NuxtLink
              v-if="!loggedIn"
              to="/signup"
              class="hidden lg:inline-flex"
            >
              <UButton size="lg" label="Get started" />
            </NuxtLink>

            <UDropdownMenu
              :items="profileDropdownItems"
              arrow
              :content="{ align: 'end' }"
              :ui="{ content: 'w-48' }"
            >
              <div v-if="loggedIn" class="relative inline-flex">
                <UButton
                  :avatar="{
                    src: `https://api.dicebear.com/9.x/shapes/svg?seed=${user?.id}`,
                  }"
                  size="xl"
                  color="neutral"
                  variant="ghost"
                />

                <span
                  v-if="user?.role === 'admin'"
                  class="bg-primary absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full"
                >
                  <Icon
                    name="material-symbols:crown"
                    size="10"
                    class="text-white"
                  />
                </span>
              </div>
            </UDropdownMenu>
          </template>

          <template #placeholder>
            <!-- this will be rendered on server side -->
            <USkeleton class="h-12 w-12 rounded-full" />
          </template>
        </AuthState>
      </template>

      <template #body>
        <UNavigationMenu
          :items="headerItems"
          orientation="vertical"
          class="w-full"
          :ui="{ childLinkDescription: 'text-balance whitespace-normal' }"
        />

        <USeparator />

        <AuthState>
          <template #default="{ loggedIn }">
            <div v-if="!loggedIn" class="flex flex-col gap-2">
              <NuxtLink to="/login" class="w-full">
                <UButton
                  block
                  color="neutral"
                  variant="outline"
                  label="Log in"
                />
              </NuxtLink>

              <NuxtLink to="/signup" class="w-full">
                <UButton block label="Get started" />
              </NuxtLink>
            </div>

            <div v-else class="flex flex-col">
              <div class="flex items-center gap-3 px-3 py-2">
                <UAvatar
                  :src="`https://api.dicebear.com/9.x/shapes/svg?seed=${user?.id}`"
                  size="md"
                />

                <span class="truncate font-medium">
                  {{ user?.givenName }} {{ user?.familyName }}
                </span>
              </div>

              <UNavigationMenu
                :items="mobileProfileNavItems"
                orientation="vertical"
                class="w-full"
              />
            </div>
          </template>

          <template #placeholder>
            <USkeleton class="h-10 w-full rounded-md" />
          </template>
        </AuthState>

        <USeparator />

        <UNavigationMenu
          :items="mobileFeedbackNavItems"
          orientation="vertical"
          class="w-full"
        />
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
