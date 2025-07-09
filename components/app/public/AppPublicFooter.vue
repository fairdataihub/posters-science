<script setup lang="ts"></script>

<template>
  <footer class="border-t border-gray-200 pt-6 dark:border-gray-800">
    <div
      class="mx-auto flex max-w-screen-2xl items-center justify-between px-4 pb-4 sm:px-6 lg:px-8"
    >
      <!-- <p class="text-sm text-gray-500 dark:text-gray-400">
        Copyright © {{ new Date().getFullYear() }}. All rights reserved.
      </p> -->

      <div
        class="mx-auto flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400"
      >
        <span>Made with</span>
        <!-- Heart SVG… -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="16"
          viewBox="0 0 256 256"
        >
          <g fill="#a782ec">
            <path
              d="M232 102c0 66-104 122-104 122S24 168 24 102a54 54 0 0 1 54-54c22.59 0 41.94 12.31 50 32c8.06-19.69 27.41-32 50-32a54 54 0 0 1 54 54"
              opacity="0.2"
            />

            <path
              d="M178 40c-20.65 0-38.73 8.88-50 23.89C116.73 48.88 98.65 40 78 40a62.07 62.07 0 0 0-62 62c0 70 103.79 126.66 108.21 129a8 8 0 0 0 7.58 0C136.21 228.66 240 172 240 102a62.07 62.07 0 0 0-62-62m-50 174.8c-18.26-10.64-96-59.11-96-112.8a46.06 46.06 0 0 1 46-46c19.45 0 35.78 10.36 42.6 27a8 8 0 0 0 14.8 0c6.82-16.67 23.15-27 42.6-27a46.06 46.06 0 0 1 46 46c0 53.61-77.76 102.15-96 112.8"
            />
          </g>
        </svg>
        <span>by the</span>
        <a
          href="https://fairdataihub.org"
          class="text-blue-600 hover:underline dark:text-blue-400"
          target="_blank"
        >
          FAIR Data Innovations Hub
        </a>
      </div>

      <div class="flex items-center gap-x-2">
        <AppColorModeButton />
        <UButton
          to="https://github.com/fairdataihub/posters-science"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />
      </div>
    </div>
  </footer>
</template>
