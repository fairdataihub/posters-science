<script setup lang="ts">
import dayjs from "dayjs";
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  OrganizationRole,
  OrganizationSentInvite,
  OrganizationTeam,
  OrganizationTeamMember,
} from "#shared/types/organization";
import {
  ORGANIZATION_INVITE_TTL_DAYS,
  organizationInviteSchema,
} from "#shared/utils/organization";
import { parseApiError } from "~/utils/apiError";

// Members and invites, in the organization's manage pane. Every member sees
// the list; owners also see addresses and can invite, change roles and remove.

const props = defineProps<{
  organizationId: string;
  organizationName: string;
}>();

const emit = defineEmits<{
  /** Membership or roles changed, so counts and the viewer's role may differ. */
  changed: [];
  /** The signed-in person left the organization. */
  left: [];
}>();

const toast = useToast();

const team = ref<OrganizationTeam | null>(null);
const loadError = ref("");

const base = computed(
  () => `/api/organizations/${encodeURIComponent(props.organizationId)}`,
);

async function load() {
  loadError.value = "";

  try {
    team.value = await $fetch<OrganizationTeam>(`${base.value}/members`);
  } catch (err: unknown) {
    loadError.value =
      parseApiError(err).statusMessage ?? "Could not load the members.";
  }
}

onMounted(load);
watch(() => props.organizationId, load);

const isOwner = computed(() => team.value?.role === "owner");

function showError(title: string, err: unknown) {
  toast.add({
    title,
    description:
      parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
    color: "error",
    icon: "i-heroicons-exclamation-circle",
  });
}

function formatDate(value: string) {
  return dayjs(value).format("MMM D, YYYY");
}

// Roles
const busyUserId = ref<string | null>(null);

function isLastOwner(member: OrganizationTeamMember) {
  return member.role === "owner" && (team.value?.ownerCount ?? 0) <= 1;
}

async function setRole(member: OrganizationTeamMember, role: OrganizationRole) {
  busyUserId.value = member.userId;

  try {
    await $fetch(`${base.value}/members/${encodeURIComponent(member.userId)}`, {
      method: "PATCH",
      body: { role },
    });
    toast.add({
      title:
        role === "owner"
          ? `${member.isMe ? "You are" : `${member.name} is`} now an owner`
          : `${member.isMe ? "You are" : `${member.name} is`} now a member`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    await load();
    emit("changed");
  } catch (err: unknown) {
    showError("Could not change the role", err);
  } finally {
    busyUserId.value = null;
  }
}

// Removing someone, or leaving
const removeTarget = ref<OrganizationTeamMember | null>(null);
const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (value) => {
    if (!value) removeTarget.value = null;
  },
});
const removing = ref(false);

