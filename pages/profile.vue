<script setup>
definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Profile",
});

const { data: userData } = await useFetch("/api/user");
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer class="py-8">
      <div class="space-y-6">
        <!-- Profile Card -->
        <div class="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <div class="flex flex-col items-center space-y-4">
            <UAvatar
              :text="
                userData?.givenName?.charAt(0)?.toUpperCase() ||
                userData?.familyName?.charAt(0)?.toUpperCase() ||
                '?'
              "
              size="3xl"
              class="bg-primary-500"
            />

            <div class="text-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ userData?.givenName }} {{ userData?.familyName }}
              </h1>

              <p class="text-gray-600 dark:text-gray-400">
                {{ userData?.emailAddress }}
              </p>

              <div class="mt-2">
                <UBadge
                  :color="userData?.emailVerified ? 'green' : 'red'"
                  :label="userData?.emailVerified ? 'Verified' : 'Not Verified'"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Account Information -->
        <div class="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 class="mb-6 text-xl font-semibold text-gray-900 dark:text-white">
            Account Information
          </h2>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                First Name
              </label>

              <p class="mt-1 text-gray-900 dark:text-white">
                {{ userData?.givenName }}
              </p>
            </div>

            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Last Name
              </label>

              <p class="mt-1 text-gray-900 dark:text-white">
                {{ userData?.familyName }}
              </p>
            </div>

            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email
              </label>

              <p class="mt-1 text-gray-900 dark:text-white">
                {{ userData?.emailAddress }}
              </p>
            </div>

            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Account Created
              </label>

              <p class="mt-1 text-gray-900 dark:text-white">
                {{ new Date(userData?.created).toLocaleDateString() }}
              </p>
            </div>

            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Last Updated
              </label>

              <p class="mt-1 text-gray-900 dark:text-white">
                {{ new Date(userData?.updated).toLocaleDateString() }}
              </p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Account Actions
          </h2>

          <div class="flex flex-wrap gap-4">
            <UButton
              color="primary"
              variant="solid"
              label="Change Password"
              icon="i-heroicons-key"
            />

            <UButton
              color="red"
              variant="soft"
              label="Delete Account"
              icon="i-heroicons-trash"
            />
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>
