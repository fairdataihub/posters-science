<script setup lang="ts">
const { clear } = useUserSession();

const logout = async () => {
  clear();
  await navigateTo("/login");
};
</script>

<template>
  <!-- sticky so it floats over the aurora background -->
  <header
    class="sticky top-0 w-full border-b border-gray-300 bg-transparent backdrop-blur-3xl"
  >
    <div
      class="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"
    >
      <NuxtLink to="/" class="flex text-2xl font-bold">
        Posters.science
      </NuxtLink>

      <div class="flex hidden items-center gap-5">
        <div class="flex items-center justify-center gap-3">
          <NuxtLink to="/app/dashboard" class="text-base font-medium">
            Dashboard
          </NuxtLink>

          <NuxtLink to="/profile" class="text-base font-medium">
            Profile
          </NuxtLink>
        </div>

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
      </div>
    </div>
  </header>
</template>