async function confirmRemove() {
  const member = removeTarget.value;

  if (!member) return;

  removing.value = true;

  try {
    await $fetch(`${base.value}/members/${encodeURIComponent(member.userId)}`, {
      method: "DELETE",
    });
    removeTarget.value = null;

    if (member.isMe) {
      toast.add({
        title: `You left ${props.organizationName}`,
        description:
          "Posters you showed on its page stay there. You can take them off from your dashboard.",
        color: "success",
        icon: "i-heroicons-check-circle",
      });
      emit("left");

      return;
    }

    toast.add({
      title: `${member.name} was removed`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    await load();
    emit("changed");
  } catch (err: unknown) {
    showError(
      member.isMe ? "Could not leave the organization" : "Could not remove",
      err,
    );
  } finally {
    removing.value = false;
  }
}

function memberActions(member: OrganizationTeamMember): DropdownMenuItem[][] {
  const roleItem: DropdownMenuItem =
    member.role === "owner"
      ? {
          label: member.isMe ? "Step down to member" : "Make member",
          icon: "i-lucide-user",
          disabled: isLastOwner(member),
          onSelect: () => setRole(member, "member"),
        }
      : {
          label: "Make owner",
          icon: "i-lucide-shield-check",
          onSelect: () => setRole(member, "owner"),
        };

  return [
    [roleItem],
    [
      {
        label: member.isMe ? "Leave organization" : "Remove from organization",
        icon: member.isMe ? "i-lucide-log-out" : "i-lucide-user-x",
        color: "error",
        disabled: isLastOwner(member),
        onSelect: () => {
          removeTarget.value = member;
        },
      },
    ],
  ];
}

const me = computed(() => team.value?.members.find((member) => member.isMe));

// Invites
const inviteEmail = ref("");
const inviteError = ref<string | undefined>(undefined);
const inviting = ref(false);

async function invite() {
  const parsed = organizationInviteSchema.safeParse({
    emailAddress: inviteEmail.value,
  });

  if (!parsed.success) {
    inviteError.value = "Enter a valid email address";

    return;
  }

  inviteError.value = undefined;
  inviting.value = true;

  try {
    await $fetch<OrganizationSentInvite>(`${base.value}/invites`, {
      method: "POST",
      body: parsed.data,
    });
    toast.add({
      title: "Invite sent",
      description: `If ${parsed.data.emailAddress} has no account yet, the email asks them to sign up with that address.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    inviteEmail.value = "";
    await load();
  } catch (err: unknown) {
    showError("Could not send the invite", err);
  } finally {
    inviting.value = false;
  }
}

// Resend waits a few minutes after each email. The clock ticks so the button
// turns on without a reload.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 15_000);
});
onBeforeUnmount(() => clearInterval(clock));

function canResend(sent: OrganizationSentInvite) {
  return new Date(sent.resendAvailableAt).getTime() <= now.value;
}

const busyInviteId = ref<string | null>(null);

async function resend(sent: OrganizationSentInvite) {
  busyInviteId.value = sent.id;

  try {
    await $fetch(
      `${base.value}/invites/${encodeURIComponent(sent.id)}/resend`,
      { method: "POST" },
    );
    toast.add({
      title: "Invite sent again",
      description: `It now expires in ${ORGANIZATION_INVITE_TTL_DAYS} days.`,
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    await load();
  } catch (err: unknown) {
    showError("Could not send the invite again", err);
  } finally {
    busyInviteId.value = null;
  }
}

async function revoke(sent: OrganizationSentInvite) {
  busyInviteId.value = sent.id;

  try {
    await $fetch(`${base.value}/invites/${encodeURIComponent(sent.id)}`, {
      method: "DELETE",
    });
    toast.add({
      title: "Invite withdrawn",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    await load();
  } catch (err: unknown) {
    showError("Could not withdraw the invite", err);
  } finally {
    busyInviteId.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="loadError"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      :title="loadError"
      :actions="[{ label: 'Try again', onClick: () => load() }]"
    />

    <UiSpinner v-else-if="!team" :loading="true" subtle>
      <div class="h-24" />
    </UiSpinner>

    <template v-else>
      <div class="space-y-2">
        <p class="text-muted text-sm">
          Only members can see this list. The public page doesn't name anyone.
        </p>

        <ul class="divide-default divide-y">
          <li
            v-for="member in team.members"
            :key="member.userId"
            class="flex items-center justify-between gap-3 py-2"
          >
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                <ULink
                  v-if="member.profilePath"
                  :to="member.profilePath"
                  class="break-words hover:underline"
                >
                  {{ member.name }}
                </ULink>

                <span v-else class="break-words">{{ member.name }}</span>

                <span v-if="member.isMe" class="text-muted font-normal">
                  (you)
                </span>

                <UBadge
                  :color="member.role === 'owner' ? 'primary' : 'neutral'"
                  variant="subtle"
                  size="sm"
                >
                  {{ member.role === "owner" ? "Owner" : "Member" }}
                </UBadge>
              </p>

              <p class="text-muted text-xs break-all">
                <template v-if="member.emailAddress">
                  {{ member.emailAddress }} ·
                </template>
                Joined {{ formatDate(member.joined) }}
              </p>
            </div>

            <UDropdownMenu
              v-if="isOwner"
              :items="memberActions(member)"
              :content="{ align: 'end' }"
            >
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis-vertical"
                :aria-label="`Actions for ${member.name}`"
                :loading="busyUserId === member.userId"
              />
            </UDropdownMenu>
          </li>
        </ul>

        <p v-if="isOwner && team.ownerCount === 1" class="text-muted text-xs">
          You're the only owner. Make another member an owner before you step
          down or leave.
        </p>

        <div v-if="!isOwner && me" class="pt-1">
          <UButton
            size="sm"
            color="error"
            variant="subtle"
            icon="i-lucide-log-out"
            label="Leave organization"
            @click="removeTarget = me"
          />
        </div>
      </div>

      <div v-if="isOwner" class="space-y-3">
        <h4 class="font-medium">Invite people</h4>

        <p class="text-muted text-sm">
          They get an email with a link. Someone without an account is asked to
          sign up with the invited address. Invites expire after
          {{ ORGANIZATION_INVITE_TTL_DAYS }} days.
        </p>

        <!-- novalidate so our message shows instead of the browser's bubble. -->
        <form
          class="flex flex-col gap-2 sm:flex-row"
          novalidate
          @submit.prevent="invite"
        >
          <UFormField
            :error="inviteError"
            class="flex-1"
            label="Email address"
            :ui="{ label: 'sr-only' }"
          >
            <UInput
              v-model="inviteEmail"
              type="email"
              placeholder="name@example.org"
              autocomplete="off"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            icon="i-lucide-send"
            label="Send invite"
            :loading="inviting"
            :disabled="team.invites.length >= team.inviteLimit"
            class="self-start"
          />
        </form>

        <p
          v-if="team.invites.length >= team.inviteLimit"
          class="text-warning text-sm"
        >
          {{ team.inviteLimit }} invites are pending, which is the most at once.
          Withdraw some to invite more people.
        </p>

        <div v-if="team.invites.length > 0" class="space-y-2">
          <p class="text-sm font-medium">
            Pending ({{ team.invites.length }} of {{ team.inviteLimit }})
          </p>

          <ul class="divide-default divide-y">
            <li
              v-for="sent in team.invites"
              :key="sent.id"
              class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium break-all">
                  {{ sent.emailAddress }}
                </p>

                <p class="text-muted text-xs">
                  Sent {{ formatDate(sent.sentAt) }} by
                  {{ sent.invitedByName }}. Expires
                  {{ formatDate(sent.expiresAt) }}.
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <UTooltip
                  :text="
                    canResend(sent)
                      ? 'Email the invite again'
                      : 'Sent a moment ago. You can send it again in a few minutes.'
                  "
                >
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="subtle"
                    icon="i-lucide-refresh-cw"
                    label="Resend"
                    :disabled="!canResend(sent) || busyInviteId !== null"
                    :loading="busyInviteId === sent.id"
                    @click="resend(sent)"
                  />
                </UTooltip>

                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-x"
                  label="Withdraw"
                  :disabled="busyInviteId !== null"
                  @click="revoke(sent)"
                />
              </div>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <UModal
      v-model:open="removeOpen"
      :title="
        removeTarget?.isMe
          ? `Leave ${organizationName}?`
          : `Remove ${removeTarget?.name ?? 'this member'}?`
      "
      :description="
        removeTarget?.isMe
          ? 'You will need a new invite to join again. Posters you showed on its page stay there, and you can take them off from your dashboard.'
          : 'They lose access to the organization. Posters they showed on its page stay there until they or an owner take them off.'
      "
    >
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
            :label="removeTarget?.isMe ? 'Leave organization' : 'Remove member'"
            :loading="removing"
            @click="confirmRemove"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
