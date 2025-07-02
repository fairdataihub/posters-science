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
  <div class="relative flex min-h-screen w-full items-center overflow-hidden">
    <section
      class="relative z-10 mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-12 px-4 py-8 lg:grid-cols-[2fr_1fr] lg:py-16"
    >
      <div class="space-y-6">
        <UiBlurReveal :delay="0.5" :duration="1">
          <h1
            class="text-3xl leading-snug font-extrabold md:text-4xl lg:text-5xl"
          >
            A brand-new platform to
          </h1>
        </UiBlurReveal>

        <UiBlurReveal :delay="0.5" :duration="1">
          <ul class="ml-6 space-y-[1rem] text-3xl md:text-4xl lg:text-5xl">
            <li>- create</li>
            <li>- manage</li>
            <li>- distribute</li>
          </ul>
        </UiBlurReveal>

        <UiBlurReveal :delay="0.5" :duration="1">
          <h2 class="text-3xl font-extrabold md:text-4xl lg:text-5xl">
            your posters.<br />FAIR for you and everyone else.
          </h2>
        </UiBlurReveal>

        <UiBlurReveal :delay="1" :duration="1">
          <p class="max-w-prose text-lg text-gray-600 dark:text-slate-400">
            Do you want to be the first to know when we launch? Enter your email
            below and we'll send you a notification when we're ready.
          </p>
        </UiBlurReveal>

        <div class="flex items-center gap-3">
          <UiBlurReveal :delay="1" :duration="1" class="flex-1">
            <UInput
              v-model="email"
              trailing-icon="i-lucide-at-sign"
              placeholder="Enter your email"
              size="md"
              class="w-full"
            />
          </UiBlurReveal>
          <UiBlurReveal :delay="1" :duration="1">
            <UButton
              label="Subscribe"
              size="md"
              color="primary"
              icon="i-lucide-at-sign"
            />
          </UiBlurReveal>
        </div>
      </div>

      <UiBlurReveal
        class="hidden lg:flex lg:items-center lg:justify-end"
        :delay="0.5"
        :duration="1"
      >
        <img src="/assets/images/hero.png" alt="mockup" />
      </UiBlurReveal>
    </section>
  </div>
</template>
