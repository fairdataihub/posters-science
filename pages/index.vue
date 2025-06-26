<script setup lang="ts">
useSeoMeta({
  title: "Home",
});

definePageMeta({
  layout: "public",
});

const email = ref("");

const subscribe = async () => {
  console.log(email.value);
};
</script>

<template>
  <div>
    <section class="bg-white">
      <div
        class="mx-auto grid max-w-screen-xl px-4 py-8 lg:grid-cols-12 lg:gap-8 lg:py-16 xl:gap-0"
      >
        <div class="mr-auto place-self-center lg:col-span-7">
          <h1
            class="mb-4 max-w-2xl text-4xl leading-none font-semibold tracking-tight md:text-5xl xl:text-6xl"
          >
            Posters.science
          </h1>

          <p class="mb-6 max-w-2xl text-2xl font-semibold text-gray-500">
            A brand new platform to create, manage and distribute your posters.
            FAIR for you and everyone else.
          </p>

          <p class="mb-3 max-w-2xl font-normal text-gray-500">
            Do you want to be the first to know when we launch? Enter your email
            below and we'll send you a notification when we're ready.
          </p>

          <div class="flex items-center gap-2">
            <UInput
              v-model="email"
              trailing-icon="i-lucide-at-sign"
              placeholder="Enter your email"
              size="md"
            />

            <UButton
              label="Subscribe"
              size="md"
              color="primary"
              icon="i-lucide-at-sign"
            />
          </div>
        </div>

        <div class="hidden lg:col-span-5 lg:mt-0 lg:flex">
          <img src="/assets/images/hero.png" alt="mockup" />
        </div>
      </div>
    </section>
  </div>
</template>
