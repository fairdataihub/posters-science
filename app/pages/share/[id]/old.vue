<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import { faker } from "@faker-js/faker";
import {
  strictFormSchema,
  ISO_LANGUAGE_OPTIONS,
  type PosterResponse,
  type StrictFormSchema,
} from "@/utils/poster_schema";
import type { CalendarDate } from "@internationalized/date";
import {
  DateFormatter,
  getLocalTimeZone,
  parseDate,
} from "@internationalized/date";

const df = new DateFormatter("en-US", {
  dateStyle: "medium",
  timeZone: getLocalTimeZone(),
});

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

const loading = ref(false);

// Initial state (matches PosterMetadata / StrictFormSchema)
const state = reactive<StrictFormSchema>({
  title: faker.lorem.sentence(),
  description: "DEMO",
  doi: "",
  identifiers: [
    {
      identifier: "DEMO",
      identifierType: "DEMO",
    },
  ],
  creators: [
    {
      givenName: "",
      familyName: "",
      nameType: "Personal",
      nameIdentifiers: [],
      affiliation: [],
    },
  ],
  publisher: {
    name: "DEMO",
    publisherIdentifier: "",
    publisherIdentifierScheme: "",
    schemeURI: "",
  },
  publicationYear: new Date().getFullYear(),
  subjects: [
    {
      subject: "DEMO",
      schemeUri: "",
      valueUri: "",
      subjectScheme: "",
      classificationCode: "",
    },
  ],
  language: "en",
  relatedIdentifiers: [],
  size: "",
  format: "PDF",
  version: "1.0",
  rightsIdentifier: "CC-BY-4.0",
  fundingReferences: [
    {
      funderName: "DEMO",
      funderIdentifier: "",
      funderIdentifierType: undefined,
      schemeUri: "",
      awardNumber: "",
      awardUri: "",
      awardTitle: "",
    },
  ],
  conference: {
    conferenceName: "DEMO",
    conferenceLocation: "",
    conferenceUri: "",
    conferenceIdentifier: "",
    conferenceIdentifierType: "",
    conferenceYear: undefined,
    conferenceStartDate: "2023-01-01",
    conferenceEndDate: "2023-01-02",
    conferenceAcronym: "",
    conferenceSeries: "",
  },
  tableCaptions: [],
  imageCaptions: [],
  domain: "DEMO",
});

const { data, error } = await useFetch(`/api/poster/${id}`);

