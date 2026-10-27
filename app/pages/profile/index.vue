<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";
import { parseApiError } from "~/utils/apiError";
import {
  PROFILE_AFFILIATION_MAX,
  PROFILE_BIO_MAX,
} from "#shared/utils/profile";
import { isValidOrcidChecksum, orcidUrl } from "#shared/utils/orcid";
import { normalizeOrcid } from "#shared/utils/discoverSearch";

definePageMeta({
  middleware: ["auth"],
});

const { clear, user } = useUserSession();

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Settings - Posters.science")}&description=${encodeURIComponent("Manage your account profile and preferences on Posters.science")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Settings",
  description: "Manage your Scholar Data profile and preferences.",
  ogTitle: "Settings - Posters.science",
  ogDescription:
    "Manage your account profile and preferences on Posters.science.",
  ogImage,
});

const toast = useToast();
const loading = ref(false);
const deleteLoading = ref(false);
const passwordLoading = ref(false);

const { data: userData, refresh: refreshUser } = await useFetch("/api/user");

// Accounts created through ORCID start without a password, so they set one
// rather than change it and have no current password to confirm.
const hasPassword = computed(() => userData.value?.hasPassword ?? true);
const passwordActionLabel = computed(() =>
  hasPassword.value ? "Change password" : "Set password",
);

