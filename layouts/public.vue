<script setup lang="ts"></script>

<template>
  <div class="relative flex max-h-screen flex-col">
    <UiAuroraBackground class="absolute inset-0 -z-10" />

    <!-- <AppPublicHeader class="relative z-20" /> -->

    <main
      class="relative z-10 flex flex-1 items-center justify-center overflow-hidden"
    >
      <slot />
    </main>

    <AppPublicFooter />
  </div>
</template>
