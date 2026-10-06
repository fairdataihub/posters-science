<script setup lang="ts">
import dayjs from "dayjs";
import type { ManagedConference } from "#shared/types/managedConference";
import type { ManagedConferencePoster } from "#shared/types/managedConferencePoster";
import { conferencePosterAdditionPath } from "~/utils/conferenceManagementPaths";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const conferenceId = computed(() => route.params.conferenceId as string);

const {
  data: conference,
  error,
  status,
} = await useFetch<ManagedConference>(
  () => `/api/conferences/management/${conferenceId.value}`,
);

watchEffect(() => {
  if (status.value === "error" && error.value) {
    showError({
      statusCode: error.value.statusCode ?? 404,
      statusMessage: error.value.statusMessage ?? "Conference not found",
    });
  }
});

const reg = computed(() => conference.value);
const toast = useToast();

function contactSupport() {
  toast.add({
    title: "Coming soon",
    description:
      "Support contact is not available yet. Your message was not sent.",
    color: "info",
  });
}

function addPosterComingSoon() {
  toast.add({
    title: "Coming soon",
    description:
      "Adding a single poster for this conference is not available yet.",
    color: "info",
  });
}

function inProgressActionComingSoon(poster: ManagedConferencePoster) {
  toast.add({
    title: "Coming soon",
    description:
      poster.submissionKind === "bulk"
        ? "Bulk import review is not connected yet."
        : "Continuing this submission is not available yet.",
    color: "info",
  });
}

const showRegistrationFlow = computed(
  () =>
    reg.value?.status === "pending_review" || reg.value?.status === "rejected",
);

const isApproved = computed(() => reg.value?.status === "approved");

const { data: postersResponse, status: postersStatus } = await useFetch<{
  data: ManagedConferencePoster[];
}>(() => `/api/conferences/management/${conferenceId.value}/posters`, {
  watch: [conferenceId],
});

const conferencePosters = computed(() =>
  isApproved.value ? (postersResponse.value?.data ?? []) : [],
);

const inProgressPosters = computed(() =>
  conferencePosters.value.filter((poster) => poster.status === "in_progress"),
);

const submittedPosters = computed(() =>
  conferencePosters.value.filter((poster) => poster.status === "submitted"),
);

const activePosterTab = ref<"in-progress" | "submitted">("in-progress");

watch(
  () =>
    [inProgressPosters.value.length, submittedPosters.value.length] as const,
  ([inProgress, submitted]) => {
    if (inProgress === 0 && submitted > 0) {
      activePosterTab.value = "submitted";
    }
  },
  { immediate: true },
);

const posterTabs = computed(() => [
  {
    label: `In progress (${inProgressPosters.value.length})`,
    icon: "i-lucide-pencil-line",
    value: "in-progress",
  },
  {
    label: `Submitted (${submittedPosters.value.length})`,
    icon: "i-lucide-circle-check",
    value: "submitted",
  },
]);

const activePosters = computed(() =>
  activePosterTab.value === "in-progress"
    ? inProgressPosters.value
    : submittedPosters.value,
);

const activePosterDescription = computed(() => {
  if (activePosterTab.value === "in-progress") {
    return "Individual submissions and bulk imports that still need your attention.";
  }

  return `Posters linked to ${reg.value?.acronym ?? "this conference"} on Posters.science.`;
});

const visiblePosterCount = computed(
  () => inProgressPosters.value.length + submittedPosters.value.length,
);

const CARD_TITLE_MAX_LENGTH = 80;

function getCardDisplayTitle(poster: ManagedConferencePoster) {
  const title = poster.title;

  return title.length > CARD_TITLE_MAX_LENGTH
    ? `${title.slice(0, CARD_TITLE_MAX_LENGTH).trimEnd()}…`
    : title;
}

function getCardDescription(poster: ManagedConferencePoster) {
  if (poster.status === "submitted") {
    return `${poster.submitterName}${poster.license ? ` · ${poster.license}` : ""}`;
  }

  return inProgressSubtitle(poster);
}

function submittedPresentation() {
  return {
    label: "Submitted",
    color: "success" as const,
    icon: "i-lucide-circle-check",
  };
}

function inProgressActionLabel(poster: ManagedConferencePoster) {
  if (poster.workflowStage === "review_metadata") return "Review metadata";
  if (poster.submissionKind === "bulk") return "Continue submission";

  return "Continue";
}

