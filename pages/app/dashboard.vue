<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Dashboard",
});
</script>

<template>
  <div>
    <UBreadcrumb
      class="mb-4 ml-2"
      :items="[
        { label: 'Home', to: '/' },
        { label: 'Dashboard', to: '/app/dashboard' },
      ]"
    />

    <div class="flex w-full flex-col gap-6">
      <div
        class="flex flex-wrap items-center justify-between rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900"
      >
        <div>
          <h1 class="text-2xl font-bold">Dashboard</h1>

          <p class="text-gray-600 dark:text-gray-400">Manage your app here</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <!-- Active Studies Card -->
        <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Active Studies
              </p>

              <h3 class="text-2xl font-semibold">12</h3>
            </div>

            <div class="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
              <Icon
                name="material-symbols:science"
                class="text-blue-600 dark:text-blue-400"
                size="24"
              />
            </div>
          </div>

          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            +2 new this month
          </p>
        </div>

        <!-- Total Participants Card -->
        <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Total Participants
              </p>

              <h3 class="text-2xl font-semibold">1,284</h3>
            </div>

            <div class="rounded-full bg-green-100 p-3 dark:bg-green-900">
              <Icon
                name="mdi:account-group"
                class="text-green-600 dark:text-green-400"
                size="24"
              />
            </div>
          </div>

          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            +156 from last month
          </p>
        </div>

        <!-- Storage Used Card -->
        <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Storage Used
              </p>

              <h3 class="text-2xl font-semibold">2.1 TB</h3>
            </div>

            <div class="rounded-full bg-purple-100 p-3 dark:bg-purple-900">
              <Icon
                name="material-symbols:database"
                class="text-purple-600 dark:text-purple-400"
                size="24"
              />
            </div>
          </div>

          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            75% of total storage
          </p>
        </div>

        <!-- Recent Activity Card -->
        <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Recent Activity
              </p>

              <h3 class="text-2xl font-semibold">28</h3>
            </div>

            <div class="rounded-full bg-orange-100 p-3 dark:bg-orange-900">
              <Icon
                name="material-symbols:activity-zone"
                class="text-orange-600 dark:text-orange-400"
                size="24"
              />
            </div>
          </div>

          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Last 7 days
          </p>
        </div>

        <!-- Pending Requests Card -->
        <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Pending Requests
              </p>

              <h3 class="text-2xl font-semibold">5</h3>
            </div>

            <div class="rounded-full bg-red-100 p-3 dark:bg-red-900">
              <Icon
                name="material-symbols:pending-actions"
                class="text-red-600 dark:text-red-400"
                size="24"
              />
            </div>
          </div>

          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            3 require attention
          </p>
        </div>

        <!-- Data Processing Card -->
        <div class="rounded-lg bg-white p-6 shadow-sm dark:bg-gray-900">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Processing Jobs
              </p>

              <h3 class="text-2xl font-semibold">8</h3>
            </div>

            <div class="rounded-full bg-cyan-100 p-3 dark:bg-cyan-900">
              <Icon
                name="material-symbols:settings"
                class="text-cyan-600 dark:text-cyan-400"
                size="24"
              />
            </div>
          </div>

          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            2 currently running
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
