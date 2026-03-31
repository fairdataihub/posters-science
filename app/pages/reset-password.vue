<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";

definePageMeta({
  layout: "auth",
});

useSeoMeta({
  title: "Reset Password",
  description: "Choose a new password for your account.",
});

const route = useRoute();
const toast = useToast();
const loading = ref(false);
const success = ref(false);

const token = computed(() => route.query.token as string | undefined);

const schema = z
  .object({
    password: z.string().min(8, "Must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Schema = z.output<typeof schema>;

const state = reactive({
  password: "",
  confirmPassword: "",
});

const showPassword = ref(false);

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!token.value) return;

  loading.value = true;

  await $fetch("/api/auth/reset-password", {
    method: "POST",
    body: { token: token.value, password: event.data.password },
  })
    .then(() => {
      success.value = true;
    })
    .catch((error) => {
      toast.add({
        title: "Error resetting password",
        color: "error",
        description: error.data?.statusMessage ?? "Please try again.",
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

        <h2 class="my-1 text-2xl font-bold">Reset password</h2>
      </div>

      <template v-if="!token">
        <div
          class="mt-6 rounded-lg bg-red-50 p-4 text-center dark:bg-red-900/20"
        >
          <p class="font-medium text-red-700 dark:text-red-400">
            Invalid reset link
          </p>

          <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
            This link is missing a reset token.
          </p>
        </div>

        <div class="mt-4 text-center">
          <NuxtLink
            to="/forgot-password"
            class="text-primary-500 font-medium hover:underline"
          >
            Request a new link
          </NuxtLink>
        </div>
      </template>

      <template v-else-if="success">
        <div
          class="mt-6 rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/20"
        >
          <Icon
            name="material-symbols:check-circle-outline"
            size="32"
            class="text-green-500"
          />

          <p class="mt-2 font-medium text-green-700 dark:text-green-400">
            Password updated!
          </p>

          <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your password has been changed successfully.
          </p>
        </div>

        <div class="mt-4 text-center">
          <NuxtLink
            to="/login"
            class="text-primary-500 font-medium hover:underline"
          >
            Sign in
          </NuxtLink>
        </div>
      </template>

      <template v-else>
        <p class="mt-2 text-center text-sm font-medium text-slate-600">
          Choose a new password for your account.
        </p>

        <UForm
          :schema="schema"
          :state="state"
          class="mt-6 space-y-4"
          @submit="onSubmit"
        >
          <UFormField label="New password" name="password">
            <UInput
              v-model="state.password"
              :type="showPassword ? 'text' : 'password'"
            >
              <template #trailing>
                <Icon
                  name="solar:eye-linear"
                  size="16"
                  class="cursor-pointer text-slate-400 transition-colors hover:text-slate-600"
                  @mousedown="showPassword = true"
                  @mouseup="showPassword = false"
                />
              </template>
            </UInput>
          </UFormField>

          <UFormField label="Confirm new password" name="confirmPassword">
            <UInput v-model="state.confirmPassword" type="password" />
          </UFormField>

          <UButton
            type="submit"
            class="flex w-full justify-center"
            :loading="loading"
          >
            <template #trailing>
              <Icon name="i-heroicons-arrow-right-20-solid" size="20" />
            </template>
            Update password
          </UButton>
        </UForm>
      </template>
    </div>
  </UCard>
</template>
