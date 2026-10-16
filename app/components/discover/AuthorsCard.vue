<script setup lang="ts">
import { parseApiError } from "~/utils/apiError";

type Author = {
  givenName: string;
  familyName: string;
  affiliation: string;
  orcid: string | null;
};

const props = defineProps<{
  posterId: number;
  authors: Author[];
  claimable: boolean;
  claimed: boolean;
}>();

const route = useRoute();
const toast = useToast();
const { loggedIn } = useUserSession();

const claimed = ref(props.claimed);

const showClaimButton = computed(() => props.claimable && !claimed.value);

// Claiming
const confirmOpen = ref(false);
const claiming = ref(false);

async function openClaim() {
  if (!loggedIn.value) {
    await navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`);

    return;
  }

  confirmOpen.value = true;
}

// Public profile prompt, shown after a claim while the profile is private
const publicPromptOpen = ref(false);
const makingPublic = ref(false);

async function submitClaim() {
  if (claiming.value) return;

  claiming.value = true;

  try {
    const result = await $fetch<{ profilePublic: boolean }>(
      `/api/poster/${props.posterId}/claim`,
      { method: "POST" },
    );

    claimed.value = true;
    confirmOpen.value = false;

    window.umami?.track("poster_claimed", { posterId: props.posterId });

    toast.add({
      title: "Poster claimed",
      description: "It now appears in the Published tab of your dashboard.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });

    if (!result.profilePublic) {
      publicPromptOpen.value = true;
    }
  } catch (err: unknown) {
    toast.add({
      title: "Could not claim this poster",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    claiming.value = false;
  }
}

async function makeProfilePublic() {
  makingPublic.value = true;

  try {
    const user = await $fetch<{ profilePath: string | null }>("/api/user", {
      method: "PATCH",
      body: { profilePublic: true },
    });

    publicPromptOpen.value = false;

    toast.add({
      title: "Your profile is public",
      description: "You can change this at any time from your profile page.",
      color: "success",
      icon: "i-heroicons-check-circle",
      actions: user.profilePath
        ? [
            {
              label: "View profile",
              color: "neutral",
              variant: "outline",
              onClick: () => {
                navigateTo(user.profilePath!);
              },
            },
          ]
        : undefined,
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not update your profile",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    makingPublic.value = false;
  }
}

// Removing your own claim
const removeOpen = ref(false);
const removing = ref(false);

async function removeClaim() {
  if (removing.value) return;

  removing.value = true;

  try {
    await $fetch(`/api/poster/${props.posterId}/claim`, { method: "DELETE" });

    claimed.value = false;
    removeOpen.value = false;

    toast.add({
      title: "Claim removed",
      description: "This poster no longer appears on your dashboard.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not remove your claim",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-lg font-semibold">Authors</h3>

        <UTooltip
          v-if="showClaimButton"
          text="Are you one of the authors? Claim this poster to add it to your dashboard and profile."
          :ui="{
            content: 'h-auto max-w-64 py-1.5',
            text: 'overflow-visible whitespace-normal',
          }"
        >
          <UButton
            size="sm"
            color="primary"
            icon="i-heroicons-hand-raised"
            @click="openClaim"
          >
            Claim this poster
          </UButton>
        </UTooltip>

        <div v-else-if="claimed" class="flex items-center gap-1">
          <UBadge
            color="success"
            variant="subtle"
            icon="i-heroicons-check-badge"
          >
            Claimed by you
          </UBadge>

          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            aria-label="Remove my claim"
            @click="removeOpen = true"
          >
            Remove
          </UButton>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div
        v-for="(author, index) in authors"
        :key="index"
        class="border-l-4 border-blue-500 pl-3"
      >
        <p class="font-medium">
          {{ author.givenName }} {{ author.familyName }}
        </p>

        <p
          v-if="author.affiliation"
          class="text-sm text-gray-600 dark:text-gray-400"
        >
          {{ author.affiliation }}
        </p>

        <p v-if="author.orcid" class="text-xs text-gray-500 dark:text-gray-400">
          ORCID: {{ author.orcid }}
        </p>
      </div>
    </div>

    <UModal
      v-model:open="confirmOpen"
      title="Claim this poster?"
      description="You'll be added as one of its authors."
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            The poster will appear in the Published tab of your dashboard and on
            your profile. Claiming doesn't change the poster itself, and you can
            remove your claim at any time.
            <ULink
              to="/faq#claiming-auto-indexed-posters"
              target="_blank"
              class="underline"
              >How claiming works</ULink
            >
          </p>

          <p class="text-gray-500 dark:text-gray-400">
            By claiming, you confirm you're one of the authors and agree to the
            <ULink to="/terms" target="_blank" class="underline"
              >Terms of Use</ULink
            >.
          </p>
        </div>
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
            label="Claim poster"
            icon="i-heroicons-hand-raised"
            :loading="claiming"
            @click="submitClaim"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="removeOpen"
      title="Remove your claim?"
      description="The poster will no longer appear on your dashboard or profile. You can claim it again later."
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
            label="Remove claim"
            icon="i-heroicons-x-mark"
            :loading="removing"
            @click="removeClaim"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="publicPromptOpen"
      title="Make your profile public?"
      description="A public profile lists the posters you have published and claimed, so others can find and link to your work."
    >
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Your email address is never shown. You can turn your public profile
          off again at any time from your profile page.
        </p>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-3">
          <UButton
            color="neutral"
            variant="subtle"
            label="Not now"
            @click="close"
          />

          <UButton
            color="primary"
            label="Make profile public"
            icon="i-heroicons-globe-alt"
            :loading="makingPublic"
            @click="makeProfilePublic"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>
