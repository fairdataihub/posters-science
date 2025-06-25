<script setup lang="ts">
const { loggedIn } = useUserSession();

if (loggedIn.value) {
  await navigateTo("/dashboard");
}

definePageMeta({
  layout: "auth",
});

useSeoMeta({
  title: "Email Verification",
});

const route = useRoute();
const toast = useToast();
const token = route.query.token as string;
const verifying = ref(true);
const successMessage = ref("");
const errorMessage = ref("");

// Verify email when the page loads
onMounted(async () => {
  if (!token) {
    verifying.value = false;
    errorMessage.value = "No verification token found.";

    return;
  }

  try {
    const response = await $fetch("/api/auth/verify-email", {
      body: { token },
      method: "POST",
    });

    successMessage.value = "Email verified successfully! Redirecting...";
    toast.add({
      title: "Email Verified",
      color: "success",
      description: response.message,
      icon: "material-symbols:check-circle-outline",
    });

    setTimeout(() => {
      navigateTo("/login");
    }, 3000);
  } catch (error) {
    console.error(error);

    toast.add({
      title: "Verification Failed",
      color: "error",
      description: "Email verification failed. Please try again",
      icon: "material-symbols:error",
    });
  } finally {
    verifying.value = false;
  }
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="text-center">
      <h1 class="text-2xl font-bold">
        {{ verifying ? "Verifying Email..." : successMessage || errorMessage }}
      </h1>

      <p v-if="errorMessage" class="text-red-500">{{ errorMessage }}</p>

      <p v-if="successMessage" class="text-green-500">{{ successMessage }}</p>
    </div>
  </div>
</template>
