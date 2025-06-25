<script setup lang="ts">
useSeoMeta({
  title: "Home",
});

definePageMeta({
  layout: "public",
});
</script>

<template>
  <div>
    <!-- Hero -->
    <div
      class="relative overflow-hidden before:absolute before:start-1/2 before:top-0 before:-z-1 before:size-full before:-translate-x-1/2 before:transform before:bg-[url('https://preline.co/assets/svg/examples/polygon-bg-element.svg')] before:bg-cover before:bg-top before:bg-no-repeat"
    >
      <div class="mx-auto max-w-[85rem] px-4 pb-10 sm:px-6 lg:px-8">
        <!-- Announcement Banner -->
        <div class="flex justify-center">
          <a
            class="inline-flex items-center gap-x-2 rounded-full border border-gray-200 bg-white p-1 ps-3 text-sm text-gray-800 transition hover:border-gray-300 focus:border-gray-300 focus:outline-hidden"
            href="#"
          >
            What's new? v1.0.0 is here!
            <span
              class="inline-flex items-center justify-center gap-x-2 rounded-full bg-gray-200 px-2.5 py-1.5 text-sm font-semibold text-gray-600"
            >
              <svg
                class="size-4 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </a>
        </div>
        <!-- End Announcement Banner -->

        <!-- Title -->
        <div class="mx-auto mt-5 max-w-2xl text-center">
          <h1
            class="block text-4xl font-bold text-gray-800 md:text-5xl lg:text-6xl dark:text-white"
          >
            Let's Build
            <span
              class="bg-linear-to-tl from-blue-600 to-violet-600 bg-clip-text text-transparent dark:from-violet-400 dark:to-blue-400"
              >Together</span
            >
          </h1>
        </div>
        <!-- End Title -->

        <div class="mx-auto mt-5 max-w-3xl text-center">
          <p class="text-lg text-gray-600">
            This is a Nuxt 3 starter template. It is built with Tailwind CSS and
            Nuxt UI. It is fully responsive and supports dark mode.
          </p>
        </div>

        <!-- Buttons -->
        <div class="mt-8 flex justify-center gap-3">
          <UButton
            label="Get Started"
            to="/app/dashboard"
            trailing-icon="heroicons-outline:arrow-right"
            color="primary"
            variant="solid"
          />

          <UButton
            label="Learn More"
            to="/app/dashboard"
            trailing-icon="heroicons-outline:arrow-right"
            color="primary"
            variant="outline"
          />
        </div>
        <!-- End Buttons -->
      </div>
    </div>
    <!-- End Hero -->

    <!-- Features -->
    <div class="mx-auto max-w-[85rem] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <!-- Grid -->
      <div class="grid grid-cols-2 gap-6 sm:gap-12 lg:grid-cols-3 lg:gap-8">
        <!-- Stats -->
        <div class="flex flex-col items-center justify-center">
          <h4
            class="text-lg font-semibold text-gray-800 sm:text-xl dark:text-neutral-200"
          >
            Accuracy rate
          </h4>

          <p class="mt-2 text-4xl font-bold text-blue-600 sm:mt-3 sm:text-6xl">
            99.95%
          </p>

          <p class="mt-1 text-gray-500 dark:text-neutral-500">
            in fulfilling orders
          </p>
        </div>
        <!-- End Stats -->

        <!-- Stats -->
        <div class="flex flex-col items-center justify-center">
          <h4
            class="text-lg font-semibold text-gray-800 sm:text-xl dark:text-neutral-200"
          >
            Startup businesses
          </h4>

          <p class="mt-2 text-4xl font-bold text-blue-600 sm:mt-3 sm:text-6xl">
            2,000+
          </p>

          <p class="mt-1 text-gray-500 dark:text-neutral-500">
            partner with us
          </p>
        </div>
        <!-- End Stats -->

        <!-- Stats -->
        <div class="flex flex-col items-center justify-center">
          <h4
            class="text-lg font-semibold text-gray-800 sm:text-xl dark:text-neutral-200"
          >
            Happy customer
          </h4>

          <p class="mt-2 text-4xl font-bold text-blue-600 sm:mt-3 sm:text-6xl">
            85%
          </p>

          <p class="mt-1 text-gray-500 dark:text-neutral-500">
            this year alone
          </p>
        </div>
        <!-- End Stats -->
      </div>
      <!-- End Grid -->
    </div>
    <!-- End Features -->

    <!-- Icon Blocks -->
    <div class="mx-auto max-w-[85rem] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div class="grid items-center gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <!-- Icon Block -->
        <a
          class="group group flex flex-col justify-center rounded-xl p-4 hover:bg-gray-50 focus:bg-gray-50 focus:outline-hidden md:p-7 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800"
          href="#"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white"
            >
              <Icon name="heroicons-outline:view-grid-add" size="25" />
            </div>

            <h3
              class="text-lg font-semibold text-gray-800 group-hover:text-gray-600 dark:text-white dark:group-hover:text-gray-400"
            >
              Responsive
            </h3>
          </div>

          <div class="mt-5">
            <p class="mt-1 text-base text-gray-600 dark:text-neutral-400">
              Responsive, and mobile-first project on the web
            </p>

            <div
              class="text-primary-500 flex items-center gap-1 text-sm group-hover:underline group-focus:underline"
            >
              Learn More
              <Icon name="heroicons-outline:arrow-right" size="15" />
            </div>
          </div>
        </a>
        <!-- End Icon Block -->

        <!-- Icon Block -->
        <a
          class="group flex flex-col justify-center rounded-xl p-4 hover:bg-gray-50 focus:bg-gray-50 focus:outline-hidden md:p-7 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800"
          href="#"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white"
            >
              <Icon name="heroicons-outline:view-grid-add" size="25" />
            </div>

            <h3
              class="text-lg font-semibold text-gray-800 group-hover:text-gray-600 dark:text-white dark:group-hover:text-gray-400"
            >
              Customizable
            </h3>
          </div>

          <div class="mt-5">
            <p class="mt-1 text-base text-gray-600 dark:text-neutral-400">
              Components are easily customized and extendable
            </p>

            <div
              class="text-primary-500 flex items-center gap-1 text-sm group-hover:underline group-focus:underline"
            >
              Learn More
              <Icon name="heroicons-outline:arrow-right" size="15" />
            </div>
          </div>
        </a>
        <!-- End Icon Block -->

        <!-- Icon Block -->
        <a
          class="group flex flex-col justify-center rounded-xl p-4 hover:bg-gray-50 focus:bg-gray-50 focus:outline-hidden md:p-7 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800"
          href="#"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white"
            >
              <Icon name="heroicons-outline:view-grid-add" size="25" />
            </div>

            <h3
              class="text-lg font-semibold text-gray-800 group-hover:text-gray-600 dark:text-white dark:group-hover:text-gray-400"
            >
              Documentation
            </h3>
          </div>

          <div class="mt-5">
            <p class="mt-1 text-base text-gray-600 dark:text-neutral-400">
              Every component and plugin is well documented
            </p>

            <div
              class="text-primary-500 flex items-center gap-1 text-sm group-hover:underline group-focus:underline"
            >
              Learn More
              <Icon name="heroicons-outline:arrow-right" size="15" />
            </div>
          </div>
        </a>
        <!-- End Icon Block -->

        <!-- Icon Block -->
        <a
          class="group flex flex-col justify-center rounded-xl p-4 hover:bg-gray-50 focus:bg-gray-50 focus:outline-hidden md:p-7 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800"
          href="#"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white"
            >
              <Icon name="heroicons-outline:view-grid-add" size="25" />
            </div>

            <h3
              class="text-lg font-semibold text-gray-800 group-hover:text-gray-600 dark:text-white dark:group-hover:text-gray-400"
            >
              24/7 Support
            </h3>
          </div>

          <div class="mt-5">
            <p class="mt-1 text-base text-gray-600 dark:text-neutral-400">
              Contact us 24 hours a day, 7 days a week
            </p>

            <div
              class="text-primary-500 flex items-center gap-1 text-sm group-hover:underline group-focus:underline"
            >
              Learn More
              <Icon name="heroicons-outline:arrow-right" size="15" />
            </div>
          </div>
        </a>
        <!-- End Icon Block -->
      </div>
    </div>
    <!-- End Icon Blocks -->
  </div>
</template>
