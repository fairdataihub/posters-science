<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Conference registration - Posters.science")}&description=${encodeURIComponent("Submit a conference registration on Posters.science")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Conference registration",
  description:
    "Submit a conference registration on Posters.science. We review each request before the conference is listed.",
  ogTitle: "Conference registration - Posters.science",
  ogDescription:
    "Submit a conference registration on Posters.science. We review each request before the conference is listed.",
  ogImage,
});

const toast = useToast();

const conference = reactive({
  name: "",
  acronym: "",
  location: "",
  website: "",
  startDate: "",
  endDate: "",
  submissionDeadline: "",
  organizerName: "",
  contactEmail: "",
  description: "",
});

type ParticipantPosterChoice = "participants-submit" | "organizer-import";

const participantPosterItems: {
  label: string;
  value: ParticipantPosterChoice;
  description: string;
}[] = [
  {
    label: "Participants submit their own posters",
    value: "participants-submit",
    description:
      "Attendees will typically submit their own posters on Posters.science.",
  },
  {
    label: "I will upload posters for participants",
    value: "organizer-import",
    description:
      "You plan to upload or import posters on behalf of presenters.",
  },
];

const participantPosterChoice = ref<ParticipantPosterChoice>(
  "participants-submit",
);

const participantPosterNotes = ref("");

const organizerLicensingAcknowledged = ref(false);

const CONFERENCE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_CONFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const CONFERENCE_IMAGE_HINT = "JPEG, PNG, or WebP up to 5 MB";

const conferenceImageFiles = ref<File[]>([]);
const conferenceImagePreviewUrl = ref<string | null>(null);

