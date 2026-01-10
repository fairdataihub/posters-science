<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import type * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { faker } from "@faker-js/faker";
import type { DateSchema } from "@/utils/poster_schema";
import {
  schema,
  ISO_LANGUAGE_OPTIONS,
  TITLE_TYPE_OPTIONS,
  DATE_TYPE_OPTIONS,
} from "@/utils/poster_schema";
import type { CalendarDate } from "@internationalized/date";
import {
  DateFormatter,
  getLocalTimeZone,
  parseDate,
} from "@internationalized/date";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const toast = useToast();

const { id } = route.params as { id: string };

useSeoMeta({
  title: "Review poster metadata",
  description: "Review the metadata for your poster submission",
});

const df = new DateFormatter("en-US", {
  dateStyle: "medium",
  timeZone: getLocalTimeZone(),
});

type Schema = z.output<typeof schema>;

const loading = ref(false);

// Initial state
const state = reactive<Schema>({
  title: faker.lorem.sentence(),
  description: faker.lorem.paragraph(),
  doi: "",
  prefix: "",
  suffix: "",
  identifiers: [
    {
      identifier: "",
      identifierType: "DOI",
    },
  ],
  alternateIdentifiers: [],

  creators: [
    {
      givenName: "",
      familyName: "",
      nameType: "Personal",
      nameIdentifiers: [],
      affiliation: [],
    },
  ],

  titles: [
    {
      title: faker.lorem.sentence(),
    },
  ],

  publisher: {
    name: "",
    publisherIdentifier: "",
    publisherIdentifierScheme: "",
    schemeURI: "",
  },

  publicationYear: new Date().getFullYear(),

  subjects: [
    {
      subject: "",
      schemeUri: "",
      valueUri: "",
      subjectScheme: "",
      classificationCode: "",
    },
  ],

  dates: [
    {
      start: "",
      end: "",
      dateType: "Presented",
      dateInformation: "",
    },
  ],

  language: "en",
  types: {
    resourceType: "Poster",
    resourceTypeGeneral: "Other",
  },

  relatedIdentifiers: [],

  sizes: [],
  formats: ["PDF"],
  version: "1.0",

  rightsList: [
    {
      rights: "Creative Commons Attribution 4.0 International",
      rightsUri: "https://creativecommons.org/licenses/by/4.0/",
      rightsIdentifier: "CC-BY-4.0",
      rightsIdentifierScheme: "SPDX",
      schemeUri: "https://spdx.org/licenses/",
    },
  ],

  descriptions: [
    {
      description: faker.lorem.paragraph(),
      descriptionType: "Abstract",
    },
  ],

  fundingReferences: [
    {
      funderName: "",
      funderIdentifier: "",
      funderIdentifierType: undefined,
      schemeUri: "",
      awardNumber: "",
      awardUri: "",
      awardTitle: "",
    },
  ],

  ethicsApprovals: [],

  conference: {
    conferenceName: "",
    conferenceLocation: "",
    conferenceUri: "",
    conferenceIdentifier: "",
    conferenceIdentifierType: "",
    conferenceSchemaUri: "",
    conferenceStartDate: "",
    conferenceEndDate: "",
    conferenceAcronym: "",
    conferenceSeries: "",
  },

  tableCaption: [],
  imageCaption: [],

  domain: "",
});

const { data, error } = await useFetch(`/api/poster/${id}`);

if (data.value) {
  // Assume the API returns an object compatible with Schema (or a subset)
  Object.assign(state, data.value);
}

if (error.value) {
  console.error(error.value);
}

// Convert between CalendarDate and string (YYYY-MM-DD)
const toW3CDate = (cd: CalendarDate) => {
  const jsDate = cd.toDate(getLocalTimeZone());

  // date only form (YYYY-MM-DD)
  return jsDate.toISOString().slice(0, 10);
};

// Used to convert string date fields to CalendarDate for Nuxt Calendar component
function useCalendarStringField(
  getter: () => string,
  setter: (value: string) => void,
) {
  return computed<CalendarDate | null>({
    get() {
      const raw = getter();

      return raw ? parseDate(raw) : null; // null if empty
    },
    set(newValue) {
      setter(newValue ? toW3CDate(newValue) : "");
    },
  });
}

// Used to handle conference start/end dates in calendar components
// as they are single string fields in the schema
const conferenceStartDateCalendar = useCalendarStringField(
  () => state.conference.conferenceStartDate,
  (value) => {
    state.conference.conferenceStartDate = value;
  },
);

const conferenceEndDateCalendar = useCalendarStringField(
  () => state.conference.conferenceEndDate,
  (value) => {
    state.conference.conferenceEndDate = value;
  },
);

const dateCalendars = computed(() =>
  state.dates.map((row: any) => ({
    get startCalendar(): CalendarDate | null {
      return row.start ? parseDate(row.start) : null;
    },
    set startCalendar(val: CalendarDate | null) {
      row.start = val ? toW3CDate(val) : "";
    },

    get endCalendar(): CalendarDate | null {
      return row.end ? parseDate(row.end) : null;
    },
    set endCalendar(val: CalendarDate | null) {
      row.end = val ? toW3CDate(val) : "";
    },
  })),
);

type DateCalendar = {
  startCalendar: CalendarDate | null;
  endCalendar: CalendarDate | null;
};

