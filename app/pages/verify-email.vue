<script setup lang="ts">
import { emailVerificationTtlLabel } from "#shared/utils/emailVerification";
import { parseApiError } from "~/utils/apiError";

const { loggedIn } = useUserSession();

if (loggedIn.value) {
  await navigateTo("/dashboard");
}

definePageMeta({
  layout: "auth",
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Email Verification - Posters.science")}&description=${encodeURIComponent("Verify your email address to activate your Posters.science account")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Email Verification",
  description:
    "Verify your email address to activate your Posters.science account.",
  ogTitle: "Email Verification - Posters.science",
  ogDescription:
    "Verify your email address to activate your Posters.science account.",
  ogImage,
});

const route = useRoute();
const toast = useToast();
const token = route.query.token as string;

type VerifyState = "verifying" | "success" | "expired" | "invalid";

const state = ref<VerifyState>("verifying");
const message = ref("");
const resendEmail = ref("");
const resending = ref(false);
const resent = ref(false);

const headings: Record<VerifyState, string> = {
  verifying: "Verifying your email...",
  success: "Email verified",
  expired: "This link has expired",
  invalid: "We could not verify this link",
};

// Verify email when the page loads
onMounted(async () => {
  if (!token) {
    state.value = "invalid";
    message.value = "This link is missing its verification token.";

    return;
  }

  try {
    const response = await $fetch("/api/auth/verify-email", {
      body: { token },
      method: "POST",
    });

    state.value = "success";
    message.value = response.message;

    toast.add({
      title: "Email Verified",
      color: "success",
      description: response.message,
      icon: "material-symbols:check-circle-outline",
    });

    setTimeout(() => {
      navigateTo("/login");
    }, 3000);
  } catch (error: unknown) {
    console.error(error);

    const { statusCode, statusMessage } = parseApiError(error);

    state.value = statusCode === 410 ? "expired" : "invalid";
    message.value =
      statusMessage ??
      "We could not verify this link. Request a new one to continue.";
  }
});

const requestNewLink = async () => {
  resending.value = true;

  try {
    await $fetch("/api/auth/resend-verification", {
      body:
        state.value === "expired" ? { token } : { email: resendEmail.value },
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
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <div class="w-full max-w-md text-center">
      <h1 class="text-2xl font-bold">{{ headings[state] }}</h1>

      <p
        v-if="message"
        class="mt-3"
        :class="
          state === 'success'
            ? 'text-green-600'
            : 'text-gray-600 dark:text-gray-300'
        "
      >
        {{ message }}
      </p>

      <template v-if="state === 'expired' || state === 'invalid'">
        <div v-if="resent" class="mt-6">
          <p class="text-green-600">
            A new verification link is on its way. It is valid for
            {{ emailVerificationTtlLabel() }}.
          </p>
        </div>

        <div v-else class="mt-6 space-y-3">
          <UInput
            v-if="state === 'invalid'"
            v-model="resendEmail"
            type="email"
            placeholder="you@university.edu"
            autocomplete="email"
            class="w-full"
          />

          <UButton
            :loading="resending"
            :disabled="state === 'invalid' && !resendEmail"
            block
            icon="material-symbols:mail-outline"
            label="Send me a new link"
            @click="requestNewLink"
          />
        </div>
      </template>

      <UButton
        v-if="state === 'invalid' || state === 'expired'"
        to="/login"
        variant="link"
        color="neutral"
        label="Back to login"
        class="mt-2"
      />
    </div>
  </div>
</template>
