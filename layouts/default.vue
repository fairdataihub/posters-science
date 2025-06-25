<script setup lang="ts">
const sidebarCollapsed = ref(false);
</script>

<template>
  <div
    class="flex min-h-screen w-full overflow-hidden bg-gray-100 dark:bg-gray-900"
  >
    <!-- Main Content -->
    <main class="mx-auto flex-1 transition-all duration-300">
      <DashboardHeader @update:sidebar-collapsed="sidebarCollapsed = $event" />

      <!-- Page Content -->
      <div class="mt-18 w-full px-6">
        <slot />
      </div>
    </main>
  </div>
</template>
