<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps({
  title: { default: "Card Title", type: String },
  collapse: { default: false, type: Boolean },
});

// Each instance gets its own local collapse state.
const contentCollapsed = ref(props.collapse);

// Toggle function for collapsing/expanding the card.
function toggleCollapse() {
  contentCollapsed.value = !contentCollapsed.value;
}

// Compute UI classes based on the local collapse state.
const uiClasses = computed(() => ({
  body: `${contentCollapsed.value ? "opacity-0 -y-3 h-0 !p-0" : "opacity-100 y-0 max-h-auto !p-5"} transition-all origin-top duration-200 ease-in-out`,
  header: `${contentCollapsed.value ? "border-none" : "bg-gray-100"} transition-colors duration-300 py-0 px-0 !p-0 cursor-pointer hover:bg-gray-200 rounded-t-lg`,
  root: "shadow-md rounded-lg border border-gray-200 transition-all duration-200 select-none",
}));
</script>

<template>
  <!-- Spread uiClasses to create a new object for each instance -->
  <UCard :ui="{ ...uiClasses }">
    <!-- Card Header -->
    <template #header>
      <div
        class="flex items-center justify-between p-4"
        @click="toggleCollapse"
      >
        <h3 class="text-lg font-semibold text-sky-600">{{ title }}</h3>

        <UButton
          color="primary"
          variant="ghost"
          square
          :icon="contentCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'"
        />
      </div>
    </template>

    <!-- Card Body -->
    <div :class="contentCollapsed ? 'hidden' : 'block'">
      <slot />
    </div>
  </UCard>
</template>
