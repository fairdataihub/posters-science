<script setup lang="ts">
// Dashboard notice for pending organization invites. Answering happens on the
// organizations page.

const { invites } = useOrganizationInvites();

const title = computed(() => {
  const [first] = invites.value;

  if (!first) return "";

  return invites.value.length === 1
    ? `${first.invitedByName} invited you to join ${first.organizationName}`
    : `You have ${invites.value.length} invitations to join organizations`;
});
</script>

<template>
  <UAlert
    v-if="invites.length > 0"
    color="info"
    variant="subtle"
    icon="i-lucide-building-2"
    :title="title"
    description="Members can show the posters they published or claimed on the organization's page."
    :actions="[
      {
        label: invites.length === 1 ? 'View invitation' : 'View invitations',
        to: '/organizations',
        color: 'info',
        variant: 'solid',
      },
    ]"
  />
</template>
