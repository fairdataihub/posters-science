<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";
import { emailVerificationTtlLabel } from "#shared/utils/emailVerification";
import { parseApiError } from "~/utils/apiError";

const { loggedIn } = useUserSession();
const { siteEnv } = useRuntimeConfig().public;
const route = useRoute();

const routeQueryParams = route.query;

if (loggedIn.value) {
  await navigateTo("/dashboard");
}

definePageMeta({
  layout: "auth",
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Login - Posters.science")}&description=${encodeURIComponent("Sign in to manage and share your scientific posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Login",
  description: "Sign in to manage and share your scientific posters.",
  ogTitle: "Login - Posters.science",
  ogDescription: "Sign in to manage and share your scientific posters.",
  ogImage,
});

const toast = useToast();
const loading = ref(false);

// Set when login is refused because the account has never been verified. The
// password has already been accepted by then, so the page can offer the
// account holder a fresh verification link instead of a dead end.
const unverifiedAccountEmail = ref("");
const resending = ref(false);
const resent = ref(false);

const resendVerification = async () => {
  resending.value = true;

  try {
    await $fetch("/api/auth/resend-verification", {
      body: { email: unverifiedAccountEmail.value },
      method: "POST",
    });

    resent.value = true;

    toast.add({
      title: "Verification email sent",
      color: "success",
      description: "Check your inbox for a new verification link.",
      icon: "material-symbols:mail-outline",
    });
  } catch (error: unknown) {
    console.error(error);

    toast.add({
      title: "Could not send a new link",
      color: "error",
      description:
        parseApiError(error).statusMessage ??
        "Please try again in a few moments.",
      icon: "material-symbols:error",
    });
  } finally {
    resending.value = false;
  }
};

const showPassword = ref(false);

const schema = z.object({
  emailAddress: z.email(),
  password: z.string().trim().min(8, "Must be at least 8 characters"),
});

type Schema = z.output<typeof schema>;

const state = reactive({
  emailAddress: siteEnv === "development" ? "rick@example.com" : "",
  password: siteEnv === "development" ? "12345678" : "",
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const body = {
    emailAddress: event.data.emailAddress,
    password: event.data.password,
  };

  loading.value = true;
  // Clear any notice from a previous attempt so it cannot outlive the address
  // it referred to.
  unverifiedAccountEmail.value = "";

  await $fetch("/api/auth/login", {
    body,
    method: "POST",
  })
    .then(() => {
      toast.add({
        title: "Login successful",
        description: "You can now access your account",
        icon: "material-symbols:check-circle-outline",
        color: "success",
      });

      window.umami?.track("login_completed");
      if (routeQueryParams.redirect) {
        console.log("redirecting to", routeQueryParams.redirect);

        window.location.href = routeQueryParams.redirect as string;
      } else {
        window.location.href = "/dashboard";
      }
    })
    .catch((error) => {
      console.error(error);

      const { reason, statusMessage } = parseApiError(error);

      if (reason === "unverified") {
        unverifiedAccountEmail.value = body.emailAddress;
        resent.value = false;

        return;
      }

      toast.add({
        title: "Error logging in",
        color: "error",
        description: statusMessage ?? "Please try again in a few moments.",
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

      <UAlert
        v-if="unverifiedAccountEmail"
        class="mt-5"
        color="warning"
        variant="subtle"
        icon="material-symbols:mark-email-unread-outline"
        title="Verify your email to log in"
        :description="
          resent
            ? `A new verification link is on its way to ${unverifiedAccountEmail}. It is valid for ${emailVerificationTtlLabel()}.`
            : `${unverifiedAccountEmail} has not been verified yet. Check your inbox for the verification link, or request a new one if it has expired or never arrived.`
        "
      >
        <template v-if="!resent" #actions>
          <UButton
            :loading="resending"
            color="warning"
            variant="solid"
            size="xs"
            label="Send a new verification email"
            @click="resendVerification"
          />
        </template>
      </UAlert>

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
        <NuxtLink to="/terms" class="text-primary-500 text-sm font-medium">
          Terms of Service</NuxtLink
        >.
      </p>
    </template>
  </UCard>
</template>