const passwordSchema = z
  .object({
    currentPassword: z.string().trim(),
    newPassword: z
      .string()
      .trim()
      .min(12, "Must be at least 12 characters")
      .max(128, "Must be at most 128 characters"),
    confirmPassword: z
      .string()
      .trim()
      .min(12, "Must be at least 12 characters")
      .max(128, "Must be at most 128 characters"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => !hasPassword.value || d.currentPassword.length >= 8, {
    message: "Must be at least 8 characters",
    path: ["currentPassword"],
  });

type PasswordSchema = z.output<typeof passwordSchema>;

const passwordState = reactive<PasswordSchema>({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

async function onChangePassword(event: FormSubmitEvent<PasswordSchema>) {
  passwordLoading.value = true;
  try {
    await $fetch("/api/user/password", {
      method: "PATCH",
      body: {
        currentPassword: hasPassword.value
          ? event.data.currentPassword
          : undefined,
        newPassword: event.data.newPassword,
      },
    });

    toast.add({
      title: hasPassword.value ? "Password changed" : "Password set",
      description:
        "Your password has been saved. Please log in with your new password.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });

    passwordState.currentPassword = "";
    passwordState.newPassword = "";
    passwordState.confirmPassword = "";

    // logout after password change to clear session and redirect to login page
    await logout();
  } catch (err: unknown) {
    const message =
      parseApiError(err).statusMessage ?? "Failed to save password";
    toast.add({
      title: hasPassword.value
        ? "Change password failed"
        : "Set password failed",
      description: message,
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    passwordLoading.value = false;
  }
}

const logout = async () => {
  clear();
  await navigateTo("/login");
};

async function onDeleteAccount() {
  toast.add({
    title: "Unavailable",
    description:
      "Account deletion is not available yet. Please contact us using the contact form if you wish to delete your account.",
    color: "info",
    icon: "i-heroicons-information-circle",
  });

  return;

  // deleteLoading.value = true;
  // try {
  //   await $fetch("/api/user", { method: "DELETE" });
  //   toast.add({
  //     title: "Account deleted",
  //     color: "success",
  //     icon: "i-heroicons-check-circle",
  //   });

  //   // logout after account deletion to clear session and redirect to login page
  //   await logout();
  // } catch (err: unknown) {
  //   const message =
  //     err && typeof err === "object" && "data" in err
  //       ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
  //       : "Failed to delete account";
  //   toast.add({
  //     title: "Delete failed",
  //     description: message,
  //     color: "error",
  //     icon: "i-heroicons-exclamation-circle",
  //   });
  // } finally {
  //   deleteLoading.value = false;
  // }
}

const schema = z.object({
  givenName: z.string().trim().min(1, "Enter your first name"),
  familyName: z.string().trim().min(1, "Enter your last name"),
  affiliation: z
    .string()
    .trim()
    .max(
      PROFILE_AFFILIATION_MAX,
      `Must be at most ${PROFILE_AFFILIATION_MAX} characters`,
    ),
  bio: z
    .string()
    .trim()
    .max(PROFILE_BIO_MAX, `Must be at most ${PROFILE_BIO_MAX} characters`),
  // Format and checksum only. The server also checks ORCID has a record of it.
  orcid: z
    .string()
    .trim()
    .refine(
      (value) => !value || isValidOrcidChecksum(value),
      "Enter a valid ORCID iD, such as 0000-0002-1825-0097 or its orcid.org link",
    ),
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
  givenName: "",
  familyName: "",
  affiliation: "",
  bio: "",
  orcid: "",
});

// Unset rather than "", which UFormField
// would read as `error: true` and outline the field without a message.
const orcidServerError = ref<string>();

watch(
  () => state.orcid,
  () => {
    orcidServerError.value = undefined;
  },
);

// Link to the record for the iD in the field, so the user can check it's theirs.
const orcidRecordUrl = computed(() =>
  isValidOrcidChecksum(state.orcid)
    ? orcidUrl(normalizeOrcid(state.orcid))
    : "",
);

watch(
  () => userData.value,
  (u) => {
    if (u) {
      state.givenName = u.givenName ?? "";
      state.familyName = u.familyName ?? "";
      state.affiliation = u.affiliation ?? "";
      state.bio = u.bio ?? "";
      state.orcid = u.orcid ?? "";
    }
  },
  { immediate: true },
);

// Public profile. Opt-in, and the address is created the first time it is
// turned on.
const publicSaving = ref(false);

async function setProfilePublic(profilePublic: boolean) {
  publicSaving.value = true;
  try {
    await $fetch("/api/user", {
      method: "PATCH",
      body: { profilePublic },
    });
    await refreshUser();
    toast.add({
      title: profilePublic
        ? "Your profile is public"
        : "Your profile is private",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Update failed",
      description:
        parseApiError(err).statusMessage ?? "Failed to update your profile",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    publicSaving.value = false;
  }
}

// Liked posters on the public profile. Opt-in and independent of whether the
// profile is public, so it can be set up before the profile goes live.
const showLikesSaving = ref(false);

async function setShowLikes(profileShowLikes: boolean) {
  showLikesSaving.value = true;
  try {
    await $fetch("/api/user", {
      method: "PATCH",
      body: { profileShowLikes },
    });
    await refreshUser();
    toast.add({
      title: profileShowLikes
        ? "Liked posters are shown on your profile"
        : "Liked posters are hidden from your profile",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Update failed",
      description:
        parseApiError(err).statusMessage ?? "Failed to update your profile",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    showLikesSaving.value = false;
  }
}

const requestUrl = useRequestURL();
const publicProfileUrl = computed(() => {
  const path = userData.value?.profilePath;

  return path ? `${requestUrl.origin}${path}` : "";
});

async function copyProfileLink() {
  try {
    await navigator.clipboard.writeText(publicProfileUrl.value);
    toast.add({
      title: "Profile link copied",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch {
    toast.add({
      title: "Could not copy the link",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  }
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const body = {
    givenName: event.data.givenName,
    familyName: event.data.familyName,
    affiliation: event.data.affiliation,
    bio: event.data.bio,
    orcid: event.data.orcid,
  };

  loading.value = true;
  try {
    await $fetch("/api/user", {
      method: "PATCH",
      body,
    });
    await refreshUser();
    toast.add({
      title: "Profile updated",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    const { statusMessage, reason } = parseApiError(err);
    const message = statusMessage ?? "Failed to update profile";

    // A bad or unknown ORCID iD belongs under its field.
    if (reason?.startsWith("orcid_")) {
      orcidServerError.value = message;
    }

    toast.add({
      title: "Update failed",
      description: message,
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer>
      <UPage>
        <UPageHeader
          :ui="{
            container: 'flex w-full flex-1',
          }"
        >
          <template #title>
            <div class="flex min-w-full items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <UAvatar
                  :src="`https://api.dicebear.com/9.x/thumbs/svg?seed=${userData?.id}`"
                  alt="User avatar"
                />

                <h1 class="text-2xl font-bold">
                  {{
                    userData?.givenName || userData?.familyName
                      ? `${userData?.givenName} ${userData?.familyName}`
                      : userData?.id
                  }}
                </h1>
              </div>

              <UButton
                v-if="user?.role === 'admin'"
                to="/admin"
                icon="material-symbols:admin-panel-settings"
                label="Admin Panel"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
          </template>
        </UPageHeader>

        <UPageBody>
          <div class="space-y-6">
            <!-- Public profile -->
            <UCard>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-semibold">Public profile</h2>

                <UBadge
                  :color="userData?.profilePublic ? 'success' : 'neutral'"
                  variant="subtle"
                  :icon="
                    userData?.profilePublic
                      ? 'i-heroicons-globe-alt'
                      : 'i-heroicons-lock-closed'
                  "
                >
                  {{ userData?.profilePublic ? "Public" : "Private" }}
                </UBadge>
              </div>

              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{
                  userData?.profilePublic
                    ? "Anyone with the link can see your name, affiliation, ORCID iD, bio and the posters you have published and claimed. Drafts stay private on your dashboard, and your email address is never shown."
                    : "Make your profile public to share a page listing the posters you have published and claimed, with your name, affiliation, ORCID iD and bio. Drafts stay private on your dashboard, and your email address is never shown."
                }}
              </p>

              <template v-if="userData?.profilePublic">
                <div
                  v-if="userData.profilePath"
                  class="mt-4 flex flex-wrap items-center gap-2"
                >
                  <code
                    class="rounded bg-gray-100 px-2 py-1 text-sm break-all dark:bg-gray-800"
                  >
                    {{ publicProfileUrl }}
                  </code>

                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-link"
                    @click="copyProfileLink"
                  >
                    Copy link
                  </UButton>

                  <UButton
                    :to="userData.profilePath"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-heroicons-arrow-top-right-on-square"
                  >
                    View public profile
                  </UButton>
                </div>

                <USeparator class="my-4" />

                <div
                  class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p class="text-sm font-medium">Make your profile private</p>

                    <p class="text-muted text-sm">
                      Only you will see it. Anyone else who opens your link gets
                      a not found page until you make it public again.
                    </p>
                  </div>

                  <UButton
                    size="sm"
                    color="warning"
                    variant="subtle"
                    icon="i-heroicons-lock-closed"
                    class="shrink-0 self-start sm:self-auto"
                    :loading="publicSaving"
                    @click="setProfilePublic(false)"
                  >
                    Make profile private
                  </UButton>
                </div>
              </template>

              <div v-else class="mt-4 flex flex-wrap items-center gap-2">
                <UButton
                  size="sm"
                  color="primary"
                  icon="i-heroicons-globe-alt"
                  :loading="publicSaving"
                  @click="setProfilePublic(true)"
                >
                  Make profile public
                </UButton>

                <UButton
                  to="/profile/me"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  icon="i-heroicons-eye"
                >
                  Preview your profile
                </UButton>
              </div>

              <USeparator class="my-4" />

              <USwitch
                :model-value="userData?.profileShowLikes ?? false"
                :loading="showLikesSaving"
                :disabled="showLikesSaving"
                label="Show my liked posters on my public profile"
                :description="
                  userData?.profilePublic
                    ? 'Adds a Liked tab to your profile that anyone with the link can see.'
                    : 'Adds a Liked tab to your profile once you make it public.'
                "
                @update:model-value="setShowLikes"
              />
            </UCard>

            <!-- Edit Profile Form -->
            <UCard>
              <h2 class="mb-6 text-xl font-semibold">Edit profile</h2>

              <UForm
                :schema="schema"
                :state="state"
                class="space-y-6"
                @submit="onSubmit"
              >
                <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <UFormField label="First name" name="givenName" required>
                    <UInput
                      v-model="state.givenName"
                      type="text"
                      placeholder="e.g. Jane"
                    />
                  </UFormField>

                  <UFormField label="Last name" name="familyName" required>
                    <UInput
                      v-model="state.familyName"
                      type="text"
                      placeholder="e.g. Smith"
                    />
                  </UFormField>

                  <UFormField
                    label="Affiliation"
                    name="affiliation"
                    class="md:col-span-2"
                    help="Shown on your public profile."
                  >
                    <UInput
                      v-model="state.affiliation"
                      type="text"
                      placeholder="e.g. University of California San Diego"
                      :maxlength="PROFILE_AFFILIATION_MAX"
                      class="w-full"
                    />
                  </UFormField>

                  <!-- Checked as the user types, not only after leaving the
                       field, so a bad iD gets its message while the focus
                       ring would otherwise look like an error border. -->
                  <UFormField
                    v-slot="{ error }"
                    label="ORCID iD"
                    name="orcid"
                    class="md:col-span-2"
                    help="Shown on your public profile with a link to your ORCID record."
                    :error="orcidServerError"
                    eager-validation
                    :validate-on-input-delay="500"
                  >
                    <UInput
                      v-model="state.orcid"
                      type="text"
                      placeholder="0000-0002-1825-0097"
                      autocomplete="off"
                      spellcheck="false"
                      class="w-full max-w-sm"
                      :ui="{ trailing: 'pe-1' }"
                    >
                      <template #leading>
                        <UIcon
                          name="i-simple-icons-orcid"
                          class="size-5 text-[#A6CE39]"
                        />
                      </template>

                      <template v-if="error" #trailing>
                        <UIcon
                          name="i-heroicons-exclamation-circle"
                          class="text-error me-1.5 size-5"
                        />
                      </template>

                      <template v-else-if="orcidRecordUrl" #trailing>
                        <UTooltip text="Open this iD on orcid.org">
                          <UButton
                            :to="orcidRecordUrl"
                            target="_blank"
                            color="neutral"
                            variant="link"
                            size="sm"
                            icon="i-heroicons-arrow-top-right-on-square"
                            aria-label="Open this iD on orcid.org"
                          />
                        </UTooltip>
                      </template>
                    </UInput>
                  </UFormField>

                  <UFormField
                    label="Bio"
                    name="bio"
                    class="md:col-span-2"
                    :help="`Shown on your public profile. ${state.bio.length}/${PROFILE_BIO_MAX} characters.`"
                  >
                    <UTextarea
                      v-model="state.bio"
                      placeholder="A sentence or two about your research"
                      :maxlength="PROFILE_BIO_MAX"
                      :rows="3"
                      autoresize
                      class="w-full"
                    />
                  </UFormField>
                </div>

                <div class="flex items-center justify-between gap-4">
                  <UButton type="submit" :loading="loading" color="primary">
                    Save changes
                  </UButton>

                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Last updated:
                    {{
                      userData?.updated
                        ? new Date(userData.updated).toLocaleString()
                        : "-"
                    }}
                  </p>
                </div>
              </UForm>
            </UCard>

            <!-- Account info (read-only) -->
            <UCard>
              <h2 class="mb-4 text-lg font-semibold">Account</h2>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Email Address
                  </label>

                  <p class="mt-1 text-gray-900 dark:text-white">
                    {{ userData?.emailAddress }}
                  </p>
                </div>

                <div>
                  <label
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Account created
                  </label>

                  <p class="mt-1 text-gray-900 dark:text-white">
                    {{
                      userData?.created
                        ? new Date(userData.created).toLocaleDateString()
                        : "-"
                    }}
                  </p>
                </div>
              </div>
            </UCard>

            <!-- Actions -->
            <UCard>
              <h2 class="mb-4 text-lg font-semibold">Account actions</h2>

              <div class="flex items-center justify-between gap-4">
                <UModal
                  :title="passwordActionLabel"
                  :description="
                    hasPassword
                      ? 'Update your account password'
                      : 'Add a password so you can also log in with your email address'
                  "
                >
                  <UButton
                    color="primary"
                    variant="solid"
                    :label="passwordActionLabel"
                    icon="i-heroicons-key"
                  />

                  <template #body>
                    <UForm
                      :schema="passwordSchema"
                      :state="passwordState"
                      class="space-y-4"
                      @submit="onChangePassword"
                    >
                      <UFormField
                        v-if="hasPassword"
                        label="Current password"
                        name="currentPassword"
                      >
                        <UInput
                          v-model="passwordState.currentPassword"
                          type="password"
                          placeholder="Enter current password"
                        />
                      </UFormField>

                      <UFormField label="New password" name="newPassword">
                        <UInput
                          v-model="passwordState.newPassword"
                          type="password"
                          placeholder="Enter new password"
                        />
                      </UFormField>

                      <UFormField
                        label="Confirm new password"
                        name="confirmPassword"
                      >
                        <UInput
                          v-model="passwordState.confirmPassword"
                          type="password"
                          placeholder="Confirm new password"
                        />
                      </UFormField>
                    </UForm>
                  </template>

                  <template #footer="{ close }">
                    <div class="flex w-full items-center justify-between gap-3">
                      <UButton
                        color="neutral"
                        variant="subtle"
                        label="Cancel"
                        @click="close"
                      />

                      <UButton
                        color="primary"
                        variant="solid"
                        :label="passwordActionLabel"
                        icon="i-heroicons-key"
                        :loading="passwordLoading"
                        @click="
                          (e: Event) =>
                            onChangePassword({
                              data: passwordState,
                            } as FormSubmitEvent<PasswordSchema>)
                        "
                      />
                    </div>
                  </template>
                </UModal>

                <UModal
                  title="Delete account"
                  description="Delete profile and all associated data"
                >
                  <UTooltip
                    text="This function is not yet available. Please contact us using the contact form if you wish to delete your account."
                  >
                    <UButton
                      color="error"
                      variant="soft"
                      label="Delete account"
                      disabled
                      icon="i-heroicons-trash"
                    />
                  </UTooltip>

                  <template #body>
                    <p class="font-medium text-red-500">
                      This action is permanent and cannot be undone. All your
                      data will be deleted. There is no recovery from this!
                    </p>
                  </template>

                  <template #footer="{ close }">
                    <div class="flex w-full items-center justify-between gap-3">
                      <UButton
                        color="neutral"
                        variant="subtle"
                        label="Cancel"
                        @click="close"
                      />

                      <UButton
                        color="error"
                        variant="solid"
                        label="Delete account"
                        icon="i-heroicons-trash"
                        :loading="deleteLoading"
                        disabled
                        @click="onDeleteAccount"
                      />
                    </div>
                  </template>
                </UModal>
              </div>
            </UCard>
          </div>
        </UPageBody>
      </UPage>
    </UContainer>
  </div>
</template>
