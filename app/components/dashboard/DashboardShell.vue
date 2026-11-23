<script setup lang="ts">
// The dashboard's frame: the site header stays on top, and the sidebar and
// the poster panel fill the window under it. The page sets appShell so the
// default layout leaves room for it.

const menuOpen = ref(false);

function closeMenu() {
  menuOpen.value = false;
}
</script>

<template>
  <!-- Absolute rather than fixed, so it sits under the site header. -->
  <UDashboardGroup unit="rem" class="absolute inset-0">
    <UDashboardSidebar
      id="dashboard"
      v-model:open="menuOpen"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ root: 'min-h-0', body: 'py-4' }"
    >
      <template #default="{ collapsed }">
        <slot name="sidebar" :collapsed="collapsed" :close-menu="closeMenu" />

        <DashboardSidebarHelp
          :collapsed="collapsed"
          class="mt-auto"
          @navigate="closeMenu"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="dashboard-posters" :ui="{ root: 'min-h-0' }">
      <template #header>
        <slot name="header" />
      </template>

      <template #body>
        <slot name="body" />
      </template>
    </UDashboardPanel>

    <slot />
  </UDashboardGroup>
</template>