function validateConferenceImage(file: File): string | null {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_CONFERENCE_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

function onConferenceImageRejected(
  rejections: { file: File; reason: string }[],
) {
  const first = rejections[0];
  if (!first) return;

  toast.add({
    title: "Image not accepted",
    description: `${first.file.name}: ${first.reason}`,
    color: "error",
  });
}

watch(participantPosterChoice, (choice) => {
  if (choice !== "organizer-import") {
    organizerLicensingAcknowledged.value = false;
  }
});

watch(conferenceImageFiles, (files) => {
  if (conferenceImagePreviewUrl.value) {
    URL.revokeObjectURL(conferenceImagePreviewUrl.value);
    conferenceImagePreviewUrl.value = null;
  }

  const file = files[0];
  if (file) {
    conferenceImagePreviewUrl.value = URL.createObjectURL(file);
  }
});

onUnmounted(() => {
  if (conferenceImagePreviewUrl.value) {
    URL.revokeObjectURL(conferenceImagePreviewUrl.value);
  }
});

const canSubmit = computed(() => {
  const base =
    conference.name.trim().length > 0 &&
    conference.acronym.trim().length > 0 &&
    conference.contactEmail.trim().length > 0;

  if (!base) return false;

  if (participantPosterChoice.value === "organizer-import") {
    return organizerLicensingAcknowledged.value;
  }

  return true;
});

const submitAttempted = ref(false);

const acronymFieldError = computed(() =>
  submitAttempted.value && !conference.acronym.trim()
    ? "Acronym is required"
    : undefined,
);

function submitRegistration() {
  submitAttempted.value = true;

  if (
    !conference.name.trim() ||
    !conference.acronym.trim() ||
    !conference.contactEmail.trim()
  ) {
    return;
  }

  if (
    participantPosterChoice.value === "organizer-import" &&
    !organizerLicensingAcknowledged.value
  ) {
    return;
  }

  toast.add({
    title: "Coming soon",
    description:
      "Conference registration is not available yet. Your responses were not saved.",
    color: "info",
  });
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-8 px-6 pb-12">
    <UPageHeader
      title="Conference registration"
      description="Tell us about your conference. We review each registration before listing it on Posters.science."
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

    <form class="flex flex-col gap-8" @submit.prevent="submitRegistration">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Conference registration</h2>
        </template>

        <div class="flex flex-col gap-8">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Conference name" required class="sm:col-span-2">
              <UInput
                v-model="conference.name"
                placeholder="e.g. Annual Research Conference"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Acronym"
              name="acronym"
              required
              :error="acronymFieldError"
            >
              <UInput
                v-model="conference.acronym"
                name="acronym"
                required
                placeholder="e.g. EARC"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Location">
              <UInput
                v-model="conference.location"
                placeholder="City, country, or Virtual"
                class="w-full"
              />
            </UFormField>

            <div class="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <UFormField label="Start date">
                <UInput
                  v-model="conference.startDate"
                  type="date"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="End date">
                <UInput
                  v-model="conference.endDate"
                  type="date"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Participant submission deadline"
                description="A target date you share with attendees for when you would like posters submitted."
              >
                <UInput
                  v-model="conference.submissionDeadline"
                  type="date"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField label="Conference website" class="sm:col-span-2">
              <UInput
                v-model="conference.website"
                type="url"
                placeholder="https://"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Organizer name">
              <UInput
                v-model="conference.organizerName"
                placeholder="Primary contact name"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Organizer email" required>
              <UInput
                v-model="conference.contactEmail"
                type="email"
                placeholder="you@institution.edu"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="About the conference"
              description="Optional. Help us understand the scope and audience."
              class="sm:col-span-2"
            >
              <UTextarea
                v-model="conference.description"
                :rows="4"
                placeholder="Brief description of the conference (optional)"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference image"
              description="Optional. Logo, banner, or photo for the conference listing after approval."
              class="sm:col-span-2"
            >
              <UiFileUpload
                :accept="CONFERENCE_IMAGE_ACCEPT"
                :validate-file="validateConferenceImage"
                :hint="CONFERENCE_IMAGE_HINT"
                @on-change="conferenceImageFiles = $event"
                @on-reject="onConferenceImageRejected"
              >
                <UiFileUploadGrid />
              </UiFileUpload>

              <img
                v-if="conferenceImagePreviewUrl"
                :src="conferenceImagePreviewUrl"
                alt="Conference image preview"
                class="border-default mt-4 max-h-48 w-full max-w-md rounded-lg border object-contain"
              />
            </UFormField>
          </div>

          <USeparator />

          <div class="space-y-4">
            <div>
              <h3 class="text-base font-semibold">Posters for participants</h3>
              <p class="text-muted mt-1 text-sm">
                This helps us review your registration. It does not limit what
                you can do in conference management after approval.
              </p>
            </div>

            <UFormField label="Poster submission plan" required>
              <URadioGroup
                v-model="participantPosterChoice"
                :items="participantPosterItems"
                value-key="value"
                label-key="label"
                description-key="description"
                :ui="{ fieldset: 'gap-3', item: 'items-start' }"
              />
            </UFormField>

            <template v-if="participantPosterChoice === 'organizer-import'">
              <div
                class="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
              >
                <div>
                  <h4 class="text-sm font-semibold">
                    Licensing and permission
                  </h4>

                  <p class="text-muted mt-1 text-sm">
                    Uploading posters for others is only allowed when you can
                    share them publicly under the correct license.
                  </p>
                </div>

                <UAlert
                  color="warning"
                  variant="soft"
                  icon="i-lucide-scale"
                  title="You need proper rights to each poster"
                  description="When you upload on behalf of presenters, you must have their permission. You will assign licenses per poster later in the upload process."
                />

                <ul class="text-muted list-disc space-y-2 pl-5 text-sm">
                  <li>
                    You will provide accurate licenses for each poster when you
                    upload them.
                  </li>
                  <li>
                    Authors can request removal at any time, and Posters.science
                    will honor those requests.
                  </li>
                </ul>

                <UFormField required>
                  <UCheckbox
                    v-model="organizerLicensingAcknowledged"
                    label="I confirm the statements above and understand that I am responsible for having the rights to share any participant posters I upload."
                  />
                </UFormField>
              </div>

              <UFormField
                label="Notes"
                description="Optional. Expected number of posters, timeline, or other details."
              >
                <UTextarea
                  v-model="participantPosterNotes"
                  :rows="3"
                  placeholder="Optional notes about participant posters"
                  class="w-full"
                />
              </UFormField>
            </template>
          </div>
        </div>
      </UCard>

      <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <UButton
          to="/conferences/management"
          color="neutral"
          variant="outline"
          label="Cancel"
        />
        <UButton
          type="submit"
          icon="material-symbols:event-available"
          label="Submit request for registration"
          :disabled="!canSubmit"
        />
      </div>
    </form>
  </div>
</template>
