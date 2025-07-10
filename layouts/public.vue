<script setup lang="ts"></script>

<template>
  <div class="relative flex min-h-screen flex-col overflow-auto">
    <UiAuroraBackground class="absolute inset-0 -z-10 h-full" />

    <!-- <AppPublicHeader class="relative z-20" /> -->

    <main class="relative z-10 flex flex-1 items-start justify-center">
      <slot />
    </main>

    <AppPublicFooter />
  </div>
</template>