if (data.value) {
  const poster = data.value as PosterResponse;

  // Check if the poster is already published
  if (poster.status === "published" || poster.publishedAt) {
    toast.add({
      title: "Poster already published",
      description: "This poster has already been published! It is no",
      color: "warning",
    });

    await navigateTo("/dashboard");

    throw createError({
      statusCode: 400,
      statusMessage: "Poster already published",
    });
  }

  if (poster.extractionJob) {
    if (
      !poster.extractionJob.completed &&
      (poster.extractionJob.status === "processing" ||
        poster.extractionJob.status === "pending-extraction")
    ) {
      toast.add({
        title: "Extraction in progress",
        description:
          "The poster extraction is in progress. Please wait until this process is completed.",
        color: "warning",
      });

      await navigateTo("/dashboard");

      throw createError({
        statusCode: 400,
        statusMessage: "Extraction in progress",
      });
    }
  }

  // Basic poster fields
  if (poster.title) state.title = poster.title;
  if (poster.description) state.description = poster.description;

  const meta = poster.posterMetadata;
  if (meta) {
    if (meta.doi) state.doi = meta.doi;
    if (
      meta.identifiers &&
      Array.isArray(meta.identifiers) &&
      meta.identifiers.length
    ) {
      state.identifiers = (
        meta.identifiers as { identifier?: string; identifierType?: string }[]
      ).map((i) => ({
        identifier: i.identifier || "DEMO",
        identifierType: i.identifierType || "",
      }));
    }

    // Creators - split name into givenName/familyName
    if (meta.creators?.length) {
      state.creators = meta.creators.map((creator) => {
        let givenName = creator.givenName || "";
        let familyName = creator.familyName || "";

        // If we have a name field but no givenName/familyName, split it
        // Handles "Family, Given" (DataCite) and "Given Family" formats
        if (creator.name && !givenName && !familyName) {
          const trimmed = creator.name.trim();

          if (trimmed.includes(",")) {
            // "Family, Given" format
            const [family, ...rest] = trimmed.split(",");
            familyName = (family ?? "").trim();
            givenName = rest.join(",").trim();
          } else {
            // "Given Family" format
            const nameParts = trimmed.split(/\s+/);

            if (nameParts.length === 1) {
              familyName = nameParts[0] ?? "";
            } else {
              familyName = nameParts.pop() || "";
              givenName = nameParts.join(" ");
            }
          }
        }

        return {
          givenName,
          familyName,
          nameType: (creator.nameType || "Personal") as
            | "Personal"
            | "Organizational",
          nameIdentifiers: (creator.nameIdentifiers || []).map((ni: any) => ({
            nameIdentifier: ni?.nameIdentifier || "",
            nameIdentifierScheme: ni?.nameIdentifierScheme || "",
            schemeURI: ni?.schemeURI || "",
          })),
          affiliation: (creator.affiliation || []).map((a: any) => {
            if (typeof a === "string") {
              return {
                name: a,
                affiliationIdentifier: "",
                affiliationIdentifierScheme: "",
                schemeURI: "",
              };
            }

            return {
              name: a?.name || "",
              affiliationIdentifier: a?.affiliationIdentifier || "",
              affiliationIdentifierScheme: a?.affiliationIdentifierScheme || "",
              schemeURI: a?.schemeURI || "",
            };
          }),
        };
      });
      console.log("Transformed creators", state.creators);
    }

    // Publisher - convert from possible array/object to single object
    if (meta.publisher) {
      const pub = Array.isArray(meta.publisher)
        ? meta.publisher[0]
        : meta.publisher;
      if (pub) {
        state.publisher = {
          name: pub.name || "DEMO",
          publisherIdentifier: pub.publisherIdentifier || "",
          publisherIdentifierScheme: pub.publisherIdentifierScheme || "",
          schemeURI: pub.schemeURI || "",
        };
      }
    }

    // Publication year
    if (meta.publicationYear) state.publicationYear = meta.publicationYear;

    // Subjects (DB stores string[]; form uses array of { subject, ... })
    if (meta.subjects?.length) {
      const subj = meta.subjects as (string | { subject?: string })[];
      state.subjects = subj.map((s) =>
        typeof s === "string"
          ? {
              subject: s,
              schemeUri: "",
              valueUri: "",
              subjectScheme: "",
              classificationCode: "",
            }
          : {
              subject: s?.subject || "",
              schemeUri: "",
              valueUri: "",
              subjectScheme: "",
              classificationCode: "",
            },
      );
    }

    if (meta.language) state.language = meta.language;

    if (
      meta.relatedIdentifiers &&
      Array.isArray(meta.relatedIdentifiers) &&
      meta.relatedIdentifiers.length
    ) {
      state.relatedIdentifiers =
        meta.relatedIdentifiers as StrictFormSchema["relatedIdentifiers"];
    }

    if (meta.size) state.size = meta.size;
    if (meta.format) state.format = meta.format;
    if (meta.version) state.version = meta.version;
    if (meta.rightsIdentifier) state.rightsIdentifier = meta.rightsIdentifier;

    // Funding references - cast funderIdentifierType to enum
    if (meta.fundingReferences?.length) {
      state.fundingReferences = meta.fundingReferences.map((f: any) => ({
        funderName: f.funderName || "",
        funderIdentifier: f.funderIdentifier || "",
        funderIdentifierType: f.funderIdentifierType as
          | "Crossref Funder ID"
          | "GRID"
          | "ISNI"
          | "ROR"
          | "Other"
          | undefined,
        schemeUri: f.schemeUri || "",
        awardNumber: f.awardNumber || "",
        awardUri: f.awardUri || "",
        awardTitle: f.awardTitle || "",
      }));
    }

    // Conference
    if (meta.conference) {
      state.conference = {
        conferenceName: meta.conference.conferenceName || "DEMO",
        conferenceLocation: meta.conference.conferenceLocation || "",
        conferenceUri: meta.conference.conferenceUri || "",
        conferenceIdentifier: meta.conference.conferenceIdentifier || "",
        conferenceIdentifierType:
          meta.conference.conferenceIdentifierType || "",
        conferenceYear: meta.conference.conferenceYear,
        conferenceStartDate:
          meta.conference.conferenceStartDate || "2023-01-01",
        conferenceEndDate: meta.conference.conferenceEndDate || "2023-01-01",
        conferenceAcronym: meta.conference.conferenceAcronym || "",
        conferenceSeries: meta.conference.conferenceSeries || "",
      };
    }

    // Table and image captions (support legacy tableCaption/imageCaption)
    const tableCaps = meta.tableCaptions ?? (meta as any).tableCaption ?? [];

    if (tableCaps.length) {
      state.tableCaptions = tableCaps.map((cap: any) => {
        if (cap.captions) return cap;

        return { captions: [cap.caption1, cap.caption2].filter(Boolean) };
      });
    }

    const imgCaps = meta.imageCaptions ?? (meta as any).imageCaption ?? [];

    if (imgCaps.length) {
      state.imageCaptions = imgCaps.map((cap: any) => {
        if (cap.captions) return cap;

        return { captions: [cap.caption1, cap.caption2].filter(Boolean) };
      });
    }

    state.domain = meta.domain || "DEMO";
  }
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
  () => state.conference?.conferenceStartDate ?? "",
  (value) => {
    if (state.conference) state.conference.conferenceStartDate = value;
  },
);

