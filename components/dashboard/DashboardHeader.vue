<script setup lang="ts">
const { clear, loggedIn, user } = useUserSession();

// Showing an alert for now but can redirect to a verification page later if needed
const emailVerified = computed(
  () => loggedIn.value && user.value?.emailVerified,
);

// Emit event setup
const emit = defineEmits(["update:sidebar-collapsed"]);

const sidebarCollapsed = ref(true);

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  emit("update:sidebar-collapsed", sidebarCollapsed.value);
};

const logout = async () => {
  clear();
  await navigateTo("/login");
};
</script>

<template>
  <!-- Dashboard Header -->
  <header
    class="fixed top-0 right-0 left-0 z-10 block w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
  >
    <!-- Alert for email verification -->
    <div
      v-if="!emailVerified"
      class="flex items-center justify-center gap-2 bg-red-500 p-1 text-sm font-semibold text-white"
    >
      <Icon name="ic:baseline-warning" size="16" />

      <span> Please verify your email address. </span>
    </div>

    <div class="mx-auto flex items-center justify-between px-4 py-2">
      <!-- Logo -->
      <div class="flex items-center gap-1">
        <UButton
          :icon="
            sidebarCollapsed
              ? 'tabler:layout-sidebar-right-collapse-filled'
              : 'tabler:layout-sidebar-left-collapse-filled'
          "
          variant="ghost"
          color="neutral"
          size="lg"
          @click="toggleSidebar"
        />

        <NuxtLink to="/" class="flex text-2xl font-bold"> Nuxt App </NuxtLink>
      </div>

      <!-- User Menu (Inbox, Docs, Settings) -->
      <div class="flex items-center justify-center gap-3">
        <UTooltip text="Inbox">
          <UButton
            to="/inbox"
            color="neutral"
            variant="ghost"
            icon="material-symbols:inbox-rounded"
          />
        </UTooltip>

        <UTooltip placement="bottom" text="View Documentation">
          <UButton
            to="https://nuxt.com"
            target="_blank"
            color="neutral"
            variant="ghost"
            icon="heroicons-outline:question-mark-circle"
          />
        </UTooltip>

        <UTooltip text="View Settings">
          <UButton
            icon="heroicons-outline:cog"
            color="neutral"
            to="/settings"
            variant="ghost"
          />
        </UTooltip>

        <UTooltip text="Toggle Color Mode">
          <AppColorModeButton />
        </UTooltip>

        <!-- Logged In State -->
        <AuthState>
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
      </div>
    </div>
  </header>
</template>
