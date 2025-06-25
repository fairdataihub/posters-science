<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";

const { loggedIn } = useUserSession();
const route = useRoute();

const routeQueryParams = route.query;

if (loggedIn.value) {
  await navigateTo("/app/dashboard");
}

definePageMeta({
  layout: "auth",
});

useSeoMeta({
  title: "Login",
});

const toast = useToast();
const loading = ref(false);

const showPassword = ref(false);

const schema = z.object({
  emailAddress: z.string().email(),
  password: z.string().min(8, "Must be at least 8 characters"),
});

type Schema = z.output<typeof schema>;

const state = reactive({
  emailAddress: "rick@example.com",
  password: "12345678",
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const body = {
    emailAddress: event.data.emailAddress,
    password: event.data.password,
  };

  loading.value = true;

  await $fetch("/api/auth/login", {
    body,
    method: "POST",
  })
    .then(() => {
      toast.add({
        title: "Login successful",
        description: "You can now access your account",
        icon: "material-symbols:check-circle-outline",
      });

      if (routeQueryParams.redirect) {
        console.log("redirecting to", routeQueryParams.redirect);

        window.location.href = routeQueryParams.redirect as string;
      } else {
        window.location.href = "/app/dashboard";
      }
    })
    .catch((error) => {
      console.error(error);

      toast.add({
        title: "Error logging in",
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
        <Icon name="iconoir:lock" :size="40" />

        <h2 class="my-1 text-2xl font-bold">Welcome back</h2>

        <p class="font-medium text-slate-600">
          Don't have an account?
          <NuxtLink to="/signup" class="text-primary-500 font-medium">
            Sign up
          </NuxtLink>
        </p>
      </div>

      <UForm
        :schema="schema"
        :state="state"
        class="mt-6 space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Email Address" name="emailAddress">
          <UInput v-model="state.emailAddress" type="email" />
        </UFormField>

        <UFormField label="Password" name="password">
          <template #hint>
            <NuxtLink
              to="/forgot-password"
              class="font-medium text-sky-500 hover:underline"
            >
              Forgot your password?
            </NuxtLink>
          </template>

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
          <template #trailing>
            <Icon name="i-heroicons-arrow-right-20-solid" size="20" />
          </template>
          Continue
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