const conferenceEndDateCalendar = useCalendarStringField(
  () => state.conference?.conferenceEndDate ?? "",
  (value) => {
    if (state.conference) state.conference.conferenceEndDate = value;
  },
);

const savingDraft = ref(false);

async function saveDraft() {
  savingDraft.value = true;

  try {
    const response = await $fetch(`/api/poster/${id}`, {
      method: "PUT",
      body: state,
    });

    if (!response || (response as any).error) {
      throw new Error(
        (response as any)?.message ||
          "Unknown error occurred while saving draft.",
      );
    }

    toast.add({
      title: "Draft Saved",
      description: "Your progress has been saved.",
      color: "success",
    });
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem saving your draft.",
      color: "error",
      icon: "material-symbols:error",
    });
  } finally {
    savingDraft.value = false;
  }
}

async function onSubmit(event: FormSubmitEvent<StrictFormSchema>) {
  console.log("Submitting poster metadata");
  loading.value = true;

  try {
    const formData = event.data;
    console.log("Submitting poster metadata (API payload)", formData);
    const response = await $fetch(`/api/poster/${id}`, {
      method: "PUT",
      body: formData,
    });

    if (!response || (response as any).error) {
      console.log("Error response from API:", response);
      throw new Error(
        (response as any)?.message ||
          "Unknown error occurred while saving poster metadata.",
      );
    }

    toast.add({
      title: "Success",
      description: "Poster metadata has been submitted.",
      color: "success",
    });

    // Navigate to review page
    await navigateTo(`/share/${id}/review`);
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem saving your poster metadata.",
      color: "error",
      icon: "material-symbols:error",
    });
  } finally {
    loading.value = false;
  }
}

