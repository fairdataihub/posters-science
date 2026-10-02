<script setup lang="ts">
import dayjs from "dayjs";
import {
  MOCK_CONFERENCE_REGISTRATIONS,
  type ConferenceRegistration,
  type ConferenceRegistrationStatus,
} from "~/utils/conferenceRegistrationMock";

definePageMeta({
  middleware: ["auth"],
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Conference management - Posters.science")}&description=${encodeURIComponent("Manage conferences on Posters.science")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Conference management - Posters.science",
  description: "Manage conference registrations and poster import on Posters.science.",
  ogTitle: "Conference management - Posters.science",
  ogDescription:
    "Manage conference registrations and poster import on Posters.science.",
  ogImage,
});

const toast = useToast();

/** Placeholder until conference registration API exists. */
const registrations = ref<ConferenceRegistration[]>([
  ...MOCK_CONFERENCE_REGISTRATIONS,
]);

const statusSortOrder: Record<ConferenceRegistrationStatus, number> = {
  pending_review: 0,
  approved: 1,
  rejected: 2,
};

const sortedRegistrations = computed(() =>
  [...registrations.value].sort(
    (a, b) => statusSortOrder[a.status] - statusSortOrder[b.status],
  ),
);

function statusPresentation(status: ConferenceRegistrationStatus) {
  switch (status) {
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
}

function posterPlanLabel(
  choice: ConferenceRegistration["participantPosterChoice"],
) {
  return choice === "organizer-import"
    ? "Organizer uploads for participants"
    : "Participants submit their own posters";
}

function conferenceImageUrl(conference: ConferenceRegistration) {
  return (
    conference.imageUrl ??
    `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(conference.id)}`
  );
}

function openRegistration(conference: ConferenceRegistration) {
  navigateTo(`/conferences/registration/${conference.id}`);
}

function startBulkImport(conference: ConferenceRegistration) {
  toast.add({
    title: "Coming soon",
    description: `Bulk poster import for ${conference.acronym} is not available yet.`,
    color: "info",
  });
}

function isPending(conference: ConferenceRegistration) {
  return conference.status === "pending_review";
}

function isAccepted(conference: ConferenceRegistration) {
  return conference.status === "approved";
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 pb-12">
    <UPageHeader
      title="Conference management"
      :links="[
        {
          label: 'Register new conference',
          to: '/conferences/register',
          icon: 'heroicons:plus',
          color: 'primary' as const,
        },
      ]"
    />

    <section v-if="sortedRegistrations.length > 0">
      <UPageList class="max-md:flex max-md:flex-col max-md:gap-4">
        <UPageCard
          v-for="conference in sortedRegistrations"
          :key="conference.id"
          variant="ghost"
          class="group h-50 overflow-hidden rounded-none border-t border-b border-gray-100 transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm dark:max-md:border-gray-800 dark:max-md:bg-gray-950"
          :class="
            isPending(conference) ? 'cursor-pointer max-md:hover:shadow-md' : ''
          "
          :tabindex="isPending(conference) ? 0 : undefined"
          @click="isPending(conference) && openRegistration(conference)"
          @keydown.enter="isPending(conference) && openRegistration(conference)"
          @keydown.space.prevent="
            isPending(conference) && openRegistration(conference)
          "
        >
          <div
            class="flex h-full gap-8 max-md:h-auto max-md:flex-col max-md:gap-0"
          >
            <div
              class="h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b max-md:border-gray-100 dark:max-md:border-gray-800"
            >
              <img
                :src="conferenceImageUrl(conference)"
                :alt="`${conference.name} image`"
                class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 max-md:h-full max-md:max-h-none max-md:p-3"
              />
            </div>

            <div
              class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
            >
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    :color="statusPresentation(conference.status).color"
                    variant="solid"
                    size="sm"
                    :icon="statusPresentation(conference.status).icon"
                  >
                    {{ statusPresentation(conference.status).label }}
                  </UBadge>

                  <UBadge
                    v-if="
                      isAccepted(conference) &&
                      conference.participantPosterChoice === 'organizer-import'
                    "
                    color="primary"
                    variant="soft"
                    size="sm"
                    icon="line-md:file-upload"
                  >
                    Bulk import enabled
                  </UBadge>
                </div>

                <h3
                  class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
                  :title="conference.name"
                >
                  {{ conference.name }}
                </h3>

                <div class="flex flex-col gap-1">
                  <p class="text-muted line-clamp-2 text-sm">
                    {{ conference.description }}
                  </p>

                  <p class="text-muted text-xs">
                    {{ conference.location }} · {{ conference.dateRange }}
                  </p>

                  <p class="text-muted text-xs">
                    {{ posterPlanLabel(conference.participantPosterChoice) }}
                  </p>
                </div>
              </div>

              <div
                class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs max-md:flex-wrap max-md:gap-y-2 dark:border-gray-800"
              >
                <span class="text-muted flex items-center gap-1">
                  <Icon name="heroicons:calendar-days" class="h-3 w-3" />
                  {{
                    conference.status === "approved" ? "Accepted" : "Submitted"
                  }}
                  {{ dayjs(conference.submittedAt).format("MMMM D, YYYY") }}
                </span>

                <div
                  class="flex items-center gap-2 max-md:flex-wrap"
                  @click.stop
                >
                  <template v-if="isAccepted(conference)">
                    <UButton
                      v-if="
                        conference.participantPosterChoice ===
                        'organizer-import'
                      "
                      color="primary"
                      variant="subtle"
                      label="Import posters"
                      icon="line-md:file-upload"
                      size="xs"
                      @click="startBulkImport(conference)"
                    />

                    <UButton
                      color="neutral"
                      variant="subtle"
                      label="Browse posters"
                      icon="material-symbols:saved-search"
                      size="xs"
                      :to="{
                        path: '/discover',
                        query: { conferenceId: conference.id },
                      }"
                    />

                    <UButton
                      v-if="
                        conference.participantPosterChoice ===
                        'participants-submit'
                      "
                      color="primary"
                      variant="subtle"
                      label="Submit poster"
                      icon="heroicons:plus"
                      size="xs"
                      :to="{
                        path: '/share/new',
                        query: { conferenceId: conference.id },
                      }"
                    />
                  </template>

                  <template v-else-if="isPending(conference)">
                    <UButton
                      color="primary"
                      variant="subtle"
                      label="View registration status"
                      icon="i-lucide-arrow-right"
                      trailing
                      size="xs"
                      @click="openRegistration(conference)"
                    />
                  </template>
                </div>
              </div>
            </div>
          </div>
        </UPageCard>
      </UPageList>
    </section>

    <div v-else class="py-12 text-center">
      <NuxtLink
        to="/conferences/register"
        class="group inline-block rounded-2xl px-8 py-6 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50"
      >
        <div
          class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-gray-200 dark:bg-gray-800 dark:group-hover:bg-gray-700"
        >
          <Icon
            name="material-symbols:event-available"
            class="h-12 w-12 text-gray-400 transition-colors group-hover:text-gray-500"
          />
        </div>

        <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
          No conference registrations yet
        </h3>

        <p
          class="mb-6 text-gray-500 underline-offset-2 group-hover:underline dark:text-gray-400"
        >
          Submit your first conference registration for review.
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
