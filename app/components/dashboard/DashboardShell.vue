<script setup lang="ts">
// The signed-in app's frame, which the default layout puts around pages that
// set appShell: the site header stays on top, and the sidebar and the page's
// panel fill the window under it. Each page renders its own panel with
// DashboardPage, so the sidebar stays put while moving between pages. The
// sidebar shows from lg up; below that the site header's menu has its links.
</script>

<template>
  <!-- Absolute rather than fixed, so it sits under the site header. -->
  <UDashboardGroup unit="rem" class="absolute inset-0">
    <UDashboardSidebar
      id="dashboard"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ root: 'min-h-0', body: 'py-4' }"
    >
      <template #default="{ collapsed }">
        <DashboardSidebarNav :collapsed="collapsed" />

        <DashboardSidebarFooter :collapsed="collapsed" class="mt-auto" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