function onError(event: {
  errors: { id?: string; path?: string; message?: string }[];
}) {
  const errorCount = event.errors.length;
  const firstError = event.errors[0];

  toast.add({
    title: "Validation Error",
    description:
      errorCount === 1
        ? firstError?.message || "Please fix the highlighted field."
        : `Please fix ${errorCount} validation errors before submitting.`,
    color: "error",
    icon: "material-symbols:error",
  });

  // Scroll to first error field if it has an id
  if (firstError?.id) {
    const el = document.getElementById(firstError.id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      title="Review Metadata"
      description="Review and edit the extracted metadata for your poster submission"
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Upload Poster', to: '/share/new' },
            { label: 'Review Metadata' },
          ]"
        />
      </template>
    </UPageHeader>

    <UForm
      :schema="strictFormSchema"
      :state="state"
      class="space-y-6"
      :disabled="loading"
      @submit="onSubmit"
      @error="onError"
    >
      <!-- Mandatory Information -->
      <CardCollapsibleContent title="Mandatory Information" :collapse="false">
        <div class="space-y-4">
          <UFormField label="Title" required name="title">
            <UInput v-model="state.title" />
          </UFormField>

          <UFormField label="Description" required name="description">
            <UTextarea v-model="state.description" class="w-full" />
          </UFormField>
        </div>
      </CardCollapsibleContent>

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

      <!-- Recommended Information -->
      <CardCollapsibleContent title="Recommended Information" :collapse="false">
        <div class="space-y-8">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Primary Language" name="language">
              <USelect
                v-model="state.language"
                :items="ISO_LANGUAGE_OPTIONS"
                placeholder="Select a language"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Domain / Field of Study" name="domain">
              <UInput
                v-model="state.domain"
                placeholder="e.g., Machine Learning, Clinical Medicine"
              />
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

      <!-- TYPE & TECHNICAL DETAILS -->
      <CardCollapsibleContent
        title="Type & Technical Details"
        :collapse="false"
      >
        <div class="space-y-4">
          <UFormField name="version" label="Version" required>
            <UInput v-model="state.version" placeholder="e.g., 2.1" />
          </UFormField>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField name="size" label="Poster size">
              <UInput v-model="state.size" placeholder="e.g., 36x48 inches" />
            </UFormField>

            <UFormField name="format" label="File format" required>
              <UInput v-model="state.format" placeholder="e.g., PDF" />
            </UFormField>
          </div>
        </div>
      </CardCollapsibleContent>

      <!-- RIGHTS / LICENSE -->
      <CardCollapsibleContent title="Rights & License" :collapse="false">
        <div class="space-y-3">
          <p class="text-sm">
            SPDX license identifier for the poster (e.g., CC-BY-4.0).
          </p>

          <UFormField
            name="rightsIdentifier"
            label="Rights identifier (SPDX)"
            required
          >
            <USelect
              v-model="state.rightsIdentifier"
              class="w-full sm:w-80"
              :items="LICENSE_OPTIONS"
              placeholder="Select a license"
            />
          </UFormField>
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

            <UFormField
              name="conference.conferenceYear"
              label="Conference year"
            >
              <UInput
                v-model.number="state.conference.conferenceYear"
                type="number"
                placeholder="e.g., 2025"
              />
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
                  pushRow((state.tableCaptions ||= []), {
                    captions: [''],
                  })
                "
              >
                Add table caption
              </UButton>
            </div>

            <div class="space-y-3">
              <div
                v-for="(cap, tIndex) in state.tableCaptions"
                :key="tIndex"
                class="rounded-lg border border-gray-200 p-3"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs font-medium text-gray-500">
                    Table {{ tIndex + 1 }}
                  </span>

                  <UButton
                    size="xs"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    @click="removeRow(state.tableCaptions!, tIndex)"
                  />
                </div>

                <div class="space-y-2">
                  <div
                    v-for="(_, cIndex) in cap.captions"
                    :key="cIndex"
                    class="flex items-center gap-2"
                  >
                    <UFormField
                      :name="`tableCaptions.${tIndex}.captions.${cIndex}`"
                      :label="`Caption line ${cIndex + 1}`"
                      class="flex-1"
                    >
                      <UInput v-model="cap.captions![cIndex]" />
                    </UFormField>

                    <UButton
                      v-if="cap.captions!.length > 1"
                      size="xs"
                      icon="i-lucide-minus"
                      color="error"
                      variant="ghost"
                      class="mt-5"
                      @click="cap.captions!.splice(cIndex, 1)"
                    />
                  </div>

                  <UButton
                    size="xs"
                    icon="i-lucide-plus"
                    variant="ghost"
                    @click="cap.captions!.push('')"
                  >
                    Add caption line
                  </UButton>
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
                  pushRow((state.imageCaptions ||= []), {
                    captions: [''],
                  })
                "
              >
                Add image caption
              </UButton>
            </div>

            <div class="space-y-3">
              <div
                v-for="(cap, iIndex) in state.imageCaptions"
                :key="iIndex"
                class="rounded-lg border border-gray-200 p-3"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs font-medium text-gray-500">
                    Image {{ iIndex + 1 }}
                  </span>

                  <UButton
                    size="xs"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    @click="removeRow(state.imageCaptions!, iIndex)"
                  />
                </div>

                <div class="space-y-2">
                  <div
                    v-for="(_, cIndex) in cap.captions"
                    :key="cIndex"
                    class="flex items-center gap-2"
                  >
                    <UFormField
                      :name="`imageCaptions.${iIndex}.captions.${cIndex}`"
                      :label="`Caption line ${cIndex + 1}`"
                      class="flex-1"
                    >
                      <UInput v-model="cap.captions![cIndex]" />
                    </UFormField>

                    <UButton
                      v-if="cap.captions!.length > 1"
                      size="xs"
                      icon="i-lucide-minus"
                      color="error"
                      variant="ghost"
                      class="mt-5"
                      @click="cap.captions!.splice(cIndex, 1)"
                    />
                  </div>

                  <UButton
                    size="xs"
                    icon="i-lucide-plus"
                    variant="ghost"
                    @click="cap.captions!.push('')"
                  >
                    Add caption line
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardCollapsibleContent>

      <div class="flex gap-3">
        <UButton
          :disabled="savingDraft || loading"
          :loading="savingDraft"
          class="flex-1"
          variant="outline"
          icon="i-lucide-save"
          label="Save Draft"
          type="button"
          size="lg"
          @click="saveDraft"
        />

        <UButton
          :disabled="loading || savingDraft"
          :loading="loading"
          class="flex-1"
          variant="solid"
          icon="i-lucide-arrow-right"
          label="Continue"
          type="submit"
          size="lg"
        />
      </div>
    </UForm>
    <!-- <pre>{{ state }}</pre> -->
  </div>
</template>
