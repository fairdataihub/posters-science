<script setup lang="ts">
import identifierTypes from "@/assets/data/identifier-types.json";
import {
  conferenceDateRangeFieldErrors,
  conferenceYearFromStartDate,
} from "#shared/types/bulkImportConference";

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

type ConferenceFormat = "In-person" | "Online" | "Hybrid";

const CONFERENCE_FORMAT_OPTIONS: { label: string; value: ConferenceFormat }[] =
  [
    { label: "In-person", value: "In-person" },
    { label: "Online", value: "Online" },
    { label: "Hybrid", value: "Hybrid" },
  ];

const conferenceIdentifierTypeOptions = identifierTypes.map((entry) => ({
  label: entry.label,
  value: entry.value,
}));

const conference = reactive({
  conferenceName: "",
  conferenceAcronym: "",
  conferenceYear: undefined as number | undefined,
  conferenceStartDate: "",
  conferenceEndDate: "",
  conferenceFormat: undefined as ConferenceFormat | undefined,
  conferenceLocation: "",
  conferenceUri: "",
  conferenceIdentifier: "",
  conferenceIdentifierType: "",
  conferenceSchemaUri: "",
  conferenceSeries: "",
  conferenceText: "",
  submissionDeadline: "",
});

type ConferenceOrganizer = {
  name: string;
  email: string;
};

const organizers = ref<ConferenceOrganizer[]>([{ name: "", email: "" }]);

const conferenceCategories = ref<string[]>([]);
const categoryInput = ref("");

const requiresConferenceLocation = computed(
  () =>
    conference.conferenceFormat === "In-person" ||
    conference.conferenceFormat === "Hybrid",
);

const showConferenceLocation = requiresConferenceLocation;

const showConferenceIdentifierDetails = computed(
  () => conference.conferenceIdentifier.trim().length > 0,
);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function addCategory() {
  const value = categoryInput.value.trim();
  if (!value) return;

  const exists = conferenceCategories.value.some(
    (category) => category.toLowerCase() === value.toLowerCase(),
  );
  if (exists) {
    categoryInput.value = "";
    return;
  }

  conferenceCategories.value.push(value);
  categoryInput.value = "";
}

function removeCategory(index: number) {
  conferenceCategories.value.splice(index, 1);
}

function addOrganizer() {
  organizers.value.push({ name: "", email: "" });
}

function removeOrganizer(index: number) {
  if (organizers.value.length <= 1) return;
  organizers.value.splice(index, 1);
}

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

watch(participantPosterChoice, (choice) => {
  if (choice !== "organizer-import") {
    organizerLicensingAcknowledged.value = false;
  }
});

watch(
  () => conference.conferenceStartDate,
  (start) => {
    conference.conferenceYear = conferenceYearFromStartDate(start);
  },
);

watch(
  () => conference.conferenceFormat,
  (format) => {
    if (format === "Online") {
      conference.conferenceLocation = "";
    }
  },
);

watch(
  () => conference.conferenceIdentifier,
  (identifier) => {
    if (!identifier.trim()) {
      conference.conferenceIdentifierType = "";
      conference.conferenceSchemaUri = "";
    }
  },
);

function conferenceFieldsValid() {
  if (!conference.conferenceName.trim()) return false;
  if (!conference.conferenceStartDate) return false;
  if (!conference.conferenceEndDate) return false;
  const rangeErrors = conferenceDateRangeFieldErrors(
    conference.conferenceStartDate,
    conference.conferenceEndDate,
    { requireEnd: true },
  );
  if (rangeErrors.start || rangeErrors.end) return false;
  if (!conference.conferenceFormat) return false;

  if (
    requiresConferenceLocation.value &&
    !conference.conferenceLocation.trim()
  ) {
    return false;
  }

  if (!conference.conferenceText.trim()) return false;

  if (conference.conferenceIdentifier.trim()) {
    if (!conference.conferenceIdentifierType.trim()) return false;
  }

  if (
    organizers.value.length === 0 ||
    !organizers.value.every((organizer) => isValidEmail(organizer.email))
  ) {
    return false;
  }

  if (
    participantPosterChoice.value === "organizer-import" &&
    !organizerLicensingAcknowledged.value
  ) {
    return false;
  }

  return true;
}