// Helper to get a DateCalendar object for a given index in the dates array
const getDateCalendar = (index: number): DateCalendar => {
  return (
    dateCalendars.value[index] ?? {
      startCalendar: null,
      endCalendar: null,
    }
  );
};

type UiDate = z.infer<typeof DateSchema>; // { start, end, dateType, dateInformation }

const buildApiDates = (uiDates: UiDate[]) => {
  return uiDates.map((d) => {
    const startStr = d.start;
    const endStr = d.end || null;

    const date =
      endStr && endStr !== startStr
        ? `${startStr}/${endStr}` // range: 2025-10-15/2025-10-17
        : startStr; // single: 2025-10-15

    return {
      date,
      dateType: d.dateType,
      dateInformation: d.dateInformation || undefined,
    };
  });
};

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;

  try {
    const formData = event.data;

    console.log("Raw form data from UForm (Schema)", formData);

    // 2) Transform dates to match JSON schema
    const apiDates = buildApiDates(formData.dates);

    // 3) Create payload
    const payload = {
      ...formData,
      dates: apiDates,
    };

    console.log("Submitting poster metadata (API payload)", payload);
    // 4) Submit to API
    // TODO: call your API to persist the metadata
    // await $fetch(`/api/poster/${id}`, {
    //   method: "PUT",
    //   body: payload,
    // });

    console.log("Submitting poster metadata (API payload)", payload);

    toast.add({
      title: "Success",
      description: "Poster metadata has been submitted.",
      color: "success",
    });
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem saving your poster metadata.",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}

// Helper functions to manage dynamic array fields
function pushRow<T extends Record<string, any>>(
  arr: T[],
  row: T,
  opts?: {
    requiredFields?: (keyof T)[];
    sectionLabel?: string;
  },
) {
  // If it's the first item, just add it.
  if (arr.length === 0) {
    arr.push(row);

    return true;
  }

  const last = arr[arr.length - 1];

  if (!last) {
    toast.add({
      title: "Please complete the current item",
      description: "Fill out the current fields before adding a new one.",
      color: "warning",
    });

    return false;
  }

  // If no requiredFields specified, push
  if (!opts?.requiredFields || opts.requiredFields.length === 0) {
    arr.push(row);

    return true;
  }

  // Check required fields on the last row
  const missing = opts.requiredFields.filter((field) => {
    const value = last[field];

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    return value === "" || value === null || value === undefined;
  });

  if (missing.length > 0) {
    const label = opts.sectionLabel || "item";

    toast.add({
      title: `Please complete the current ${label}`,
      description:
        missing.length === 1
          ? `Fill out the "${String(missing[0])}" field before adding a new ${label}.`
          : `Fill out these fields before adding a new ${label}: ${missing
              .map(String)
              .join(", ")}.`,
      color: "warning",
    });

    return false;
  }

  arr.push(row);

  return true;
}

function removeRow<T>(arr: T[], index: number) {
  arr.splice(index, 1);
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 pb-10">
    <UPageHeader
      title="Edit Poster Metadata"
      description="Review and edit the extracted metadata for your poster submission"
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Share a Poster', to: '/share/new' },
            { label: 'Edit Poster Metadata' },
          ]"
        />
      </template>
    </UPageHeader>

    <UForm
      :schema="schema"
      :state="state"
      class="space-y-6"
      :disabled="loading"
      size="xl"
      @submit="onSubmit"
    >
      <!-- GENERAL INFORMATION -->
      <CardCollapsibleContent title="General Information" :collapse="false">
        <div class="space-y-4">
          <UFormField label="Title" required name="title" size="xl">
            <UInput v-model="state.title" size="xl" />
          </UFormField>

          <UFormField label="Description" required name="description">
            <UTextarea v-model="state.description" class="w-full" size="xl" />
          </UFormField>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Primary Language" name="language" required>
              <USelect
                v-model="state.language"
                :items="ISO_LANGUAGE_OPTIONS"
                placeholder="Select a language"
                class="w-full sm:w-80"
              />
            </UFormField>

            <UFormField label="Domain / Field of Study" name="domain" required>
              <UInput
                v-model="state.domain"
                placeholder="e.g., Machine Learning, Clinical Medicine"
              />
            </UFormField>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- IDENTIFIERS & DOI -->
      <CardCollapsibleContent title="Identifiers & DOI" :collapse="false">
        <div class="space-y-8">
          <div class="grid gap-4 md:grid-cols-3">
            <UFormField label="DOI" name="doi">
              <UInput
                v-model="state.doi"
                placeholder="10.5281/zenodo.1234567"
              />
            </UFormField>

            <UFormField label="DOI Prefix" name="prefix">
              <UInput v-model="state.prefix" placeholder="10.5281" />
            </UFormField>

            <UFormField label="DOI Suffix" name="suffix">
              <UInput v-model="state.suffix" placeholder="zenodo.1234567" />
            </UFormField>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <UFormField
                name="identifiers"
                label="Identifiers (DOI, URL, ARK, etc.)"
                required
              />

              <UButton
                size="sm"
                icon="i-lucide-plus"
                variant="ghost"
                @click="
                  pushRow(
                    state.identifiers,
                    {
                      identifier: '',
                      identifierType: '',
                    },
                    {
                      requiredFields: ['identifier', 'identifierType'],
                      sectionLabel: 'Identifier',
                    },
                  )
                "
              >
                Add identifier
              </UButton>
            </div>

            <div class="space-y-2">
              <div
                v-for="(identifier, index) in state.identifiers"
                :key="index"
                class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[2fr,1fr,auto]"
              >
                <UFormField
                  :name="`identifiers.${index}.identifier`"
                  label="Identifier"
                  required
                >
                  <UInput
                    v-model="identifier.identifier"
                    placeholder="e.g., 10.5281/zenodo.1234567"
                  />
                </UFormField>

                <UFormField
                  :name="`identifiers.${index}.identifierType`"
                  label="Type"
                  required
                >
                  <UInput
                    v-model="identifier.identifierType"
                    placeholder="e.g., DOI, URL, ARK"
                  />
                </UFormField>

                <div class="flex items-end justify-end">
                  <UButton
                    v-if="state.identifiers.length > 1"
                    size="sm"
                    trailing-icon="i-lucide-trash-2"
                    color="error"
                    variant="solid"
                    @click="removeRow(state.identifiers, index)"
                  >
                    Delete identifier</UButton
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Alternate identifiers -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium">Alternate Identifiers</h3>

              <UButton
                size="xs"
                icon="i-lucide-plus"
                variant="ghost"
                @click="
                  pushRow(
                    (state.alternateIdentifiers ||= []),
                    {
                      alternateIdentifier: '',
                      alternateIdentifierType: '',
                    },
                    {
                      requiredFields: [
                        'alternateIdentifier',
                        'alternateIdentifierType',
                      ],
                      sectionLabel: 'Alternate identifier',
                    },
                  )
                "
              >
                Add alternate identifier
              </UButton>
            </div>

            <div class="space-y-3">
              <div
                v-for="(altId, index) in state.alternateIdentifiers"
                :key="index"
                class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[2fr,1fr,auto]"
              >
                <UFormField
                  :name="`alternateIdentifiers.${index}.alternateIdentifier`"
                  label="Alternate Identifier"
                  required
                >
                  <UInput
                    v-model="altId.alternateIdentifier"
                    placeholder="e.g., PS-2025-001234"
                  />
                </UFormField>

                <UFormField
                  :name="`alternateIdentifiers.${index}.alternateIdentifierType`"
                  label="Type"
                  required
                >
                  <UInput
                    v-model="altId.alternateIdentifierType"
                    placeholder="e.g., psID"
                  />
                </UFormField>

                <div class="flex items-end justify-end">
                  <UButton
                    size="sm"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="solid"
                    @click="removeRow(state.alternateIdentifiers!, index)"
                    >Delete alternate identifier</UButton
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- AUTHORS / CREATORS -->
      <CardCollapsibleContent title="Authors / Creators" :collapse="false">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-sm">
              Add all authors in order of appearance on the poster.
            </p>

            <div class="flex justify-end">
              <UButton
                size="xs"
                icon="i-lucide-plus"
                variant="ghost"
                @click="
                  pushRow(
                    state.creators,
                    {
                      givenName: '',
                      familyName: '',
                      nameType: 'Personal',
                      nameIdentifiers: [],
                      affiliation: [],
                    },
                    {
                      requiredFields: ['givenName', 'familyName'],
                      sectionLabel: 'Creator',
                    },
                  )
                "
              >
                Add author
              </UButton>
            </div>
          </div>

          <div class="space-y-3">
            <div
              v-for="(creator, cIndex) in state.creators"
              :key="cIndex"
              class="space-y-8 rounded-xl border border-gray-200 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <UFormField
                  :name="`creators.${cIndex}.familyName`"
                  label="Authors Given Name"
                  required
                  class="flex-1"
                >
                  <UInput
                    v-model="creator.familyName"
                    placeholder="e.g., Garcia, Sofia"
                  />
                </UFormField>

                <UFormField
                  :name="`creators.${cIndex}.givenName`"
                  label="Authors Family Name"
                  required
                  class="flex-1"
                >
                  <UInput
                    v-model="creator.givenName"
                    placeholder="e.g., Garcia, Sofia"
                  />
                </UFormField>

                <UFormField
                  :name="`creators.${cIndex}.nameType`"
                  label="Name type"
                  class="w-40"
                >
                  <USelect
                    v-model="creator.nameType"
                    class="w-full"
                    :items="[
                      { label: 'Personal', value: 'Personal' },
                      { label: 'Organizational', value: 'Organizational' },
                    ]"
                  />
                </UFormField>

                <UButton
                  v-if="state.creators.length > 1"
                  class="mt-7"
                  size="xs"
                  trailing-icon="i-lucide-trash-2"
                  color="error"
                  variant="solid"
                  @click="removeRow(state.creators, cIndex)"
                  >Delete author</UButton
                >
              </div>

              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-medium text-gray-500 uppercase">
                    Name Identifiers (e.g., ORCID, ROR)
                  </h4>

                  <UButton
                    size="xs"
                    icon="i-lucide-plus"
                    variant="ghost"
                    @click="
                      pushRow(
                        (creator.nameIdentifiers ||= []),
                        {
                          nameIdentifier: '',
                          nameIdentifierScheme: '',
                          schemeURI: '',
                        },
                        {
                          requiredFields: ['nameIdentifier'],
                          sectionLabel: 'Name identifier',
                        },
                      )
                    "
                  >
                    Add
                  </UButton>
                </div>

                <div class="space-y-1">
                  <div
                    v-for="(ni, niIndex) in creator.nameIdentifiers"
                    :key="niIndex"
                    class="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-[2fr,1fr,1fr,auto]"
                  >
                    <UFormField
                      :name="`creators.${cIndex}.nameIdentifiers.${niIndex}.nameIdentifier`"
                      label="Identifier"
                      required
                    >
                      <UInput
                        v-model="ni.nameIdentifier"
                        placeholder="https://orcid.org/0000-0000-0000-0000"
                      />
                    </UFormField>

                    <UFormField
                      :name="`creators.${cIndex}.nameIdentifiers.${niIndex}.nameIdentifierScheme`"
                      label="Scheme"
                    >
                      <UInput
                        v-model="ni.nameIdentifierScheme"
                        placeholder="ORCID, ROR, ISNI"
                      />
                    </UFormField>

                    <UFormField
                      :name="`creators.${cIndex}.nameIdentifiers.${niIndex}.schemeURI`"
                      label="Scheme URI"
                    >
                      <UInput
                        v-model="ni.schemeURI"
                        placeholder="https://orcid.org"
                      />
                    </UFormField>

                    <div class="flex items-end justify-end">
                      <UButton
                        size="sm"
                        trailing-icon="i-lucide-trash-2"
                        color="error"
                        variant="solid"
                        @click="removeRow(creator.nameIdentifiers!, niIndex)"
                      >
                        Delete Identifier
                      </UButton>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Affiliations -->
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-medium text-gray-500 uppercase">
                    Affiliations
                  </h4>

                  <UButton
                    size="xs"
                    icon="i-lucide-plus"
                    variant="ghost"
                    @click="
                      pushRow(
                        (creator.affiliation ||= []),
                        {
                          name: '',
                          affiliationIdentifier: '',
                          affiliationIdentifierScheme: '',
                          schemeURI: '',
                        },
                        {
                          requiredFields: ['name'],
                          sectionLabel: 'Creator affiliation',
                        },
                      )
                    "
                  >
                    Add
                  </UButton>
                </div>

                <div class="space-y-2">
                  <div
                    v-for="(aff, aIndex) in creator.affiliation"
                    :key="aIndex"
                    class="grid gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-[2fr,1fr,1fr,auto]"
                  >
                    <UFormField
                      :name="`creators.${cIndex}.affiliation.${aIndex}.name`"
                      label="Institution name"
                      required
                    >
                      <UInput
                        v-model="aff.name"
                        placeholder="University of California, Los Angeles"
                      />
                    </UFormField>

                    <UFormField
                      :name="`creators.${cIndex}.affiliation.${aIndex}.affiliationIdentifier`"
                      :required="
                        aff.affiliationIdentifierScheme !== '' ||
                        aff.affiliationIdentifier !== ''
                      "
                      label="Affiliation ID"
                    >
                      <UInput
                        v-model="aff.affiliationIdentifier"
                        placeholder="https://ror.org/000000000"
                      />
                    </UFormField>

                    <UFormField
                      :name="`creators.${cIndex}.affiliation.${aIndex}.affiliationIdentifierScheme`"
                      label="Scheme"
                      :required="
                        aff.affiliationIdentifierScheme !== '' ||
                        aff.affiliationIdentifier !== ''
                      "
                    >
                      <UInput
                        v-model="aff.affiliationIdentifierScheme"
                        placeholder="ROR, ISNI"
                      />
                    </UFormField>

                    <div class="flex items-end justify-end">
                      <UButton
                        size="sm"
                        trailing-icon="i-lucide-trash-2"
                        color="error"
                        variant="solid"
                        @click="removeRow(creator.affiliation!, aIndex)"
                        >Delete Affiliation</UButton
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- TITLES -->
      <CardCollapsibleContent title="Alternate Titles" :collapse="false">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm">
              Include any alternative, translated, or subtitle variants.
            </p>

            <div class="flex justify-end">
              <UButton
                size="xs"
                icon="i-lucide-plus"
                variant="ghost"
                @click="
                  pushRow(
                    state.titles,
                    { title: '', titleType: undefined },
                    {
                      requiredFields: ['title'],
                      sectionLabel: 'Title',
                    },
                  )
                "
              >
                Add title
              </UButton>
            </div>
          </div>

          <div class="space-y-3">
            <div
              v-for="(t, tIndex) in state.titles"
              :key="tIndex"
              class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[2fr,1fr,auto]"
            >
              <UFormField
                :name="`titles.${tIndex}.title`"
                label="Title"
                required
              >
                <UInput v-model="t.title" placeholder="Enter title" />
              </UFormField>

              <UFormField :name="`titles.${tIndex}.titleType`" label="Type">
                <USelect
                  v-model="t.titleType"
                  class="w-full"
                  :items="TITLE_TYPE_OPTIONS"
                  placeholder="Select type"
                />
              </UFormField>

              <div class="flex items-end justify-end">
                <UButton
                  v-if="state.titles.length > 1"
                  size="sm"
                  trailing-icon="i-lucide-trash-2"
                  color="error"
                  variant="solid"
                  @click="removeRow(state.titles, tIndex)"
                  >Delete</UButton
                >
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- PUBLISHER & PUBLICATION -->
      <CardCollapsibleContent title="Publisher & Publication" :collapse="false">
        <div class="space-y-4">
          <div class="grid gap-4 md:grid-cols-[2fr,1fr]">
            <UFormField name="publisher.name" label="Publisher name" required>
              <UInput
                v-model="state.publisher.name"
                placeholder="e.g., Zenodo, Institutional Repository"
              />
            </UFormField>

            <UFormField
              name="publicationYear"
              label="Publication year"
              required
            >
              <USelect
                v-model="state.publicationYear"
                class="w-full sm:w-40"
                :items="[
                  ...Array.from(
                    { length: new Date().getFullYear() - 1900 },
                    (_, i) => new Date().getFullYear() - i,
                  )
                    .map((year) => ({
                      label: year.toString(),
                      value: year,
                    }))
                    .reverse(),
                ]"
                placeholder="Select year"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <UFormField
              name="publisher.publisherIdentifier"
              label="Publisher identifier"
              :required="
                state.publisher.publisherIdentifierScheme !== '' ||
                state.publisher.publisherIdentifier !== ''
              "
            >
              <UInput
                v-model="state.publisher.publisherIdentifier"
                placeholder="https://ror.org/000000000"
              />
            </UFormField>

            <UFormField
              name="publisher.publisherIdentifierScheme"
              label="Identifier scheme"
              :required="
                state.publisher.publisherIdentifierScheme !== '' ||
                state.publisher.publisherIdentifier !== ''
              "
            >
              <UInput
                v-model="state.publisher.publisherIdentifierScheme"
                placeholder="ROR, ISNI, re3data"
              />
            </UFormField>

            <UFormField name="publisher.schemeURI" label="Scheme URI">
              <UInput
                v-model="state.publisher.schemeURI"
                placeholder="https://ror.org"
              />
            </UFormField>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- SUBJECTS -->
      <CardCollapsibleContent title="Subjects / Keywords" :collapse="false">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm">
              Add keywords or controlled vocabulary terms describing the poster.
            </p>

            <UButton
              size="xs"
              icon="i-lucide-plus"
              variant="ghost"
              @click="
                pushRow(
                  state.subjects,
                  {
                    subject: '',
                    schemeUri: '',
                    valueUri: '',
                    subjectScheme: '',
                    classificationCode: '',
                  },
                  {
                    requiredFields: ['subject'],
                    sectionLabel: 'Subject',
                  },
                )
              "
            >
              Add subject
            </UButton>
          </div>

          <div class="space-y-3">
            <div
              v-for="(subj, sIndex) in state.subjects"
              :key="sIndex"
              class="space-y-3 rounded-lg border border-gray-200 p-3"
            >
              <UFormField
                :name="`subjects.${sIndex}.subject`"
                label="Subject / keyword"
                required
              >
                <UInput
                  v-model="subj.subject"
                  placeholder="e.g., Machine Learning, Type 2 Diabetes"
                />
              </UFormField>

              <div class="grid gap-3 md:grid-cols-3">
                <UFormField
                  :name="`subjects.${sIndex}.subjectScheme`"
                  label="Subject scheme"
                >
                  <UInput
                    v-model="subj.subjectScheme"
                    placeholder="e.g., MeSH, LCSH"
                  />
                </UFormField>

                <UFormField
                  :name="`subjects.${sIndex}.schemeUri`"
                  label="Scheme URI"
                >
                  <UInput
                    v-model="subj.schemeUri"
                    placeholder="https://www.nlm.nih.gov/mesh/"
                  />
                </UFormField>

                <UFormField
                  :name="`subjects.${sIndex}.classificationCode`"
                  label="Classification code"
                >
                  <UInput v-model="subj.classificationCode" />
                </UFormField>
              </div>

              <UFormField
                :name="`subjects.${sIndex}.valueUri`"
                label="Value URI"
              >
                <UInput
                  v-model="subj.valueUri"
                  placeholder="URI for the specific subject term"
                />
              </UFormField>

              <div class="flex items-end justify-end">
                <UButton
                  v-if="state.subjects.length > 1"
                  size="sm"
                  trailing-icon="i-lucide-trash-2"
                  color="error"
                  variant="solid"
                  @click="removeRow(state.subjects, sIndex)"
                  >Delete</UButton
                >
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- DATES -->
      <CardCollapsibleContent title="Important Dates" :collapse="false">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm">
              Include key dates such as created, presented, and available.
            </p>

            <UButton
              size="xs"
              icon="i-lucide-plus"
              variant="ghost"
              @click="
                pushRow(
                  state.dates,
                  {
                    start: '',
                    end: '',
                    dateType: 'Other',
                    dateInformation: '',
                  },
                  {
                    requiredFields: ['start', 'dateType'],
                    sectionLabel: 'Date',
                  },
                )
              "
            >
              Add date
            </UButton>
          </div>

          <div class="space-y-3">
            <div
              v-for="(d, dIndex) in state.dates"
              :key="dIndex"
              class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[1.5fr,1.5fr,auto]"
            >
              <div class="flex justify-between">
                <UFormField
                  class="w-full"
                  :name="`dates.${dIndex}.start`"
                  label="Start Date"
                  required
                >
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="subtle"
                      icon="i-lucide-calendar"
                    >
                      <template v-if="getDateCalendar(dIndex).startCalendar">
                        {{
                          df.format(
                            getDateCalendar(dIndex).startCalendar!.toDate(
                              getLocalTimeZone(),
                            ),
                          )
                        }}
                      </template>

                      <template v-else>Pick a date</template>
                    </UButton>

                    <template #content>
                      <UCalendar
                        v-model="getDateCalendar(dIndex).startCalendar"
                        class="p-2"
                      />
                    </template>
                  </UPopover>
                </UFormField>

                <!-- END DATE -->
                <UFormField
                  class="w-full"
                  :name="`dates.${dIndex}.end`"
                  label="End date"
                >
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="subtle"
                      icon="i-lucide-calendar"
                    >
                      <template v-if="getDateCalendar(dIndex).endCalendar">
                        {{
                          df.format(
                            getDateCalendar(dIndex).endCalendar!.toDate(
                              getLocalTimeZone(),
                            ),
                          )
                        }}
                      </template>

                      <template v-else>Pick a date</template>
                    </UButton>

                    <template #content>
                      <UCalendar
                        v-model="getDateCalendar(dIndex).endCalendar"
                        class="p-2"
                      />
                    </template>
                  </UPopover>
                </UFormField>
              </div>

              <!-- TYPE + INFO -->
              <div class="space-y-2">
                <UFormField
                  :name="`dates.${dIndex}.dateType`"
                  label="Date type"
                  required
                >
                  <USelect
                    v-model="d.dateType"
                    class="w-full"
                    :items="DATE_TYPE_OPTIONS"
                  />
                </UFormField>

                <UFormField
                  :name="`dates.${dIndex}.dateInformation`"
                  label="Additional information"
                >
                  <UInput
                    v-model="d.dateInformation"
                    placeholder="Free-text notes about this date"
                  />
                </UFormField>
              </div>

              <div class="flex items-end justify-end">
                <UButton
                  v-if="state.dates.length > 1"
                  size="xs"
                  trailing-icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  @click="removeRow(state.dates, dIndex)"
                >
                  Delete
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- TYPES & FORMATS -->
      <CardCollapsibleContent
        title="Type & Technical Details"
        :collapse="false"
      >
        <div class="space-y-4">
          <div class="grid gap-4 md:grid-cols-[2fr,1fr]">
            <UFormField
              name="types.resourceType"
              label="Resource type"
              required
            >
              <UInput
                v-model="state.types.resourceType"
                placeholder="e.g., Poster"
              />
            </UFormField>

            <UFormField
              name="types.resourceTypeGeneral"
              label="Resource type (general)"
            >
              <USelect
                v-model="state.types.resourceTypeGeneral"
                class="w-full"
                :items="RESOURCE_TYPE_OPTIONS"
              />
            </UFormField>
          </div>

          <UFormField name="version" label="Version" required>
            <UInput v-model="state.version" placeholder="e.g., 2.1" />
          </UFormField>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField name="sizes" label="Poster size(s)">
              <UInputTags
                v-model="state.sizes"
                class="w-full"
                placeholder="e.g., 36x48 inches, 28MB PDF"
              />
            </UFormField>

            <UFormField name="formats" label="File format(s)" required>
              <UInputTags
                v-model="state.formats"
                class="w-full"
                placeholder="e.g., PDF, application/pdf"
              />
            </UFormField>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- RIGHTS / LICENSE -->
      <CardCollapsibleContent title="Rights & License" :collapse="false">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm">
              Add at least one license or rights statement for the poster.
            </p>

            <UButton
              size="xs"
              icon="i-lucide-plus"
              variant="ghost"
              @click="
                pushRow(
                  state.rightsList,
                  {
                    rights: '',
                    rightsUri: '',
                    rightsIdentifier: '',
                    rightsIdentifierScheme: '',
                    schemeUri: '',
                  },
                  {
                    requiredFields: ['rights'],
                    sectionLabel: 'Rights entry',
                  },
                )
              "
            >
              Add rights entry
            </UButton>
          </div>

          <div class="space-y-3">
            <div
              v-for="(r, rIndex) in state.rightsList"
              :key="rIndex"
              class="space-y-3 rounded-lg border border-gray-200 p-3"
            >
              <UFormField
                :name="`rightsList.${rIndex}.rights`"
                label="Rights"
                required
              >
                <USelect
                  v-model="r.rights"
                  class="w-full"
                  :items="LICENSE_OPTIONS"
                  placeholder="Select a license"
                />
              </UFormField>

              <div class="grid gap-3 md:grid-cols-3">
                <UFormField
                  :name="`rightsList.${rIndex}.rightsUri`"
                  label="Rights URI"
                >
                  <UInput
                    v-model="r.rightsUri"
                    placeholder="https://creativecommons.org/licenses/by/4.0/"
                  />
                </UFormField>

                <UFormField
                  :name="`rightsList.${rIndex}.rightsIdentifier`"
                  label="Identifier"
                >
                  <UInput
                    v-model="r.rightsIdentifier"
                    placeholder="CC-BY-4.0"
                  />
                </UFormField>

                <UFormField
                  :name="`rightsList.${rIndex}.rightsIdentifierScheme`"
                  label="Identifier scheme"
                >
                  <UInput
                    v-model="r.rightsIdentifierScheme"
                    placeholder="SPDX"
                  />
                </UFormField>
              </div>

              <UFormField
                :name="`rightsList.${rIndex}.schemeUri`"
                label="Scheme URI"
              >
                <UInput
                  v-model="r.schemeUri"
                  placeholder="https://spdx.org/licenses/"
                />
              </UFormField>

              <div class="flex justify-end">
                <UButton
                  v-if="state.rightsList.length > 1"
                  size="xs"
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  @click="removeRow(state.rightsList, rIndex)"
                />
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- DESCRIPTIONS -->
      <CardCollapsibleContent title="Descriptions" :collapse="false">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm">
              You can add multiple description types (Abstract, Methods, etc.).
            </p>

            <UButton
              size="xs"
              icon="i-lucide-plus"
              variant="ghost"
              @click="
                pushRow(
                  state.descriptions,
                  {
                    description: '',
                    descriptionType: 'Other',
                  },
                  {
                    requiredFields: ['description', 'descriptionType'],
                    sectionLabel: 'Description',
                  },
                )
              "
            >
              Add description
            </UButton>
          </div>

          <div class="space-y-3">
            <div
              v-for="(desc, idx) in state.descriptions"
              :key="idx"
              class="space-y-3 rounded-lg border border-gray-200 p-3"
            >
              <UFormField
                :name="`descriptions.${idx}.descriptionType`"
                label="Description type"
              >
                <USelect
                  v-model="desc.descriptionType"
                  class="w-full"
                  :items="DESCRIPTION_TYPE_OPTIONS"
                />
              </UFormField>

              <UFormField
                :name="`descriptions.${idx}.description`"
                label="Description"
              >
                <UTextarea
                  v-model="desc.description"
                  class="w-full"
                  :rows="4"
                  placeholder="Write or refine the text here..."
                />
              </UFormField>

              <div class="flex justify-end">
                <UButton
                  v-if="state.descriptions.length > 1"
                  size="xs"
                  trailing-icon="i-lucide-trash-2"
                  color="error"
                  variant="solid"
                  @click="removeRow(state.descriptions, idx)"
                  >Delete</UButton
                >
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- FUNDING -->
      <CardCollapsibleContent title="Funding References" :collapse="false">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm">
              Add all grants or funding sources that supported this work.
            </p>

            <UButton
              size="xs"
              icon="i-lucide-plus"
              variant="ghost"
              @click="
                pushRow(
                  state.fundingReferences,
                  {
                    funderName: '',
                    funderIdentifier: '',
                    funderIdentifierType: undefined,
                    schemeUri: '',
                    awardNumber: '',
                    awardUri: '',
                    awardTitle: '',
                  },
                  {
                    requiredFields: ['funderName', 'funderIdentifierType'],
                    sectionLabel: 'Funding reference',
                  },
                )
              "
            >
              Add funding reference
            </UButton>
          </div>

          <div class="space-y-3">
            <div
              v-for="(f, fIndex) in state.fundingReferences"
              :key="fIndex"
              class="space-y-3 rounded-lg border border-gray-200 p-3"
            >
              <UFormField
                :name="`fundingReferences.${fIndex}.funderName`"
                label="Funder name"
                required
              >
                <UInput
                  v-model="f.funderName"
                  placeholder="e.g., National Institutes of Health (NIH)"
                />
              </UFormField>

              <div class="grid gap-3 md:grid-cols-3">
                <UFormField
                  :name="`fundingReferences.${fIndex}.funderIdentifier`"
                  label="Funder identifier"
                >
                  <UInput
                    v-model="f.funderIdentifier"
                    placeholder="https://doi.org/10.13039/100000936"
                  />
                </UFormField>

                <UFormField
                  :name="`fundingReferences.${fIndex}.funderIdentifierType`"
                  label="Identifier type"
                >
                  <USelect
                    v-model="f.funderIdentifierType"
                    class="w-full"
                    placeholder="Select identifier type"
                    :items="
                      [
                        'Crossref Funder ID',
                        'GRID',
                        'ISNI',
                        'ROR',
                        'Other',
                      ].map((v) => ({ label: v, value: v }))
                    "
                  />
                </UFormField>

                <UFormField
                  :name="`fundingReferences.${fIndex}.schemeUri`"
                  label="Scheme URI"
                >
                  <UInput v-model="f.schemeUri" placeholder="https://ror.org" />
                </UFormField>
              </div>

              <div class="grid gap-3 md:grid-cols-3">
                <UFormField
                  :name="`fundingReferences.${fIndex}.awardNumber`"
                  label="Award number"
                >
                  <UInput v-model="f.awardNumber" placeholder="OT2OD032644" />
                </UFormField>

                <UFormField
                  :name="`fundingReferences.${fIndex}.awardUri`"
                  label="Award URI"
                >
                  <UInput
                    v-model="f.awardUri"
                    placeholder="Link to funder award page"
                  />
                </UFormField>

                <UFormField
                  :name="`fundingReferences.${fIndex}.awardTitle`"
                  placeholder="Award title"
                  label="Award title"
                >
                  <UInput v-model="f.awardTitle" />
                </UFormField>
              </div>

              <div class="flex justify-end">
                <UButton
                  v-if="state.fundingReferences.length > 1"
                  size="xs"
                  trailing-icon="i-lucide-trash-2"
                  color="error"
                  variant="solid"
                  @click="removeRow(state.fundingReferences, fIndex)"
                  >Delete</UButton
                >
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- ETHICS -->
      <CardCollapsibleContent title="Ethics Approvals" :collapse="false">
        <UFormField name="ethicsApprovals" label="Ethics / IRB approvals">
          <UInputTags
            v-model="state.ethicsApprovals"
            class="w-full"
            placeholder="e.g., IRB Protocol #2024-001"
          />
        </UFormField>
      </CardCollapsibleContent>

      <!-- CONFERENCE -->
      <CardCollapsibleContent title="Conference Information" :collapse="false">
        <div class="space-y-4">
          <UFormField
            name="conference.conferenceName"
            label="Conference name"
            required
          >
            <UInput
              v-model="state.conference.conferenceName"
              placeholder="e.g., ARVO 2025"
            />
          </UFormField>

          <div class="grid gap-3 md:grid-cols-2">
            <UFormField name="conference.conferenceLocation" label="Location">
              <UInput
                v-model="state.conference.conferenceLocation"
                placeholder="e.g., Seattle, WA, USA"
              />
            </UFormField>

            <UFormField name="conference.conferenceAcronym" label="Acronym">
              <UInput
                v-model="state.conference.conferenceAcronym"
                placeholder="e.g., ARVO"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <UFormField
              name="conference.conferenceStartDate"
              label="Start date"
              required
            >
              <UPopover>
                <UButton
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-calendar"
                >
                  <template v-if="conferenceStartDateCalendar">
                    {{
                      df.format(
                        conferenceStartDateCalendar.toDate(getLocalTimeZone()),
                      )
                    }}
                  </template>

                  <template v-else>Pick a date</template>
                </UButton>

                <template #content>
                  <UCalendar
                    v-model="conferenceStartDateCalendar"
                    class="p-2"
                  />
                </template>
              </UPopover>
            </UFormField>

            <UFormField
              name="conference.conferenceEndDate"
              label="End date"
              required
            >
              <UPopover>
                <UButton
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-calendar"
                >
                  <template v-if="conferenceEndDateCalendar">
                    {{
                      df.format(
                        conferenceEndDateCalendar.toDate(getLocalTimeZone()),
                      )
                    }}
                  </template>

                  <template v-else>Pick a date</template>
                </UButton>

                <template #content>
                  <UCalendar v-model="conferenceEndDateCalendar" class="p-2" />
                </template>
              </UPopover>
            </UFormField>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <UFormField name="conference.conferenceUri" label="Conference URI">
              <UInput
                v-model="state.conference.conferenceUri"
                placeholder="Conference website"
              />
            </UFormField>

            <UFormField
              name="conference.conferenceIdentifier"
              label="Conference identifier"
            >
              <UInput v-model="state.conference.conferenceIdentifier" />
            </UFormField>

            <UFormField
              name="conference.conferenceIdentifierType"
              label="Identifier type"
            >
              <UInput v-model="state.conference.conferenceIdentifierType" />
            </UFormField>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- CAPTIONS -->
      <CardCollapsibleContent
        title="Table & Image Captions (extracted content)"
        :collapse="false"
      >
        <div class="space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-medium text-gray-700">Table captions</h4>

              <UButton
                size="xs"
                icon="i-lucide-plus"
                variant="ghost"
                @click="
                  pushRow((state.tableCaption ||= []), {
                    caption1: '',
                    caption2: '',
                  })
                "
              >
                Add table caption
              </UButton>
            </div>

            <div class="space-y-3">
              <div
                v-for="(cap, tIndex) in state.tableCaption"
                :key="tIndex"
                class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[1fr,1fr,auto]"
              >
                <UFormField
                  :name="`tableCaption.${tIndex}.caption1`"
                  label="Caption line 1"
                >
                  <UInput v-model="cap.caption1" />
                </UFormField>

                <UFormField
                  :name="`tableCaption.${tIndex}.caption2`"
                  label="Caption line 2"
                >
                  <UInput v-model="cap.caption2" />
                </UFormField>

                <div class="flex items-end justify-end">
                  <UButton
                    size="xs"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    @click="removeRow(state.tableCaption!, tIndex)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-medium text-gray-700">Image captions</h4>

              <UButton
                size="xs"
                icon="i-lucide-plus"
                variant="ghost"
                @click="
                  pushRow((state.imageCaption ||= []), {
                    caption1: '',
                    caption2: '',
                  })
                "
              >
                Add image caption
              </UButton>
            </div>

            <div class="space-y-3">
              <div
                v-for="(cap, iIndex) in state.imageCaption"
                :key="iIndex"
                class="grid gap-3 rounded-lg border border-gray-200 p-3 md:grid-cols-[1fr,1fr,auto]"
              >
                <UFormField
                  :name="`imageCaption.${iIndex}.caption1`"
                  label="Caption line 1"
                >
                  <UInput v-model="cap.caption1" />
                </UFormField>

                <UFormField
                  :name="`imageCaption.${iIndex}.caption2`"
                  label="Caption line 2"
                >
                  <UInput v-model="cap.caption2" />
                </UFormField>

                <div class="flex items-end justify-end">
                  <UButton
                    size="xs"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    @click="removeRow(state.imageCaption!, iIndex)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <UButton
        :disabled="loading"
        class="flex w-full justify-center"
        variant="solid"
        icon="i-lucide-arrow-right"
        label="Continue"
        type="submit"
        size="lg"
      />
    </UForm>
  </div>
</template>
