<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";
import { emailVerificationTtlLabel } from "#shared/utils/emailVerification";
import type { OrcidPending } from "#shared/utils/orcidSignIn";
import { parseApiError } from "~/utils/apiError";

// Where GET /api/auth/orcid sends someone whose ORCID iD has no account yet.
// ORCID has confirmed the iD; this asks for the email address every account
// needs, then signs them in or sends a verification link.

definePageMeta({
  layout: "auth",
});

useSeoMeta({
  title: "Finish signing up",
  description: "Finish creating your Posters.science account with ORCID.",
  robots: "noindex, nofollow",
});

const { loggedIn } = useUserSession();

if (loggedIn.value) {
  await navigateTo("/dashboard");
}

const toast = useToast();

// Read in the browser only: it depends on a cookie set moments ago and must
// never be served from a cached payload.
const { data: pending, status } = useFetch<OrcidPending>(
  "/api/auth/orcid/pending",
  { key: "orcid-pending", server: false },
);

const schema = z.object({
  givenName: z.string().trim().min(1, "Enter your first name"),
  familyName: z.string().trim().min(1, "Enter your last name"),
  emailAddress: z.email("Enter a valid email address"),
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
  givenName: "",
  familyName: "",
  emailAddress: "",
});

// The address waiting for its verification link, once the account exists.
const checkEmail = ref("");
const expired = ref(false);
const conflict = ref<"existing" | "linked" | null>(null);
const sendFailed = ref(false);
const loading = ref(false);
const resending = ref(false);
const resent = ref(false);

watch(
  pending,
  (value) => {
    if (value?.kind === "signup") {
      state.givenName = value.givenName;
      state.familyName = value.familyName;
      state.emailAddress = value.email;
    }

    if (value?.kind === "unverified") checkEmail.value = value.emailAddress;
  },
  { immediate: true },
);

const signup = computed(() =>
  pending.value?.kind === "signup" ? pending.value : null,
);

// Keeping the email ORCID already verified means no confirmation email.
const skipsVerification = computed(
  () =>
    !!signup.value?.orcidVerifiedEmail &&
    state.emailAddress.trim().toLowerCase() === signup.value.orcidVerifiedEmail,
);

