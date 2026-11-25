<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

// One page in the signed-in app shell. The header says where you are, with
// the page's description under it and its actions on the right. An optional
// toolbar, such as a search row, sits under the header, then the scrolling
// body. The sidebar comes from the layout (see DashboardShell).

export type DashboardPageCrumb = { label: string; to?: RouteLocationRaw };

withDefaults(
  defineProps<{
    title?: string;
    /** The pages above this one, shown before the title. */
    breadcrumb?: DashboardPageCrumb[];
    description?: string;
  }>(),
  {
    title: "",
    breadcrumb: () => [],
    description: "",
  },
);

const slots = useSlots();
</script>

<template>
  <UDashboardPanel id="app-page" :ui="{ root: 'min-h-0' }">
    <template #header>
      <!-- No sidebar toggle: on mobile the site header's menu holds the
           sidebar's links (see the default layout). -->
      <UDashboardNavbar
        :toggle="false"
        :ui="{
          root: 'h-auto min-h-(--ui-header-height) py-3',
          left: 'min-w-0 items-start',
          right: 'gap-3',
        }"
      >
        <template #left>
          <UDashboardSidebarCollapse class="shrink-0" />

          <div class="min-w-0 pt-0.5">
            <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <nav
                v-if="breadcrumb.length"
                aria-label="Breadcrumb"
                class="contents"
              >
                <template
                  v-for="(crumb, index) in breadcrumb"
                  :key="`${index}-${crumb.label}`"
                >
                  <ULink
                    v-if="crumb.to"
                    :to="crumb.to"
                    class="text-muted hover:text-default max-w-60 truncate transition-colors"
                  >
                    {{ crumb.label }}
                  </ULink>

                  <span v-else class="text-muted max-w-60 truncate">
                    {{ crumb.label }}
                  </span>

                  <span class="text-dimmed" aria-hidden="true">/</span>
                </template>
              </nav>

              <h1
                class="text-highlighted flex min-w-0 items-center gap-2 font-semibold"
              >
                <slot name="title">
                  <span class="truncate">{{ title }}</span>
                </slot>
              </h1>
            </div>

            <p
              v-if="description || slots.description"
              class="text-muted mt-1.5 max-w-3xl text-sm"
            >
              <slot name="description">{{ description }}</slot>
            </p>
          </div>
        </template>

        <template #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>

      <slot name="toolbar" />
    </template>

    <template #body>
      <slot />
    </template>
  </UDashboardPanel>
</template>
