<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";

definePageMeta({
  layout: "auth",
});

useSeoMeta({
  title: "Forgot Password",
  description: "Reset your password.",
});

const toast = useToast();
const loading = ref(false);
const submitted = ref(false);

const schema = z.object({
  email: z.email("Must be a valid email address"),
});

type Schema = z.output<typeof schema>;

const state = reactive({
  email: "",
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;

  await $fetch("/api/auth/forgot-password", {
    method: "POST",
    body: { email: event.data.email },
  })
    .then(() => {
      submitted.value = true;
    })
    .catch((error) => {
      toast.add({
        title: "Something went wrong",
        color: "error",
        description: error.data?.statusMessage ?? "Please try again later.",
        icon: "material-symbols:error",
      });
    })
    .finally(() => {
      loading.value = false;
    });
}
</script>

<template>
  <UCard class="w-full max-w-sm bg-white/75 backdrop-blur dark:bg-white/5">
    <div class="w-full max-w-sm p-1">
      <div class="flex flex-col items-center justify-center">
        <Icon name="iconoir:lock" :size="40" />

        <h2 class="my-1 text-2xl font-bold">Forgot password</h2>

        <p class="text-center font-medium text-slate-600">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>

      <template v-if="submitted">
        <div
          class="mt-6 rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/20"
        >
          <Icon
            name="material-symbols:check-circle-outline"
            size="32"
            class="text-green-500"
          />

          <p class="mt-2 font-medium text-green-700 dark:text-green-400">
            Check your email
          </p>

          <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
            If an account exists for that email, we've sent a password reset
            link. Please allow a few minutes for the email to arrive, and check
            your spam folder if you don't see it.
          </p>
        </div>

        <div class="mt-4 text-center">
          <NuxtLink
            to="/login"
            class="text-primary-500 font-medium hover:underline"
          >
            Back to login
          </NuxtLink>
        </div>
      </template>

      <template v-else>
        <UForm
          :schema="schema"
          :state="state"
          class="mt-6 space-y-4"
          @submit="onSubmit"
        >
          <UFormField label="Email address" name="email">
            <UInput
              v-model="state.email"
              type="email"
              placeholder="you@example.com"
            />
          </UFormField>

          <UButton
            type="submit"
            class="flex w-full justify-center"
            :loading="loading"
          >
            <template #trailing>
              <Icon name="i-heroicons-arrow-right-20-solid" size="20" />
            </template>
            Send reset link
          </UButton>
        </UForm>

        <div class="mt-4 text-center text-sm">
          <NuxtLink
            to="/login"
            class="text-primary-500 font-medium hover:underline"
          >
            Back to login
          </NuxtLink>
        </div>
      </template>
    </div>
  </UCard>
</template>
