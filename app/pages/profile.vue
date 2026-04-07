<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "#ui/types";

definePageMeta({
  middleware: ["auth"],
});

const { clear } = useUserSession();

useSeoMeta({
  title: "Profile",
  description: "Manage your Scholar Data profile and preferences.",
});

const toast = useToast();
const loading = ref(false);
const deleteLoading = ref(false);
const passwordLoading = ref(false);

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8, "Must be at least 8 characters"),
    newPassword: z.string().min(8, "Must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Must be at least 8 characters"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
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
        currentPassword: event.data.currentPassword,
        newPassword: event.data.newPassword,
      },
    });

    toast.add({
      title: "Password changed",
      description:
        "Your password has been updated successfully. Please log in with your new password.",
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
      err && typeof err === "object" && "data" in err
        ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
        : "Failed to change password";
    toast.add({
      title: "Change password failed",
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
      "Account deletion is not available yet. Please contact support if you wish to delete your account.",
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

const { data: userData, refresh: refreshUser } = await useFetch("/api/user");

const schema = z.object({
  givenName: z.string(),
  familyName: z.string(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
  givenName: "",
  familyName: "",
});

watch(
  () => userData.value,
  (u) => {
    if (u) {
      state.givenName = u.givenName ?? "";
      state.familyName = u.familyName ?? "";
    }
  },
  { immediate: true },
);

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const body = {
    givenName: event.data.givenName,
    familyName: event.data.familyName,
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
    const message =
      err && typeof err === "object" && "data" in err
        ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
        : "Failed to update profile";
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
          </template>
        </UPageHeader>

        <UPageBody>
          <div class="space-y-6">
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
                  <UFormField label="First name" name="givenName">
                    <UInput
                      v-model="state.givenName"
                      type="text"
                      placeholder="e.g. Jane"
                    />
                  </UFormField>

                  <UFormField label="Last name" name="familyName">
                    <UInput
                      v-model="state.familyName"
                      type="text"
                      placeholder="e.g. Smith"
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
                        : "—"
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
                        : "—"
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
                  title="Change password"
                  description="Update your account password"
                >
                  <UButton
                    color="primary"
                    variant="solid"
                    label="Change password"
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
                        label="Change password"
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
                    text="This function is not yet available. Please contact support if you wish to delete your account."
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