function openInProgressPoster(poster: ManagedConferencePoster) {
  if (poster.submissionKind === "bulk") {
    void navigateTo(conferencePosterAdditionPath(conferenceId.value));
    return;
  }

  inProgressActionComingSoon(poster);
}

function openConferencePoster(poster: ManagedConferencePoster) {
  if (poster.status === "in_progress") {
    openInProgressPoster(poster);

    return;
  }

  toast.add({
    title: "Coming soon",
    description: "Opening poster details is not available yet.",
    color: "info",
  });
}

function posterThumbnail(poster: ManagedConferencePoster) {
  return (
    poster.thumbnailUrl ||
    `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(poster.id)}`
  );
}

function workflowPresentation(poster: ManagedConferencePoster) {
  switch (poster.workflowStage) {
    case "queued":
      return {
        label: "Queued for extraction",
        color: "info" as const,
        icon: "i-lucide-loader-circle",
      };
    case "extracting":
      return {
        label: "Extracting metadata",
        color: "info" as const,
        icon: "i-lucide-loader-circle",
      };
    case "review_metadata":
      return {
        label: "Review metadata",
        color: "warning" as const,
        icon: "i-lucide-file-pen-line",
      };
    case "import_processing":
      return {
        label: "Processing bulk import",
        color: "info" as const,
        icon: "i-lucide-loader-circle",
      };
    case "failed":
      return {
        label: "Needs attention",
        color: "error" as const,
        icon: "i-lucide-circle-alert",
      };
    default:
      return {
        label: "In progress",
        color: "neutral" as const,
        icon: "i-lucide-clock",
      };
  }
}

function inProgressSubtitle(poster: ManagedConferencePoster) {
  if (poster.submissionKind === "bulk") {
    const count = poster.posterCount ?? 0;
    const countLabel = count === 1 ? "1 poster" : `${count} posters`;
    return `${poster.submitterName} · Bulk import · ${countLabel}`;
  }

  return `${poster.submitterName} · Updated ${dayjs(poster.updatedAt).format("MMMM D, YYYY")}`;
}

const statusBadge = computed(() => {
  if (!reg.value) {
    return {
      label: "Unknown",
      color: "neutral" as const,
      icon: "i-lucide-help-circle",
    };
  }

  switch (reg.value.status) {
    case "pending_review":
      return {
        label: "Pending review",
        color: "warning" as const,
        icon: "i-lucide-clock",
      };
    case "approved":
      return {
        label: "Accepted",
        color: "success" as const,
        icon: "i-lucide-circle-check",
      };
    case "rejected":
      return {
        label: "Not approved",
        color: "error" as const,
        icon: "i-lucide-circle-x",
      };
  }
});

useSeoMeta({
  title: () =>
    reg.value
      ? `${reg.value.name} — Conference management`
      : "Conference management",
  description: () =>
    reg.value
      ? `Manage ${reg.value.name} on Posters.science.`
      : "Manage conferences on Posters.science.",
});

const progressSteps = computed(() => {
  if (!reg.value) return [];

  return [
    {
      label: "Registration submitted",
      done: true,
      active: false,
      detail: null as string | null,
    },
    {
      label: "Organizer verification",
      done: reg.value.status !== "pending_review",
      active: reg.value.status === "pending_review",
      detail: null,
    },
    {
      label: "Conference listed on Posters.science",
      done: reg.value.status === "approved",
      active: false,
      detail: null,
    },
  ];
});
</script>

