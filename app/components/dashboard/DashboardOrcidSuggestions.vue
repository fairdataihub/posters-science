<script setup lang="ts">
import type {
  OrcidSuggestion,
  OrcidSuggestions,
} from "#shared/types/orcidSuggestions";
import { orcidUrl } from "#shared/utils/orcid";
import { parseApiError } from "~/utils/apiError";

// The dashboard's Suggested tab: auto-indexed posters that list the user's
// verified ORCID iD, as cards like the other tabs. Each one can be claimed or
// marked "Not me", and the tab can be hidden and brought back from the
// settings page.

const props = defineProps<{
  /** Null while the suggestions load. */
  data: OrcidSuggestions | null;
}>();

const emit = defineEmits<{
  /** Suggestions changed and should be fetched again. */
  changed: [];
  /** Posters were claimed, so the published list changed too. */
  claimed: [];
}>();

const toast = useToast();

const busyIds = ref(new Set<number>());
const expandedDescriptions = ref(new Set<number>());
const claimAllOpen = ref(false);
const claimingAll = ref(false);
const hiding = ref(false);

const suggestions = computed(() => props.data?.suggestions ?? []);

function posterPath(suggestion: OrcidSuggestion) {
  return `/discover/${suggestion.versionId}`;
}

// A new tab, so the list keeps its place while posters are checked one by one.
function openSuggestion(suggestion: OrcidSuggestion) {
  window.open(posterPath(suggestion), "_blank", "noopener");
}

function yearLabel(suggestion: OrcidSuggestion) {
  const year = suggestion.publicationYear
    ? String(suggestion.publicationYear)
    : null;

  // The conference label usually carries the year already.
  return year && !suggestion.conference?.includes(year) ? year : null;
}

