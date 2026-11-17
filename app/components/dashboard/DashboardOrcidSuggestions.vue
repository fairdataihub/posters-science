<script setup lang="ts">
import type {
  OrcidSuggestion,
  OrcidSuggestions,
} from "#shared/types/orcidSuggestions";
import { orcidUrl } from "#shared/utils/orcid";
import { parseApiError } from "~/utils/apiError";

// Auto-indexed posters that list the user's ORCID iD, above the published
// posters on the dashboard. Each one can be claimed or marked "Not me", and
// the whole panel can be hidden and brought back from the settings page.

const props = defineProps<{
  data: OrcidSuggestions;
}>();

const emit = defineEmits<{
  /** Suggestions changed and should be fetched again. */
  changed: [];
  /** Posters were claimed, so the published list changed too. */
  claimed: [];
}>();

const PREVIEW_COUNT = 3;

const toast = useToast();

const expanded = ref(false);
const busyIds = ref(new Set<number>());
const claimAllOpen = ref(false);
const claimingAll = ref(false);
const hiding = ref(false);

const suggestions = computed(() => props.data.suggestions);
const shown = computed(() =>
  expanded.value
    ? suggestions.value
    : suggestions.value.slice(0, PREVIEW_COUNT),
);
const visible = computed(
  () =>
    !!props.data.orcid && !props.data.hidden && suggestions.value.length > 0,
);
const countText = computed(() =>
  props.data.total === 1
    ? "1 auto-indexed poster lists"
    : `${props.data.total.toLocaleString()} auto-indexed posters list`,
);
const sourceText = computed(() =>
  props.data.source === "linked"
    ? "the ORCID iD linked to your account"
    : "the ORCID iD on your settings page",
);