const canSubmit = computed(() => conferenceFieldsValid());

const submitAttempted = ref(false);

function fieldError(condition: boolean, message: string) {
  return submitAttempted.value && condition ? message : undefined;
}

const conferenceNameError = computed(() =>
  fieldError(!conference.conferenceName.trim(), "Conference name is required"),
);

const conferenceStartDateError = computed(() => {
  if (!submitAttempted.value) return undefined;
  return conferenceDateRangeFieldErrors(
    conference.conferenceStartDate,
    conference.conferenceEndDate,
    { requireEnd: true },
  ).start;
});

const conferenceEndDateError = computed(() => {
  if (!submitAttempted.value) return undefined;
  return conferenceDateRangeFieldErrors(
    conference.conferenceStartDate,
    conference.conferenceEndDate,
    { requireEnd: true },
  ).end;
});

const conferenceFormatError = computed(() =>
  fieldError(!conference.conferenceFormat, "Conference format is required"),
);

const conferenceLocationError = computed(() =>
  fieldError(
    requiresConferenceLocation.value && !conference.conferenceLocation.trim(),
    "Location is required for in-person and hybrid conferences",
  ),
);

const conferenceTextError = computed(() =>
  fieldError(
    !conference.conferenceText.trim(),
    "Conference description is required",
  ),
);

const conferenceIdentifierTypeError = computed(() =>
  fieldError(
    conference.conferenceIdentifier.trim().length > 0 &&
      !conference.conferenceIdentifierType.trim(),
    "Identifier type is required when an identifier is provided",
  ),
);

function organizerEmailError(index: number) {
  const organizer = organizers.value[index];
  if (!organizer) return undefined;

  return fieldError(
    !isValidEmail(organizer.email),
    "A valid organizer email is required",
  );
}

