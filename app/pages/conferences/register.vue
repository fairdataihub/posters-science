<script setup lang="ts">
import {
  ALLOWED_POSTER_FILE_LABEL,
  MAX_POSTER_FILE_SIZE_LABEL,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";

definePageMeta({
  middleware: ["auth"],
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Register a conference - Posters.science")}&description=${encodeURIComponent("Register your conference on Posters.science")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Register a conference",
  description:
    "Register your conference on Posters.science and optionally import posters for conference participants.",
  ogTitle: "Register a conference - Posters.science",
  ogDescription:
    "Register your conference on Posters.science and optionally import posters for conference participants.",
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

type ParticipantPosterChoice =
  | "participants-submit"
  | "upload-now"
  | "upload-later";

const participantPosterItems: {
  label: string;
  value: ParticipantPosterChoice;
  description: string;
}[] = [
  {
    label: "Participants will submit their own posters",
    value: "participants-submit",
    description:
      "Register the conference on Posters.science and let attendees upload their work.",
  },
  {
    label: "I have poster files to upload now",
    value: "upload-now",
    description: "Import posters on behalf of conference participants in bulk.",
  },
  {
    label: "I will upload participant posters later",
    value: "upload-later",
    description:
      "Register the conference first and add participant posters after review.",
  },
];

const participantPosterChoice = ref<ParticipantPosterChoice>(
  "participants-submit",
);

const selectedFiles = ref<File[]>([]);
const participantPosterNotes = ref("");

const FILE_HINT = `${ALLOWED_POSTER_FILE_LABEL} up to ${MAX_POSTER_FILE_SIZE_LABEL} per file`;

const validatePosterFile = (file: File) =>
  posterFileRejectionReason({
    name: file.name,
    type: file.type,
    size: file.size,
  });

const onFilesRejected = (rejections: { file: File; reason: string }[]) => {
  const first = rejections[0];
  if (!first) return;

  toast.add({
    title: "File not accepted",
    description: `${first.file.name}: ${first.reason}`,
    color: "error",
  });
};

const showPosterUpload = computed(
  () => participantPosterChoice.value === "upload-now",
);

const canSubmit = computed(() => {
  const conferenceValid =
    conference.name.trim().length > 0 &&
    conference.acronym.trim().length > 0 &&
    conference.contactEmail.trim().length > 0;

  if (!conferenceValid) return false;

  if (participantPosterChoice.value === "upload-now") {
    return (
      selectedFiles.value.length > 0 &&
      selectedFiles.value.every((file) => !validatePosterFile(file))
    );
  }

  return true;
});

function submitRegistration() {
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
      title="Register a conference"
      description="Tell us about your conference and whether you need to import posters for participants. We will review your request and follow up by email."
    >
    </UPageHeader>

    <form class="flex flex-col gap-8" @submit.prevent="submitRegistration">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Conference information</h2>
        </template>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Conference name" required class="sm:col-span-2">
            <UInput
              v-model="conference.name"
              placeholder="e.g. Annual Research Conference"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Acronym" required>
            <UInput
              v-model="conference.acronym"
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
              <UInput v-model="conference.endDate" type="date" class="w-full" />
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
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div>
            <h2 class="text-lg font-semibold">Posters for participants</h2>
            <p class="text-muted mt-1 text-sm">
              Do you have poster files to submit on behalf of conference
              participants, or will attendees submit their own?
            </p>
          </div>
        </template>

        <div class="space-y-6">
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

          <template v-if="showPosterUpload">
            <UFormField
              label="Participant poster files"
              description="Upload poster PDFs or images for conference participants. You can add metadata for each poster after import."
              required
            >
              <UiFileUpload
                multiple
                :accept="POSTER_FILE_ACCEPT"
                :validate-file="validatePosterFile"
                :hint="FILE_HINT"
                @on-change="selectedFiles = $event"
                @on-reject="onFilesRejected"
              >
                <UiFileUploadGrid />
              </UiFileUpload>
            </UFormField>

            <p v-if="selectedFiles.length" class="text-muted text-sm">
              {{ selectedFiles.length }} file{{
                selectedFiles.length === 1 ? "" : "s"
              }}
              selected.
            </p>
          </template>

          <UFormField
            v-if="participantPosterChoice !== 'participants-submit'"
            label="Notes"
            description="Optional. Share anything we should know about participant posters or timing."
          >
            <UTextarea
              v-model="participantPosterNotes"
              :rows="3"
              placeholder="Optional notes about participant posters or timing"
              class="w-full"
            />
          </UFormField>
        </div>
      </UCard>

      <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <UButton
          to="/conferences"
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
