<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";

const config = useRuntimeConfig();
const { loggedIn } = useUserSession();

if (loggedIn.value) {
  await navigateTo("/app/dashboard");
}

definePageMeta({
  layout: "auth",
});

useSeoMeta({
  title: "Signup",
});

const toast = useToast();
const loading = ref(false);

const showPassword = ref(false);

const schema = z.object({
  emailAddress: z.string().email(),
  familyName: z.string(),
  givenName: z.string(),
  password: z.string().min(8, "Must be at least 8 characters"),
});

type Schema = z.output<typeof schema>;

const state = reactive({
  emailAddress: "rick@example.com",
  familyName: "Sanchez",
  givenName: "Rick",
  password: "12345678",
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const body = {
    emailAddress: event.data.emailAddress,
    familyName: event.data.familyName,
    givenName: event.data.givenName,
    password: event.data.password,
  };

  loading.value = true;

  await $fetch("/api/auth/signup", {
    body,
    method: "POST",
  })
    .then(() => {
      toast.add({
        title: "Account created successfully",
        color: "info",
        description: config.public.ENABLE_EMAIL_VERIFICATION
          ? "Please check your email to verify your account before logging in."
          : "You can now log in to your account.",
        icon: "material-symbols:mail-outline",
      });
    })
    .catch((error) => {
      console.error(error.data);
      toast.add({
        title: "Error creating account",
        color: "error",
        description: error.data.statusMessage,
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
    <div class="w-full max-w-sm px-4 py-5 sm:p-6">
      <div class="flex flex-col items-center justify-center">
        <h2 class="my-1 text-2xl font-bold">Create an account</h2>

        <p class="font-medium text-slate-600">
          Already have an account?
          <NuxtLink to="/login" class="text-primary-500 font-medium">
            Login
          </NuxtLink>
        </p>
      </div>

      <UForm
        :schema="schema"
        :state="state"
        class="mt-6 space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Given or First Name" name="givenName">
          <UInput v-model="state.givenName" type="text" />
        </UFormField>

        <UFormField label="Family or Last Name" name="familyName">
          <UInput v-model="state.familyName" type="text" />
        </UFormField>

        <UFormField label="Email Address" name="emailAddress">
          <UInput v-model="state.emailAddress" type="email" />
        </UFormField>

        <UFormField label="Password" name="password">
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

        <UButton
          type="submit"
          class="flex w-full justify-center"
          :loading="loading"
        >
          Create account
        </UButton>
      </UForm>
    </div>

    <template #footer>
      <p class="text-center text-sm">
        By signing in, you agree to our
        <NuxtLink to="/signup" class="text-primary-500 text-sm font-medium">
          Terms of Service</NuxtLink
        >.
      </p>
    </template>
  </UCard>
</template>
