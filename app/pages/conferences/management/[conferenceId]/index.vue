<script setup lang="ts">
import dayjs from "dayjs";
import type { ManagedConference } from "#shared/types/managedConference";

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

    <UCard v-else-if="isApproved">
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
        </div>

        <p class="text-muted text-sm">
          {{ reg.description }}
        </p>

        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-info"
          title="Poster submissions"
          description="Use your main dashboard to track individual poster drafts and published work. Import many posters at once with the bulk upload flow."
        />

        <div
          class="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-800"
        >
          <UButton
            color="primary"
            icon="line-md:file-upload"
            label="Share Posters in bulk"
            to="/share/new-bulk"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="heroicons:plus"
            label="Add a poster"
            @click="addPosterComingSoon"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-layout-dashboard"
            label="Go to dashboard"
            to="/dashboard"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