function submitRegistration() {
  submitAttempted.value = true;

  if (!conferenceFieldsValid()) {
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
            <UFormField
              label="Conference name"
              name="conferenceName"
              required
              class="sm:col-span-2"
              :error="conferenceNameError"
            >
              <UInput
                v-model="conference.conferenceName"
                name="conferenceName"
                required
                placeholder="e.g. Annual Research Conference"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Conference acronym" name="conferenceAcronym">
              <UInput
                v-model="conference.conferenceAcronym"
                name="conferenceAcronym"
                placeholder="e.g. EARC"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference format"
              name="conferenceFormat"
              required
              :error="conferenceFormatError"
            >
              <USelect
                v-model="conference.conferenceFormat"
                name="conferenceFormat"
                class="w-full"
                :items="CONFERENCE_FORMAT_OPTIONS"
                placeholder="Select format"
              />
            </UFormField>

            <UFormField label="Submission deadline" name="submissionDeadline">
              <UInput
                v-model="conference.submissionDeadline"
                name="submissionDeadline"
                type="date"
                class="w-full"
              />
            </UFormField>

            <UFormField
              v-if="showConferenceLocation"
              label="Conference location"
              name="conferenceLocation"
              required
              class="sm:col-span-2"
              :error="conferenceLocationError"
            >
              <UInput
                v-model="conference.conferenceLocation"
                name="conferenceLocation"
                placeholder="e.g. Seattle, WA, USA"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference start date"
              name="conferenceStartDate"
              required
              :error="conferenceStartDateError"
            >
              <UInput
                v-model="conference.conferenceStartDate"
                name="conferenceStartDate"
                type="date"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference end date"
              name="conferenceEndDate"
              required
              :error="conferenceEndDateError"
            >
              <UInput
                v-model="conference.conferenceEndDate"
                name="conferenceEndDate"
                type="date"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference website"
              name="conferenceUri"
              class="sm:col-span-2"
            >
              <UInput
                v-model="conference.conferenceUri"
                name="conferenceUri"
                type="url"
                placeholder="https://"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference identifier"
              name="conferenceIdentifier"
              class="sm:col-span-2"
            >
              <UInput
                v-model="conference.conferenceIdentifier"
                name="conferenceIdentifier"
                placeholder="Optional external identifier"
                class="w-full"
              />
            </UFormField>

            <template v-if="showConferenceIdentifierDetails">
              <UFormField
                label="Conference identifier type"
                name="conferenceIdentifierType"
                required
                :error="conferenceIdentifierTypeError"
              >
                <USelectMenu
                  v-model="conference.conferenceIdentifierType"
                  :items="conferenceIdentifierTypeOptions"
                  value-key="value"
                  searchable
                  placeholder="Select identifier type"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Conference schema URI"
                name="conferenceSchemaUri"
              >
                <UInput
                  v-model="conference.conferenceSchemaUri"
                  name="conferenceSchemaUri"
                  type="url"
                  placeholder="https://"
                  class="w-full"
                />
              </UFormField>
            </template>

            <UFormField
              label="Conference series"
              name="conferenceSeries"
              class="sm:col-span-2"
            >
              <UInput
                v-model="conference.conferenceSeries"
                name="conferenceSeries"
                placeholder="Optional series name"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference description"
              name="conferenceText"
              required
              class="sm:col-span-2"
              :error="conferenceTextError"
            >
              <UTextarea
                v-model="conference.conferenceText"
                name="conferenceText"
                :rows="4"
                placeholder="Describe the conference scope and audience"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Conference categories"
              name="conferenceCategories"
              description="Optional. Add topics or disciplines for discovery."
              class="sm:col-span-2"
            >
              <div class="flex flex-wrap gap-2">
                <UInput
                  v-model="categoryInput"
                  placeholder="Add a category"
                  class="min-w-[12rem] flex-1"
                  @keydown.enter.prevent="addCategory"
                />
                <UButton
                  type="button"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-plus"
                  label="Add"
                  @click="addCategory"
                />
              </div>

              <div
                v-if="conferenceCategories.length > 0"
                class="mt-3 flex flex-wrap gap-2"
              >
                <UBadge
                  v-for="(category, index) in conferenceCategories"
                  :key="category"
                  color="neutral"
                  variant="subtle"
                  class="gap-1"
                >
                  {{ category }}
                  <button
                    type="button"
                    class="hover:text-error rounded p-0.5"
                    aria-label="Remove category"
                    @click="removeCategory(index)"
                  >
                    <UIcon name="i-lucide-x" class="size-3.5" />
                  </button>
                </UBadge>
              </div>
            </UFormField>
          </div>

          <USeparator />

          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="text-base font-semibold">Conference organizers</h3>
              </div>
              <UButton
                type="button"
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-user-plus"
                label="Add organizer"
                @click="addOrganizer"
              />
            </div>

            <div
              v-for="(organizer, index) in organizers"
              :key="index"
              class="grid gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-2 dark:border-gray-800"
            >
              <UFormField
                :label="
                  index === 0 ? 'Organizer name' : `Organizer ${index + 1} name`
                "
                :name="`organizers.${index}.name`"
              >
                <UInput
                  v-model="organizer.name"
                  placeholder="Optional"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                :label="
                  index === 0
                    ? 'Organizer email'
                    : `Organizer ${index + 1} email`
                "
                :name="`organizers.${index}.email`"
                required
                :error="organizerEmailError(index)"
              >
                <div class="flex gap-2">
                  <UInput
                    v-model="organizer.email"
                    type="email"
                    required
                    placeholder="you@institution.edu"
                    class="w-full min-w-0 flex-1"
                  />
                  <UButton
                    v-if="organizers.length > 1"
                    type="button"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    aria-label="Remove organizer"
                    @click="removeOrganizer(index)"
                  />
                </div>
              </UFormField>
            </div>
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