<template>
  <div
    v-if="reg"
    class="mx-auto flex w-full max-w-screen-xl flex-col gap-8 px-6 pb-12"
  >
    <UPageHeader
      :title="reg.name"
      :description="`${reg.acronym} · ${reg.location} · ${reg.dateRange}`"
      :links="[
        {
          label: 'Back to conference management',
          to: '/conferences/management',
          icon: 'i-lucide-arrow-left',
          color: 'neutral' as const,
          variant: 'ghost' as const,
        },
      ]"
    />

    <UCard v-if="showRegistrationFlow">
      <div class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="statusBadge.color"
            variant="solid"
            size="sm"
            :icon="statusBadge.icon"
          >
            {{ statusBadge.label }}
          </UBadge>

          <span
            v-if="reg.status === 'pending_review'"
            class="text-muted text-sm"
          >
            Submitted
            {{ dayjs(reg.submittedAt).format("MMMM D, YYYY") }}
          </span>
        </div>

        <UAlert
          v-if="reg.status === 'pending_review'"
          color="info"
          variant="soft"
          icon="i-lucide-info"
          title="Your registration is in progress"
          description="Posters.science is reviewing this request. We verify that registrants are authorized to represent the conference."
        />

        <UAlert
          v-else-if="reg.status === 'rejected'"
          color="error"
          variant="soft"
          icon="i-lucide-circle-x"
          title="Registration not approved"
          description="This conference registration was not approved. Contact Posters.science if you believe this is an error."
        />

        <div v-if="reg.status === 'pending_review'" class="space-y-3">
          <h2 class="text-base font-semibold">Registration progress</h2>

          <ol class="space-y-3">
            <li
              v-for="(step, index) in progressSteps"
              :key="step.label"
              class="flex items-start gap-3 text-sm"
            >
              <UIcon
                v-if="step.done"
                name="i-lucide-circle-check"
                class="text-success mt-0.5 size-5 shrink-0"
              />

              <UIcon
                v-else-if="step.active"
                name="i-lucide-loader-circle"
                class="text-primary mt-0.5 size-5 shrink-0 animate-spin"
              />

              <UIcon
                v-else
                name="i-lucide-circle-dashed"
                class="text-dimmed mt-0.5 size-5 shrink-0"
              />

              <div>
                <p
                  :class="
                    step.active
                      ? 'text-highlighted font-medium'
                      : step.done
                        ? 'text-muted'
                        : 'text-dimmed'
                  "
                >
                  {{ index + 1 }}. {{ step.label }}
                </p>

                <p v-if="step.active" class="text-muted mt-1 text-xs">
                  This step is in progress. Typical review takes a few business
                  days.
                </p>

                <p
                  v-else-if="step.detail && !step.done"
                  class="text-muted mt-1 text-xs"
                >
                  {{ step.detail }}
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div
          class="flex justify-start border-t border-gray-100 pt-4 dark:border-gray-800"
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-mail"
            label="Contact Posters.science"
            @click="contactSupport"
          />
        </div>
      </div>
    </UCard>

    <template v-else-if="isApproved">
      <div class="flex flex-col gap-6">
        <UPageHeader title="Conference posters">
          <template #description>
            <div
              class="flex w-full flex-wrap items-center justify-between gap-4"
            >
              <span>
                Track submissions in progress and posters linked to
                {{ reg.acronym }} on Posters.science.
              </span>

              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  color="primary"
                  variant="solid"
                  icon="heroicons:plus"
                  label="Add a poster"
                  size="sm"
                  @click="addPosterComingSoon"
                />
                <UButton
                  color="primary"
                  variant="outline"
                  icon="line-md:file-upload"
                  label="Bulk add posters"
                  size="sm"
                  :to="conferencePosterAdditionPath(reg.id)"
                />
              </div>
            </div>
          </template>
        </UPageHeader>

        <div
          v-if="postersStatus === 'pending'"
          class="text-muted py-8 text-center text-sm"
        >
          Loading posters…
        </div>

        <template v-else-if="visiblePosterCount > 0">
          <UTabs
            v-model="activePosterTab"
            :items="posterTabs"
            :content="false"
            class="w-full"
          />

          <section v-if="activePosters.length > 0" class="space-y-3">
            <p class="text-muted text-sm">{{ activePosterDescription }}</p>

            <UPageList class="max-md:flex max-md:flex-col max-md:gap-4">
              <UPageCard
                v-for="poster in activePosters"
                :key="poster.id"
                variant="ghost"
                class="group h-50 cursor-pointer overflow-hidden rounded-none border-t border-b border-gray-100 transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm max-md:hover:shadow-md dark:max-md:border-gray-800 dark:max-md:bg-gray-950"
                tabindex="0"
                @click="openConferencePoster(poster)"
                @keydown.enter="openConferencePoster(poster)"
                @keydown.space.prevent="openConferencePoster(poster)"
              >
                <div
                  class="flex h-full gap-8 max-md:h-auto max-md:flex-col max-md:gap-0"
                >
                  <div
                    class="h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b max-md:border-gray-100 dark:max-md:border-gray-800"
                  >
                    <div
                      v-if="
                        poster.status === 'in_progress' &&
                        poster.submissionKind === 'bulk'
                      "
                      class="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center max-md:min-h-44"
                    >
                      <UIcon
                        name="line-md:file-upload"
                        class="text-muted size-8"
                      />
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        Bulk import
                      </span>
                    </div>

                    <img
                      v-else
                      :src="posterThumbnail(poster)"
                      :alt="poster.title"
                      class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 max-md:h-full max-md:max-h-none max-md:p-3"
                    />
                  </div>

                  <div
                    class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
                  >
                    <div class="flex flex-col gap-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <UBadge
                          v-if="poster.status === 'in_progress'"
                          :color="workflowPresentation(poster).color"
                          variant="solid"
                          size="sm"
                          :icon="workflowPresentation(poster).icon"
                        >
                          {{ workflowPresentation(poster).label }}
                        </UBadge>

                        <UBadge
                          v-else
                          :color="submittedPresentation().color"
                          variant="solid"
                          size="sm"
                          :icon="submittedPresentation().icon"
                        >
                          {{ submittedPresentation().label }}
                        </UBadge>

                        <UBadge
                          v-if="
                            poster.status === 'in_progress' &&
                            poster.submissionKind === 'bulk' &&
                            poster.posterCount
                          "
                          color="neutral"
                          variant="soft"
                          size="sm"
                        >
                          {{ poster.posterCount }} posters
                        </UBadge>

                        <UBadge
                          v-if="poster.status === 'submitted' && poster.license"
                          color="neutral"
                          variant="soft"
                          size="sm"
                        >
                          {{ poster.license }}
                        </UBadge>
                      </div>

                      <h3
                        class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
                        :title="poster.title"
                      >
                        {{
                          getCardDisplayTitle(poster) || "No title available"
                        }}
                      </h3>

                      <p class="text-muted line-clamp-2 text-sm">
                        {{ getCardDescription(poster) }}
                      </p>
                    </div>

                    <div
                      class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs max-md:flex-wrap max-md:gap-y-2 dark:border-gray-800"
                    >
                      <div
                        class="text-muted flex items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1"
                      >
                        <span
                          v-if="poster.status === 'in_progress'"
                          class="flex items-center gap-1"
                        >
                          <Icon
                            name="heroicons:calendar-days"
                            class="h-3 w-3"
                          />
                          Updated
                          {{ dayjs(poster.updatedAt).format("MMMM D, YYYY") }}
                        </span>

                        <span
                          v-else-if="poster.submittedAt"
                          class="flex items-center gap-1"
                        >
                          <Icon
                            name="heroicons:presentation-chart-bar"
                            class="h-3 w-3"
                          />
                          Submitted
                          {{ dayjs(poster.submittedAt).format("MMMM D, YYYY") }}
                        </span>
                      </div>

                      <div
                        class="flex items-center gap-2 max-md:flex-wrap"
                        @click.stop
                      >
                        <UButton
                          v-if="poster.status === 'submitted'"
                          color="neutral"
                          variant="subtle"
                          label="View poster"
                          icon="i-lucide-eye"
                          size="xs"
                          disabled
                        />

                        <UButton
                          v-else
                          color="primary"
                          variant="subtle"
                          :label="inProgressActionLabel(poster)"
                          icon="i-lucide-arrow-right"
                          trailing
                          size="xs"
                          @click="openInProgressPoster(poster)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </UPageCard>
            </UPageList>
          </section>

          <div v-else class="py-12 text-center">
            <Icon
              :name="
                activePosterTab === 'in-progress'
                  ? 'i-lucide-pencil-line'
                  : 'i-lucide-circle-check'
              "
              class="text-muted mx-auto mb-4 h-12 w-12"
            />

            <h3 class="text-lg font-medium">
              {{
                activePosterTab === "in-progress"
                  ? "No posters in progress"
                  : "No submitted posters"
              }}
            </h3>

            <p class="text-muted text-sm">
              {{
                activePosterTab === "in-progress"
                  ? "New uploads and bulk imports will appear here."
                  : "Submitted posters for this conference will appear here."
              }}
            </p>
          </div>
        </template>

        <div v-else class="py-12 text-center">
          <div class="mx-auto flex max-w-md flex-col items-center gap-3">
            <Icon name="heroicons:document-text" class="text-muted h-12 w-12" />

            <h3 class="text-lg font-medium">No posters yet</h3>

            <p class="text-muted text-sm">
              Add a poster, run a bulk import, or wait for participants to
              submit.
            </p>

            <div class="mt-2 flex flex-wrap justify-center gap-2">
              <UButton
                color="primary"
                icon="heroicons:plus"
                label="Add a poster"
                @click="addPosterComingSoon"
              />
              <UButton
                color="primary"
                variant="outline"
                icon="line-md:file-upload"
                label="Bulk add posters"
                :to="conferencePosterAdditionPath(reg.id)"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
