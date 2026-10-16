<script setup lang="ts">
// "Profile" in the account menu links here. It sends the signed-in user to
// their own profile page, public or private, creating its address the first
// time. Static routes win over /profile/[handle], so "me" never clashes with
// a real profile address.
definePageMeta({
  middleware: ["auth"],
});

const { data, error } = await useFetch<{ path: string }>(
  "/api/user/profile-path",
  { method: "POST" },
);

if (data.value?.path) {
  await navigateTo(data.value.path, { replace: true });
}
</script>

<template>
  <UContainer class="py-12">
    <UEmpty
      v-if="error"
      icon="i-heroicons-user-circle"
      title="We couldn't open your profile"
      description="Please try again, or manage your profile from settings."
      :actions="[
        {
          label: 'Go to settings',
          to: '/profile',
          color: 'neutral',
          variant: 'subtle',
        },
      ]"
    />
  </UContainer>
</template>
