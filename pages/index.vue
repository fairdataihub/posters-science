<script setup lang="ts">
import { z } from "zod";

useSeoMeta({
  title: "Coming Live Fall 2026",
});

definePageMeta({
  layout: "public",
});

const toast = useToast();

const email = ref("");
const loading = ref(false);

// Email validation schema
const emailSchema = z.string().email("Please enter a valid email address");

const subscribe = async () => {
  loading.value = true;

  // Validate email before making API call
  const emailValidation = emailSchema.safeParse(email.value);

  if (!emailValidation.success) {
    toast.add({
      title: "Invalid Email",
      color: "error",
      description: emailValidation.error.errors[0].message,
    });
    loading.value = false;

    return;
  }

  await $fetch("/api/register", {
    body: {
      emailAddress: email.value,
    },
    method: "POST",
  })
    .then(() => {
      toast.add({
        title: "Thank you for subscribing!",
        color: "success",
        description: "You will be notified when posters.science goes live!",
      });
      email.value = ""; // Clear the input after successful subscription
    })
    .catch((error) => {
      toast.add({
        title: "Error",
        color: "error",
        description: error.message,
      });
    })
    .finally(() => {
      loading.value = false;
    });
};
</script>

<template>
  <div class="relative flex min-h-screen w-full items-center overflow-hidden">
    <section
      class="relative z-10 mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-12 px-4 py-8 lg:grid-cols-[2fr_1fr] lg:py-16"
    >
      <div class="space-y-6">
        <UiBlurReveal :delay="0.5" :duration="0.2">
          <h1 class="text-5xl font-extrabold">
            Posters.science
            <br />

            <span class="text-3xl"> Share Posters, Make Discoveries </span>
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
              posters.science goes live! You can also track progress, provide
              suggestions, or even contribute to this open source project
              through our
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
              type="email"
              size="xl"
              class="w-full"
              :disabled="loading"
            />
          </UiBlurReveal>

          <UiBlurReveal :delay="0.5" :duration="1">
            <UButton
              label="Subscribe"
              size="xl"
              color="primary"
              icon="i-lucide-at-sign"
              :loading="loading"
              :disabled="loading || !email"
              @click="subscribe"
            />
          </UiBlurReveal>
        </div>

        <div>
          <UiBlurReveal :delay="1" :duration="1" class="flex-1">
            <p class="text-md text-gray-600 dark:text-slate-400">
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

      <ClientOnly>
        <Vue3Lottie
          animation-link="/assets/lotties/construction.json"
          :autoplay="false"
          :height="1000"
          :width="700"
          :no-margin="true"
        />
      </ClientOnly>
    </section>
  </div>
</template>