const view = computed(() => {
  if (checkEmail.value) return "check-email";
  if (expired.value) return "expired";
  if (status.value === "idle" || status.value === "pending") return "loading";
  if (signup.value) return "form";

  return "expired";
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;
  conflict.value = null;

  try {
    const result = await $fetch("/api/auth/orcid/complete", {
      body: event.data,
      method: "POST",
    });

    window.umami?.track("signup_completed", { method: "orcid" });

    if (result.signedIn) {
      toast.add({
        title: "Welcome to Posters.science",
        description: "Your account is ready.",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      window.location.href = result.redirect;

      return;
    }

    window.umami?.track("orcid_verification_sent");
    checkEmail.value = result.emailAddress;
  } catch (error: unknown) {
    const { reason, statusMessage } = parseApiError(error);

    if (reason === "existing" || reason === "linked") {
      conflict.value = reason;

      return;
    }

    if (reason === "expired") {
      expired.value = true;

      return;
    }

    // The account exists but the email did not go out.
    if (reason === "unverified") {
      sendFailed.value = true;
      checkEmail.value = event.data.emailAddress;

      return;
    }

    if (reason === "signed_in") {
      await navigateTo("/profile#orcid");

      return;
    }

    console.error(error);

    toast.add({
      title: "Could not create your account",
      description: statusMessage ?? "Please try again in a few moments.",
      color: "error",
      icon: "material-symbols:error",
    });
  } finally {
    loading.value = false;
  }
}

async function resendVerification() {
  resending.value = true;

  try {
    await $fetch("/api/auth/orcid/resend-verification", { method: "POST" });

    resent.value = true;
    sendFailed.value = false;

    toast.add({
      title: "Verification email sent",
      description: "Check your inbox for a new verification link.",
      color: "success",
      icon: "material-symbols:mail-outline",
    });
  } catch (error: unknown) {
    const { reason, statusMessage } = parseApiError(error);

    if (reason === "expired") {
      checkEmail.value = "";
      expired.value = true;

      return;
    }

    console.error(error);

    toast.add({
      title: "Could not send a new link",
      description: statusMessage ?? "Please try again in a few moments.",
      color: "error",
      icon: "material-symbols:error",
    });
  } finally {
    resending.value = false;
  }
}
</script>

<template>
  <UCard class="w-full max-w-sm bg-white/75 backdrop-blur dark:bg-white/5">
    <div class="w-full max-w-sm px-4 py-5 sm:p-6">
      <div v-if="view === 'loading'" class="flex justify-center py-10">
        <UIcon
          name="i-lucide-loader-circle"
          class="text-muted size-8 animate-spin"
        />
      </div>

      <div v-else-if="view === 'check-email'" class="space-y-5 text-center">
        <UIcon
          name="material-symbols:mark-email-unread-outline"
          class="text-primary mx-auto size-10"
        />

        <div class="space-y-2">
          <h2 class="text-2xl font-bold">Check your email</h2>

          <p class="text-muted text-sm">
            We sent a link to
            <span class="text-default font-medium">{{ checkEmail }}</span
            >. Open it to confirm your address, then sign in with ORCID. The
            link is valid for {{ emailVerificationTtlLabel() }}.
          </p>
        </div>

        <UAlert
          v-if="sendFailed"
          color="warning"
          variant="subtle"
          icon="material-symbols:warning-outline"
          title="The email did not go out"
          description="Your account was created, but we could not send the link. Send a new one below."
          class="text-left"
        />

        <div class="flex flex-col gap-3">
          <UButton
            v-if="!resent"
            block
            color="neutral"
            variant="outline"
            :loading="resending"
            label="Send a new link"
            @click="resendVerification"
          />

          <UButton block to="/login" label="Go to sign in" />
        </div>
      </div>

      <div v-else-if="view === 'expired'" class="space-y-5 text-center">
        <UIcon name="i-lucide-timer-off" class="text-muted mx-auto size-10" />

        <div class="space-y-2">
          <h2 class="text-2xl font-bold">Please start again</h2>

          <p class="text-muted text-sm">
            Your ORCID sign-in has ended. It lasts 30 minutes and only works in
            the browser you started it in.
          </p>
        </div>

        <AuthOrcidButton block label="Sign up with ORCID" source="signup" />

        <p class="text-sm">
          Or
          <NuxtLink to="/signup" class="text-primary font-medium">
            sign up with an email address
          </NuxtLink>
        </p>
      </div>

      <template v-else-if="signup">
        <div class="space-y-2 text-center">
          <h2 class="text-2xl font-bold">Finish signing up</h2>

          <p class="text-muted text-sm">
            ORCID confirmed your iD. Add your email address to create your
            account.
          </p>
        </div>

        <div class="mt-5 flex justify-center">
          <ProfileOrcidBadge :orcid="signup.orcid" />
        </div>

        <UAlert
          v-if="conflict === 'existing'"
          class="mt-5"
          color="info"
          variant="subtle"
          icon="material-symbols:person-outline"
          title="This email already has an account"
          description="Sign in with your password, then link ORCID from Settings so you can use either next time."
        >
          <template #actions>
            <UButton
              :to="{ path: '/login', query: { redirect: '/profile#orcid' } }"
              color="info"
              variant="solid"
              size="xs"
              label="Sign in"
            />

            <UButton
              to="/forgot-password"
              color="info"
              variant="outline"
              size="xs"
              label="Forgot your password?"
            />
          </template>
        </UAlert>

        <UAlert
          v-if="conflict === 'linked'"
          class="mt-5"
          color="info"
          variant="subtle"
          icon="i-simple-icons-orcid"
          title="This ORCID iD already has an account"
          description="It was set up a moment ago. Sign in with ORCID to use it."
        >
          <template #actions>
            <AuthOrcidButton />
          </template>
        </UAlert>

        <UForm
          :schema="schema"
          :state="state"
          class="mt-6 space-y-4"
          @submit="onSubmit"
        >
          <UFormField label="First name" name="givenName" required>
            <UInput v-model="state.givenName" type="text" class="w-full" />
          </UFormField>

          <UFormField label="Last name" name="familyName" required>
            <UInput v-model="state.familyName" type="text" class="w-full" />
          </UFormField>

          <UFormField
            label="Email address"
            name="emailAddress"
            required
            :help="
              skipsVerification
                ? 'ORCID has already verified this address.'
                : 'We will send a link to confirm this address.'
            "
          >
            <UInput
              v-model="state.emailAddress"
              type="email"
              autocomplete="email"
              class="w-full"
            />
          </UFormField>

          <UButton type="submit" block :loading="loading">
            Create account
          </UButton>
        </UForm>
      </template>
    </div>

    <template v-if="view === 'form'" #footer>
      <p class="text-center text-sm">
        By creating an account, you agree to our
        <NuxtLink to="/terms" class="text-primary-500 text-sm font-medium">
          Terms of Service</NuxtLink
        >. Your ORCID iD is shown on your public profile if you make it public.
      </p>
    </template>
  </UCard>
</template>
