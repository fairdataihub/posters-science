<script setup lang="ts">
import type { MyOrganizationInvite } from "#shared/types/organization";
import { parseApiError } from "~/utils/apiError";

// Pending invites on the organizations page, with accept and decline.

const emit = defineEmits<{
  accepted: [organizationId: string];
}>();

const toast = useToast();
const { invites, refresh } = useOrganizationInvites();
const busy = ref<{ id: string; accept: boolean } | null>(null);

function expiresLabel(invite: MyOrganizationInvite) {
  return new Date(invite.expiresAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function answer(invite: MyOrganizationInvite, accept: boolean) {
  busy.value = { id: invite.id, accept };

  try {
    const result = await $fetch<{ organizationId?: string }>(
      `/api/organizations/invites/${encodeURIComponent(invite.id)}/${accept ? "accept" : "decline"}`,
      { method: "POST" },
    );

    toast.add({
      title: accept
        ? `You joined ${invite.organizationName}`
        : "Invitation declined",
      description: accept
        ? "You can now show your published and claimed posters on its page."
        : undefined,
      color: "success",
      icon: "i-heroicons-check-circle",
    });

    if (accept && result.organizationId)
      emit("accepted", result.organizationId);
  } catch (err: unknown) {
    toast.add({
      title: accept
        ? "Could not accept the invitation"
        : "Could not decline the invitation",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    busy.value = null;
    await refresh();
  }
}
</script>

<template>
  <section v-if="invites.length > 0" class="mb-6 space-y-3">
    <h2 class="text-lg font-semibold">Invitations</h2>

    <ul class="space-y-3">
      <li v-for="invite in invites" :key="invite.id">
        <UCard>
          <div
            class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex min-w-0 items-center gap-3">
              <UAvatar
                :src="invite.organizationAvatarUrl"
                :alt="invite.organizationName"
                size="lg"
                class="shrink-0"
              />

              <div class="min-w-0">
                <p class="font-semibold break-words">
                  {{ invite.organizationName }}
                </p>

                <p class="text-muted text-sm">
                  {{ invite.invitedByName }} invited you. Expires
                  {{ expiresLabel(invite) }}.
                </p>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="subtle"
                label="Decline"
                :disabled="busy !== null"
                :loading="busy?.id === invite.id && !busy.accept"
                @click="answer(invite, false)"
              />

              <UButton
                size="sm"
                icon="i-heroicons-check"
                label="Accept"
                :disabled="busy !== null"
                :loading="busy?.id === invite.id && busy.accept"
                @click="answer(invite, true)"
              />
            </div>
          </div>
        </UCard>
      </li>
    </ul>
  </section>
</template>
