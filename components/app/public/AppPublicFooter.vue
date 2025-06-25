<script setup lang="ts"></script>

<template>
  <footer class="border-t border-gray-200 pt-6 dark:border-gray-800">
    <div class="mx-auto max-w-screen-xl">
      <div class="px-10 md:flex md:justify-between">
        <div class="mb-6 md:mb-0">
          <h2 class="text-2xl font-bold">Nuxt Starter</h2>
          <p class="text-lg">
            Lorem ipsum dolor sit amet, consectetur adipisicing elit.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <div>
            <h2
              class="mb-2 text-sm font-semibold text-gray-900 uppercase dark:text-white"
            >
              Resources
            </h2>
            <ul class="flex flex-col gap-1">
              <li>
                <a href="/" class="hover:underline"> Link uno </a>
              </li>
              <li>
                <a href="/" class="hover:underline"> Link due </a>
              </li>
              <li>
                <a href="/" class="hover:underline"> Link tre </a>
              </li>
            </ul>
          </div>

          <div>
            <h2
              class="mb-2 text-sm font-semibold text-gray-900 uppercase dark:text-white"
            >
              Legal
            </h2>
            <ul class="flex flex-col gap-1">
              <li>
                <a href="#" class="hover:underline">Privacy Policy</a>
              </li>
              <li>
                <a href="#" class="hover:underline">Terms &amp; Conditions</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <USeparator class="mx-auto my-4 max-w-screen-xl" />

    <div
      class="mx-auto flex max-w-screen-xl items-center justify-between px-4 pb-4 sm:px-6 lg:px-8"
    >
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Copyright © {{ new Date().getFullYear() }}. All rights reserved.
      </p>

      <div class="flex items-center gap-x-2">
        <AppColorModeButton />

        <UButton
          to="https://github.com/fairdataihub"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          color="neutral"
          variant="ghost"
        />

        <UButton
          to="https://discord.gg/fairdataihub"
          target="_blank"
          icon="i-simple-icons-discord"
          aria-label="Discord"
          color="neutral"
          variant="ghost"
        />

        <UButton
          to="https://twitter.com/fairdataihub"
          target="_blank"
          icon="i-simple-icons-twitter"
          aria-label="Twitter"
          color="neutral"
          variant="ghost"
        />

        <UButton
          to="https://www.youtube.com/fairdataihub"
          target="_blank"
          icon="i-simple-icons-youtube"
          aria-label="YouTube"
          color="neutral"
          variant="ghost"
        />
      </div>
    </div>
  </footer>
</template>
