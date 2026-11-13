<script setup lang="ts">
import type { OrcidIntent } from "#shared/utils/orcidSignIn";

// Starts Sign in with ORCID (or linking, from Settings). Renders nothing when
// the site has no ORCID settings, and is disabled while an admin has paused it.
const props = withDefaults(
  defineProps<{
    label?: string;
    intent?: OrcidIntent;
    // Where to land afterwards. Only paths on this site are followed.
    redirect?: string;
    // Prefills the finish sign-up form when the visit came from an invite.
    email?: string;
    // For analytics: "signup" when shown on the signup page.
    source?: "signin" | "signup" | "link";
    block?: boolean;
  }>(),
  {
    label: "Sign in with ORCID",
    intent: "signin",
    redirect: undefined,
    email: undefined,
    source: undefined,
    block: false,
  },
);

const { available, paused, pausedMessage, startUrl } = useOrcidSignIn();

const href = computed(() =>
  startUrl(props.intent, { redirect: props.redirect, email: props.email }),
);

function track() {
  window.umami?.track("orcid_signin_started", {
    intent: props.source ?? props.intent,
  });
}
</script>

<template>
  <UTooltip v-if="available" :text="pausedMessage" :disabled="!paused">
    <UButton
      :to="paused ? undefined : href"
      external
      :disabled="paused"
      color="neutral"
      variant="outline"
      :block="block"
      :label="label"
      @click="track"
    >
      <template #leading>
        <UIcon
          name="i-simple-icons-orcid"
          class="size-5 shrink-0 text-[#A6CE39]"
        />
      </template>
    </UButton>
  </UTooltip>
</template>
