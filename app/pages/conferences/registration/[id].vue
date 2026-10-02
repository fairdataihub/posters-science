<script setup lang="ts">
import dayjs from "dayjs";
import { getConferenceRegistrationById } from "~/utils/conferenceRegistrationMock";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const registrationId = computed(() => route.params.id as string);

const registration = computed(() =>
  getConferenceRegistrationById(registrationId.value),
);

if (!registration.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Registration not found",
  });
}

const reg = registration.value;

useSeoMeta({
  title: `${reg.name} — Conference registration`,
  description: `Registration progress for ${reg.name} on Posters.science.`,
});

const posterSubmissionStep = computed(() => {
  if (reg.participantPosterChoice === "organizer-import") {
    return {
      label: "Bulk import participant posters",
      detail:
        "After acceptance, use conference management to import posters in bulk on behalf of attendees (folder or zip). You will confirm licensing for each poster during import.",
    };
  }

  return {
    label: "Participants submit their own posters",
    detail:
      "After acceptance, attendees can submit posters linked to this conference on Posters.science.",
  };
});

const progressSteps = computed(() => [
  {
    label: "Registration submitted",
    done: true,
    active: false,
    detail: null as string | null,
  },
  {
    label: "Organizer verification",
    done: false,
    active: reg.status === "pending_review",
    detail: null,
  },
  {
    label: "Conference listed on Posters.science",
    done: reg.status === "approved",
    active: false,
    detail: null,
  },
  {
    label: posterSubmissionStep.value.label,
    done: reg.status === "approved",
    active: false,
    detail: posterSubmissionStep.value.detail,
  },
]);
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-8 px-6 pb-12">
    <UPageHeader
      :title="reg.name"
      :description="`${reg.acronym} · ${reg.location} · ${reg.dateRange}`"
      :links="[
        {
          label: 'Back to conference management',
          to: '/conferences/registration',
          icon: 'i-lucide-arrow-left',
          color: 'neutral' as const,
          variant: 'ghost' as const,
        },
      ]"
    />

    <UCard>
      <div class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            color="warning"
            variant="solid"
            size="sm"
            icon="i-lucide-clock"
          >
            Pending review
          </UBadge>

          <span class="text-muted text-sm">
            Submitted
            {{ dayjs(reg.submittedAt).format("MMMM D, YYYY") }}
          </span>
        </div>

        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-info"
          title="Your registration is in progress"
          description="Posters.science is reviewing this request. We verify that registrants are authorized to represent the conference."
        />

        <div class="space-y-3">
          <h2 class="text-base font-semibold">Progress</h2>

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
                  This step is in progress. We will review your request and
                  notify you when it is complete. days.
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
      </div>
    </UCard>
  </div>
</template>