function fallbackImage(suggestion: OrcidSuggestion) {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${suggestion.posterId}`;
}

function details(suggestion: OrcidSuggestion) {
  const year = suggestion.publicationYear
    ? String(suggestion.publicationYear)
    : null;

  return [
    suggestion.listedAs ? `Listed as ${suggestion.listedAs}` : null,
    suggestion.conference,
    // The conference label usually carries the year already.
    year && !suggestion.conference?.includes(year) ? year : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function setBusy(posterId: number, busy: boolean) {
  const next = new Set(busyIds.value);

  if (busy) {
    next.add(posterId);
  } else {
    next.delete(posterId);
  }

  busyIds.value = next;
}

function showError(title: string, error: unknown) {
  toast.add({
    title,
    description:
      parseApiError(error).statusMessage ?? "Please try again in a moment.",
    color: "error",
    icon: "material-symbols:error",
  });
}

function claimPosters(posterIds: number[]) {
  return $fetch<{ claimed: number; profilePublic: boolean }>(
    "/api/user/orcid-suggestions/claim",
    { method: "POST", body: { posterIds } },
  );
}

function claimedDescription(profilePublic: boolean, count: number) {
  const where = profilePublic
    ? "your Published tab and on your public profile"
    : "your Published tab";

  return count === 1 ? `It's now in ${where}.` : `They're now in ${where}.`;
}

async function claimOne(suggestion: OrcidSuggestion) {
  setBusy(suggestion.posterId, true);

  try {
    const { profilePublic } = await claimPosters([suggestion.posterId]);

    window.umami?.track("poster_claimed", {
      posterId: suggestion.posterId,
      source: "orcid_suggestion",
    });

    toast.add({
      title: "Poster claimed",
      description: claimedDescription(profilePublic, 1),
      color: "success",
      icon: "material-symbols:check-circle-outline",
    });

    emit("claimed");
  } catch (error: unknown) {
    showError("Could not claim the poster", error);
  } finally {
    setBusy(suggestion.posterId, false);
  }
}

async function claimAll() {
  claimingAll.value = true;

  try {
    const { claimed, profilePublic } = await claimPosters(
      suggestions.value.map((suggestion) => suggestion.posterId),
    );

    window.umami?.track("orcid_suggestions_claimed", { count: claimed });

    claimAllOpen.value = false;

    toast.add({
      title: claimed === 1 ? "Poster claimed" : `${claimed} posters claimed`,
      description: claimedDescription(profilePublic, claimed),
      color: "success",
      icon: "material-symbols:check-circle-outline",
    });

    emit("claimed");
  } catch (error: unknown) {
    showError("Could not claim the posters", error);
  } finally {
    claimingAll.value = false;
  }
}

async function restore(posterId: number) {
  try {
    await $fetch(`/api/user/orcid-suggestions/dismissals/${posterId}`, {
      method: "DELETE",
    });

    window.umami?.track("orcid_suggestion_restored");
    emit("changed");
  } catch (error: unknown) {
    showError("Could not bring the poster back", error);
  }
}

async function dismiss(suggestion: OrcidSuggestion) {
  setBusy(suggestion.posterId, true);

  try {
    await $fetch("/api/user/orcid-suggestions/dismissals", {
      method: "POST",
      body: { posterId: suggestion.posterId },
    });

    window.umami?.track("orcid_suggestion_dismissed");
    emit("changed");

    toast.add({
      title: "Suggestion removed",
      description: "We won't suggest this poster to you again.",
      color: "neutral",
      icon: "i-lucide-eye-off",
      actions: [
        {
          label: "Undo",
          color: "neutral",
          variant: "outline",
          onClick: () => restore(suggestion.posterId),
        },
      ],
    });
  } catch (error: unknown) {
    showError("Could not remove the suggestion", error);
  } finally {
    setBusy(suggestion.posterId, false);
  }
}

async function setHidden(hidden: boolean) {
  await $fetch("/api/user/orcid-suggestions", {
    method: "PATCH",
    body: { hidden },
  });

  emit("changed");
}

async function hide() {
  hiding.value = true;

  try {
    await setHidden(true);

    window.umami?.track("orcid_suggestions_hidden");

    toast.add({
      title: "Suggestions hidden",
      description: "You can show them again from your settings page.",
      color: "neutral",
      icon: "i-lucide-eye-off",
      actions: [
        {
          label: "Undo",
          color: "neutral",
          variant: "outline",
          onClick: () => {
            setHidden(false).catch((error: unknown) =>
              showError("Could not show the suggestions", error),
            );
          },
        },
      ],
    });
  } catch (error: unknown) {
    showError("Could not hide the suggestions", error);
  } finally {
    hiding.value = false;
  }
}
</script>

<template>
  <section
    v-if="visible && data.orcid"
    aria-labelledby="orcid-suggestions-title"
    class="border-default rounded-lg border bg-white p-4 sm:p-5 dark:bg-gray-950"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h2
          id="orcid-suggestions-title"
          class="flex items-center gap-2 font-semibold"
        >
          <Icon name="i-simple-icons-orcid" class="h-5 w-5 text-[#A6CE39]" />
          Posters that may be yours
        </h2>

        <p class="text-muted mt-1 text-sm">
          {{ countText }} your ORCID iD
          <ULink
            :to="orcidUrl(data.orcid)"
            target="_blank"
            class="text-primary underline"
            >{{ data.orcid }}</ULink
          >
          for one of their authors. Claim the ones you authored to add them here
          and to your profile.
        </p>
      </div>

      <div class="flex items-center gap-1">
        <UPopover>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-info"
            label="How we match"
          />

          <template #content>
            <div class="max-w-sm space-y-2 p-4 text-sm">
              <p>
                Each auto-indexed poster comes with the author list from its
                repository record, such as Zenodo, and some authors have an
                ORCID iD there.
              </p>

              <p>
                We list the posters whose author list includes
                {{ sourceText }}. Posters you shared yourself, posters you
                already claimed, retired posters and ones you marked Not me are
                left out.
              </p>

              <p>
                A record can be wrong, so only claim posters you authored.
                <ULink
                  to="/faq#claiming-auto-indexed-posters"
                  target="_blank"
                  class="text-primary underline"
                  >How claiming works</ULink
                >
              </p>
            </div>
          </template>
        </UPopover>

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-eye-off"
          label="Hide"
          :loading="hiding"
          @click="hide"
        />
      </div>
    </div>

    <ul class="divide-default mt-3 divide-y">
      <li
        v-for="suggestion in shown"
        :key="suggestion.posterId"
        class="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap"
      >
        <img
          :src="suggestion.imageUrl || fallbackImage(suggestion)"
          alt=""
          loading="lazy"
          class="border-default h-14 w-11 flex-shrink-0 rounded border object-cover"
        />

        <div class="min-w-0 flex-1">
          <NuxtLink
            :to="`/discover/${suggestion.versionId}`"
            target="_blank"
            class="line-clamp-2 text-sm font-medium hover:underline"
          >
            {{ suggestion.title || "Untitled poster" }}
          </NuxtLink>

          <p v-if="details(suggestion)" class="text-muted mt-0.5 text-xs">
            {{ details(suggestion) }}
          </p>
        </div>

        <div class="flex w-full justify-end gap-2 sm:w-auto">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            label="Not me"
            :disabled="busyIds.has(suggestion.posterId) || claimingAll"
            @click="dismiss(suggestion)"
          />

          <UButton
            color="primary"
            variant="subtle"
            size="sm"
            icon="i-heroicons-hand-raised"
            label="Claim"
            :loading="busyIds.has(suggestion.posterId)"
            :disabled="claimingAll"
            @click="claimOne(suggestion)"
          />
        </div>
      </li>
    </ul>

    <div
      class="border-default flex flex-wrap items-center justify-between gap-3 border-t pt-3"
    >
      <UButton
        v-if="suggestions.length > PREVIEW_COUNT"
        color="neutral"
        variant="link"
        size="sm"
        :label="expanded ? 'Show fewer' : `Show all ${suggestions.length}`"
        :trailing-icon="
          expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
        "
        @click="expanded = !expanded"
      />

      <p class="text-muted text-xs">
        By claiming, you confirm you're one of the authors and agree to the
        <ULink to="/terms" target="_blank" class="underline">Terms of Use</ULink
        >.
      </p>

      <UButton
        v-if="suggestions.length > 1"
        size="sm"
        :label="`Claim all ${suggestions.length}`"
        @click="claimAllOpen = true"
      />
    </div>

    <p v-if="data.total > suggestions.length" class="text-muted mt-2 text-xs">
      Showing {{ suggestions.length }} of {{ data.total.toLocaleString() }}.
      More appear as you claim or remove these.
    </p>

    <UModal
      v-model:open="claimAllOpen"
      :title="`Claim ${suggestions.length} posters?`"
      description="You'll be added as one of the authors of each."
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            They will appear in the Published tab of your dashboard and on your
            profile. Claiming doesn't change the posters, and you can remove any
            claim later.
          </p>

          <p class="text-muted">
            Check the list first. By claiming, you confirm you're one of the
            authors of every poster in it and agree to the
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
            icon="i-heroicons-hand-raised"
            :label="`Claim ${suggestions.length} posters`"
            :loading="claimingAll"
            @click="claimAll"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
