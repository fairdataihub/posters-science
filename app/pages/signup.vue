<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";
import { emailVerificationTtlLabel } from "#shared/utils/emailVerification";
import { parseApiError } from "~/utils/apiError";

const { loggedIn } = useUserSession();
const { siteEnv } = useRuntimeConfig().public;
const isDev = siteEnv === "development" || siteEnv === "dev";

if (loggedIn.value) {
  await navigateTo("/dashboard");
}

definePageMeta({
  layout: "auth",
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Signup - Posters.science")}&description=${encodeURIComponent("Create a Posters.science account to share and discover scientific posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Signup",
  description:
    "Create a Posters.science account to share and discover scientific posters.",
  ogTitle: "Signup - Posters.science",
  ogDescription:
    "Create a Posters.science account to share and discover scientific posters.",
  ogImage,
});

const toast = useToast();
const loading = ref(false);

// Set when signup is refused because the address already has an account that
// has never been verified.
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
  emailAddress: z.string().email(),
  familyName: z.string(),
  givenName: z.string(),
  password: z
    .string()
    .trim()
    .min(12, "Must be at least 12 characters")
    .max(128, "Must be at most 128 characters"),
});

type Schema = z.output<typeof schema>;

const state = reactive({
  emailAddress: isDev ? "rick@example.com" : "",
  familyName: isDev ? "Sanchez" : "",
  givenName: isDev ? "Rick" : "",
  password: isDev ? "123456789012" : "",
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const body = {
    emailAddress: event.data.emailAddress,
    familyName: event.data.familyName,
    givenName: event.data.givenName,
    password: event.data.password,
  };

  loading.value = true;
  // Clear any notice from a previous attempt so it cannot outlive the address
  // it referred to.
  unverifiedAccountEmail.value = "";

  await $fetch("/api/auth/signup", {
    body,
    method: "POST",
  })
    .then(() => {
      toast.add({
        title: "Account created successfully",
        color: "info",
        description: isDev
          ? "You can now log in to your account."
          : "Please check your email to verify your account before logging in.",
        icon: "material-symbols:mail-outline",
      });

      window.umami?.track("signup_completed");
      navigateTo("/login");
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
        title: "Registration failed",
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
        <h2 class="my-1 text-2xl font-bold">Create an account</h2>

        <p class="font-medium text-slate-600">
          Already have an account?
          <NuxtLink to="/login" class="text-primary-500 font-medium">
            Login
          </NuxtLink>
        </p>
      </div>

      <UAlert
        v-if="unverifiedAccountEmail"
        class="mt-5"
        color="warning"
        variant="subtle"
        icon="material-symbols:mark-email-unread-outline"
        title="This email already has an account"
        :description="
          resent
            ? `A new verification link is on its way to ${unverifiedAccountEmail}. It is valid for ${emailVerificationTtlLabel()}.`
            : `${unverifiedAccountEmail} is already registered but has not been verified yet. Verify it to log in, or send yourself a new link if the old one expired.`
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
        By signing up, you agree to our
        <NuxtLink to="/terms" class="text-primary-500 text-sm font-medium">
          Terms of Service</NuxtLink
        >.
      </p>
    </template>
  </UCard>
</template>
