<script setup lang="ts">
useSeoMeta({
  title: "Home",
});

definePageMeta({
  layout: "public",
});

const email = ref("");

const subscribe = () => {
  console.log(email.value);
};
</script>

<template>
  <div class="relative flex min-h-screen w-full items-center overflow-hidden">
    <section
      class="relative z-10 mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-12 px-4 py-8 lg:grid-cols-[2fr_1fr] lg:py-16"
    >
      <div class="space-y-6">
        <UiBlurReveal :delay="0.5" :duration="0.2">
          <h1
            class="text-3xl leading-snug font-extrabold md:text-4xl lg:text-5xl"
          >
            Posters.science: Share Posters<br />Make Discoveries
          </h1>
        </UiBlurReveal>

        <UiBlurReveal class="space-y-6" :delay="0.2" :duration="0.5">
          <div>
            <h2 class="flex items-center gap-2 font-bold">
              <Icon name="fxemoji:lightbulb" style="color: black" size="26" />

              <span>The Untapped Power of Scientific Posters</span>
            </h2>

            <p class="max-w-prose text-lg text-gray-600 dark:text-slate-400">
              Millions of posters are presented at scientific conferences and
              meetings every year. They contain a wealth of early stage
              knowledge that could enhance the pace of discoveries, support
              funding decisions, and more. However, these posters often vanish
              into obscurity after their presentation.
            </p>
          </div>

          <div>
            <h2 class="flex items-center gap-2 font-bold">
              <Icon name="fluent-emoji:rocket" style="color: black" size="26" />

              <span>Enter Posters.science</span>
            </h2>

            <p class="max-w-prose text-lg text-gray-600 dark:text-slate-400">
              Not anymore! We are building posters.science, a free and
              open-source platform that helps researchers find a lasting home
              for their posters and get recognition for their effort. The
              platform will make it easier for researchers to share their
              posters on archival repositories like Zenodo and Figshare with
              AI-powered tools that extract rich metadata to make posters FAIR
              (Findable, Accessible, Interoperable, Reusable) and AI-ready.
            </p>
          </div>

          <div>
            <h2 class="flex items-center gap-2 font-bold">
              <Icon name="twemoji:microscope" style="color: black" size="26" />

              <span>From Posters to Breakthroughs</span>
            </h2>

            <p class="max-w-prose text-lg text-gray-600 dark:text-slate-400">
              Posters.science doesn't just stop at sharing posters. The platform
              will also includes tools to easily find, explore, and extract
              knowledge from posters to answer research questions, generate
              hypothesis, develop AI models, and much more.
            </p>
          </div>

          <div>
            <h2 class="flex items-center gap-2 font-bold">
              <Icon
                name="flat-color-icons:calendar"
                style="color: black"
                size="26"
              />

              <span>Fall 2026</span>
            </h2>

            <p class="max-w-prose text-lg text-gray-600 dark:text-slate-400">
              Enter your email below and we will send you a notification when
              posters.science goes live! You can also track progress from our
              <NuxtLink
                to="https://github.com/fairdataihub/posters-science"
                target="_blank"
                class="text-blue-600 hover:underline dark:text-blue-400"
              >
                GitHub repository
              </NuxtLink>
            </p>
          </div>
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

          <UiBlurReveal :delay="0.5" :duration="1">
            <UButton
              label="Subscribe"
              size="md"
              color="primary"
              icon="i-lucide-at-sign"
            />
          </UiBlurReveal>
        </div>

        <div>
          <UiBlurReveal :delay="1" :duration="1" class="flex-1">
            <p class="text-md max-w-prose text-gray-600 dark:text-slate-400">
              The development of posters.science is supported by a grant from
              <NuxtLink
                to="https://www.navigation.org/"
                target="_blank"
                class="text-blue-600 hover:underline dark:text-blue-400"
              >
                The Navigation Fund
              </NuxtLink>
            </p>
          </UiBlurReveal>
        </div>
      </div>

      <UiBlurReveal
        class="hidden lg:flex lg:items-center lg:justify-end"
        :delay="1"
        :duration="1"
      >
        <ClientOnly>
          <Vue3Lottie
            animation-link="/assets/lotties/construction.json"
            :autoplay="false"
            :height="1000"
            :width="700"
            :no-margin="true"
          />
        </ClientOnly>
      </UiBlurReveal>
    </section>
  </div>
</template>
