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
      <section class="space-y-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Posters submitted</h2>
            <p class="text-muted text-sm">
              Posters linked to {{ reg.acronym }} on Posters.science.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="primary"
              variant="solid"
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

        <div
          v-if="postersStatus === 'pending'"
          class="text-muted py-8 text-center text-sm"
        >
          Loading posters…
        </div>

        <ul
          v-else-if="conferencePosters.length > 0"
          class="border-default divide-default max-h-[800px] divide-y overflow-y-auto rounded-lg border"
        >
          <li
            v-for="poster in conferencePosters"
            :key="poster.id"
            class="flex items-center gap-4 px-4 py-3"
          >
            <div
              class="bg-muted/30 flex h-20 w-16 shrink-0 items-center justify-center rounded-md"
            >
              <img
                :src="
                  poster.thumbnailUrl ||
                  `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(poster.id)}`
                "
                :alt="poster.title"
                class="max-h-[4.5rem] max-w-full object-contain p-1.5"
              />
            </div>

            <div class="min-w-0 flex-1">
              <p class="line-clamp-2 text-sm leading-snug font-semibold">
                {{ poster.title }}
              </p>
              <p class="text-muted mt-0.5 truncate text-sm">
                {{ poster.submitterName }}
                · Submitted
                {{ dayjs(poster.submittedAt).format("MMMM D, YYYY") }}
              </p>
              <UBadge class="mt-1.5" color="neutral" variant="soft" size="xs">
                {{ poster.license }}
              </UBadge>
            </div>

            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              label="View"
              icon="i-lucide-external-link"
              trailing
              disabled
              class="shrink-0"
            />
          </li>
        </ul>

        <div
          v-else
          class="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center dark:border-gray-800"
        >
          <UIcon
            name="i-lucide-images"
            class="text-dimmed mx-auto mb-3 size-10"
          />
          <p class="font-medium">No posters yet</p>
          <p class="text-muted mt-1 text-sm">
            Add a poster or bulk add posters for this conference, or wait for
            participants to submit.
          </p>
        </div>
      </section>
    </template>
  </div>
</template>