function toggleDescription(posterId: number) {
  const next = new Set(expandedDescriptions.value);

  if (next.has(posterId)) {
    next.delete(posterId);
  } else {
    next.add(posterId);
  }

  expandedDescriptions.value = next;
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
  <section aria-labelledby="orcid-suggestions-title" class="space-y-3">
    <h2 id="orcid-suggestions-title" class="sr-only">Suggested posters</h2>

    <div v-if="!data" class="space-y-3" aria-busy="true">
      <USkeleton class="h-4 w-2/3" />

      <div
        v-for="n in 3"
        :key="n"
        class="flex h-50 gap-8 border-t border-b border-gray-100 py-4 max-md:h-auto max-md:flex-col max-md:gap-3 dark:border-gray-800"
      >
        <USkeleton
          class="h-full w-[150px] shrink-0 max-md:h-44 max-md:w-full"
        />

        <div class="flex flex-1 flex-col gap-3 py-1">
          <USkeleton class="h-5 w-40" />

          <USkeleton class="h-6 w-3/4" />

          <USkeleton class="h-4 w-full" />
        </div>
      </div>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 space-y-1">
          <p class="text-muted text-sm">
            Auto-indexed posters that list your ORCID iD
            <ULink
              v-if="data.orcid"
              :to="orcidUrl(data.orcid)"
              target="_blank"
              class="text-primary underline"
              >{{ data.orcid }}</ULink
            >
            for one of their authors. Claim the ones you authored to add them to
            your Published tab and profile.
          </p>

          <p class="text-muted text-xs">
            By claiming, you confirm you're one of the authors and agree to the
            <ULink to="/terms" target="_blank" class="underline"
              >Terms of Use</ULink
            >.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-1">
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
                  We list the posters whose author list includes the ORCID iD
                  you verified. Posters you shared yourself, posters you already
                  claimed, retired posters and ones you marked Not me are left
                  out.
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

          <UButton
            v-if="suggestions.length > 1"
            size="sm"
            icon="i-heroicons-hand-raised"
            :label="`Claim all ${suggestions.length}`"
            @click="claimAllOpen = true"
          />
        </div>
      </div>

      <UPageList
        v-if="suggestions.length > 0"
        class="max-md:flex max-md:flex-col max-md:gap-4"
      >
        <UPageCard
          v-for="suggestion in suggestions"
          :key="suggestion.posterId"
          variant="ghost"
          class="group h-50 cursor-pointer overflow-hidden rounded-none border-t border-b border-gray-100 transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm max-md:hover:shadow-md dark:max-md:border-gray-800 dark:max-md:bg-gray-950"
          tabindex="0"
          @click="openSuggestion(suggestion)"
          @keydown.enter.self="openSuggestion(suggestion)"
          @keydown.space.self.prevent="openSuggestion(suggestion)"
        >
          <div
            class="flex h-full gap-8 max-md:h-auto max-md:flex-col max-md:gap-0"
          >
            <div
              class="h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b max-md:border-gray-100 dark:max-md:border-gray-800"
            >
              <PosterImage
                :src="suggestion.imageUrl"
                :seed="suggestion.posterId"
                :alt="suggestion.title || 'Untitled poster'"
                loading="lazy"
                class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 max-md:h-full max-md:max-h-none max-md:p-3"
              />
            </div>

            <div
              class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
            >
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    color="primary"
                    variant="soft"
                    size="sm"
                    icon="i-lucide-sparkles"
                  >
                    Auto-indexed
                  </UBadge>

                  <UTooltip
                    text="The author next to your ORCID iD in this poster's record."
                  >
                    <UBadge
                      color="neutral"
                      variant="soft"
                      size="sm"
                      icon="i-simple-icons-orcid"
                      class="cursor-help"
                    >
                      {{
                        suggestion.listedAs
                          ? `Listed as ${suggestion.listedAs}`
                          : "Lists your iD"
                      }}
                    </UBadge>
                  </UTooltip>
                </div>

                <h3
                  class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
                  :title="suggestion.title"
                >
                  {{ suggestion.title || "Untitled poster" }}
                </h3>

                <div class="flex flex-col gap-1">
                  <p
                    :class="[
                      'text-sm',
                      expandedDescriptions.has(suggestion.posterId)
                        ? ''
                        : 'line-clamp-2',
                    ]"
                  >
                    {{ suggestion.description || "No description available" }}
                  </p>

                  <button
                    v-if="suggestion.description.length > 100"
                    class="text-primary w-fit text-left text-xs font-medium md:hidden"
                    @click.stop="toggleDescription(suggestion.posterId)"
                  >
                    {{
                      expandedDescriptions.has(suggestion.posterId)
                        ? "Show less"
                        : "Show more"
                    }}
                  </button>
                </div>
              </div>

              <div
                class="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs max-md:flex-wrap max-md:gap-y-2 dark:border-gray-800"
              >
                <div
                  class="text-muted flex min-w-0 items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1"
                >
                  <span
                    v-if="suggestion.conference"
                    class="flex items-center gap-1"
                  >
                    <Icon
                      name="heroicons:presentation-chart-bar"
                      class="h-3 w-3"
                    />
                    {{ suggestion.conference }}
                  </span>

                  <span
                    v-if="yearLabel(suggestion)"
                    class="flex items-center gap-1"
                    :class="
                      suggestion.conference
                        ? 'border-l border-gray-100 pl-2 max-md:border-l-0 max-md:pl-0 dark:border-gray-800'
                        : ''
                    "
                  >
                    <Icon name="heroicons:calendar-days" class="h-3 w-3" />
                    {{ yearLabel(suggestion) }}
                  </span>
                </div>

                <div
                  class="flex shrink-0 items-center gap-2 max-md:flex-wrap"
                  @click.stop
                >
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-user-x"
                    label="Not me"
                    :disabled="busyIds.has(suggestion.posterId) || claimingAll"
                    @click="dismiss(suggestion)"
                  />

                  <UButton
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    icon="i-lucide-eye"
                    label="View poster"
                    :to="posterPath(suggestion)"
                    target="_blank"
                  />

                  <UButton
                    color="primary"
                    variant="subtle"
                    size="xs"
                    icon="i-heroicons-hand-raised"
                    label="Claim"
                    :loading="busyIds.has(suggestion.posterId)"
                    :disabled="claimingAll"
                    @click="claimOne(suggestion)"
                  />
                </div>
              </div>
            </div>
          </div>
        </UPageCard>
      </UPageList>

      <div
        v-else
        class="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center"
      >
        <Icon name="i-lucide-circle-check" class="text-muted h-12 w-12" />

        <h3 class="text-lg font-medium">No suggestions right now</h3>

        <p class="text-muted text-sm">
          Posters you claim move to your Published tab. New auto-indexed posters
          that list your iD will show up here.
        </p>
      </div>

      <p v-if="data.total > suggestions.length" class="text-muted text-xs">
        Showing {{ suggestions.length }} of {{ data.total.toLocaleString() }}.
        More appear as you claim or remove these.
      </p>
    </template>

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
