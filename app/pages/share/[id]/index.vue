<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import {
  strictFormSchema,
  type PosterResponse,
  type StrictFormSchema,
  ISO_LANGUAGE_OPTIONS,
  IDENTIFIER_TYPE_OPTIONS,
  IDENTIFIER_TYPE_PLACEHOLDER_OPTIONS,
  RELATION_TYPE_OPTIONS,
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
const additionalInfoCollapsed = ref(true);
const posterContentCollapsed = ref(true);
const mandatoryCollapsed = ref(false);
const subjectInputRefs = ref<{ $el?: HTMLElement; focus?: () => void }[]>([]);

// Initial state (matches PosterMetadata / StrictFormSchema)
const state = reactive<StrictFormSchema>({
  title: "",
  description: "",
  doi: "",
  identifiers: [],
  creators: [
    {
      givenName: "",
      familyName: "",
      nameType: "Personal",
      nameIdentifiers: [],
      affiliation: [],
    },
  ],
  publisher: "",
  publicationYear: undefined,
  subjects: [],
  language: "en",
  relatedIdentifiers: [],
  size: "",
  format: "PDF",
  version: "",
  license: "",
  fundingReferences: [],
  conference: {
    conferenceName: "",
    conferenceLocation: "",
    conferenceUri: "",
    conferenceIdentifier: "",
    conferenceIdentifierType: "",
    conferenceYear: undefined,
    conferenceStartDate: "",
    conferenceEndDate: "",
    conferenceAcronym: "",
    conferenceSeries: "",
  },
  posterContent: {
    sections: [],
    unstructuredContent: "",
  },
  tableCaptions: [],
  imageCaptions: [],
  domain: "",
});

const { data, error } = await useFetch(`/api/poster/${id}`);

if (data.value) {
  const poster = data.value as PosterResponse;

  // Check if the poster is already published
  if (poster.status === "published" || poster.publishedAt) {
    toast.add({
      title: "Poster already published",
      description:
        "This poster has already been published! It is now viewable on the Discover page.",
      color: "warning",
    });

    // open the discover page for this poster in a new tab
    window.open(`/discover/${id}`, "_blank");

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
        state.publisher = pub.name || "";
      }
    }

    // Publication year
    if (meta.publicationYear) state.publicationYear = meta.publicationYear;

    // Subjects (DB stores string[]; form uses array of { subject, ... })
    if (meta.subjects?.length) {
      const subj = meta.subjects as string[];
      state.subjects = subj;
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
    if (meta.license) state.license = meta.license;

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
        conferenceName: meta.conference.conferenceName ?? "",
        conferenceLocation: meta.conference.conferenceLocation || "",
        conferenceUri: meta.conference.conferenceUri || "",
        conferenceIdentifier: meta.conference.conferenceIdentifier || "",
        conferenceIdentifierType:
          meta.conference.conferenceIdentifierType || "",
        conferenceYear: meta.conference.conferenceYear ?? undefined,
        conferenceStartDate: meta.conference.conferenceStartDate ?? "",
        conferenceEndDate: meta.conference.conferenceEndDate ?? "",
        conferenceAcronym: meta.conference.conferenceAcronym || "",
        conferenceSeries: meta.conference.conferenceSeries || "",
      };
    }

    if (meta.posterContent) {
      state.posterContent = {
        sections:
          meta.posterContent.sections?.map((section: any) => ({
            sectionTitle: section.sectionTitle || "",
            sectionContent: section.sectionContent || "",
          })) || [],
        unstructuredContent: meta.posterContent.unstructuredContent || "",
      };
    }

    // Table and image captions (support legacy tableCaption/imageCaption)
    // Filter out blank captions produced by the extraction model
    const tableCaps = meta.tableCaptions ?? (meta as any).tableCaption ?? [];

    if (tableCaps.length) {
      state.tableCaptions = tableCaps
        .filter((cap: any) => (cap.caption ?? "").trim() !== "")
        .map((cap: any) => ({
          ...(cap.id ? { id: cap.id } : {}),
          caption: cap.caption,
        }));
    }

    const imgCaps = meta.imageCaptions ?? (meta as any).imageCaption ?? [];

    if (imgCaps.length) {
      state.imageCaptions = imgCaps
        .filter((cap: any) => (cap.caption ?? "").trim() !== "")
        .map((cap: any) => ({
          ...(cap.id ? { id: cap.id } : {}),
          caption: cap.caption,
        }));
    }

    state.domain = meta.domain ?? "";
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
      if (!raw) return null;
      try {
        return parseDate(raw);
      } catch {
        return null;
      }
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

const currentYear = new Date().getFullYear();
const conferenceYearOptions = Array.from(
  { length: currentYear + 1 - 2000 + 1 },
  (_, i) => currentYear + 1 - i,
).map((y) => ({ label: String(y), value: y }));

/** Extract a year from text (e.g. "ARVO 2025" or "Conference 25") for auto-fill. */
function yearFromText(text: string): number | undefined {
  if (!text || typeof text !== "string") return undefined;

  const s = text.trim();
  const fourDigit = s.match(/\b(19\d{2}|20\d{2})\b/);

  if (fourDigit) return Number(fourDigit[1]);

  const twoDigit = s.match(/\b(\d{2})\b/);

  if (twoDigit) {
    const n = Number(twoDigit[1]);
    // Skip 19/20 so we don't autofill while they're typing a full year (e.g. "2025")
    if (n === 19 || n === 20) return undefined;
    const yy = currentYear % 100;
    const century = n <= yy ? 2000 : 1900;

    return century + n;
  }

  return undefined;
}

watch(
  () => state.conference?.conferenceName,
  (name) => {
    if (!state.conference || state.conference.conferenceYear != null) return;

    const year = yearFromText(name ?? "");

    if (year != null) state.conference.conferenceYear = year;
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

  console.log("Validation errors:", event.errors);

  // Scroll to first error field if it has an id
  if (firstError?.id) {
    const el = document.getElementById(firstError.id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function removeRow<T>(arr: T[], index: number) {
  arr.splice(index, 1);
}

async function addSubjectAndFocus() {
  state.subjects.push("");
  await nextTick();
  const last = subjectInputRefs.value[subjectInputRefs.value.length - 1];
  const input =
    last?.$el?.querySelector?.("input") ?? (last?.$el as HTMLInputElement);
  input?.focus?.();
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 pb-10">
    <UPageHeader
      title="Review Metadata"
      description="Review and edit the metadata we extracted for your poster submission. This metadata will be included in a poster.json file that will be shared along with your poster to make it more reusable and machine actionable. The metadata will also be registered in the Posters.science database to make your poster discoverable."
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
      <div
        class="group cursor-pointer select-none"
        @click="mandatoryCollapsed = !mandatoryCollapsed"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2
              class="dark:group-hover:text-primary-300 group-hover:text-primary-600 text-2xl font-semibold transition-colors"
            >
              Mandatory Information
            </h2>

            <p class="text-gray-500">
              These are the minimum fields that are required to submit your
              poster.
            </p>
          </div>

          <UIcon
            name="i-lucide-chevron-up"
            class="group-hover:text-primary-600 dark:group-hover:text-primary-300 size-8 text-gray-400 transition-all"
            :class="{ 'rotate-180': mandatoryCollapsed }"
          />
        </div>

        <USeparator class="my-4" type="dashed" />
      </div>

      <div
        class="space-y-6 transition-all duration-200 ease-in-out"
        :class="mandatoryCollapsed ? 'hidden opacity-0' : 'opacity-100'"
      >
        <CardCollapsibleContent
          title="About the poster"
          :collapse="false"
          description="Some general information about the poster"
        >
          <div class="space-y-4">
            <UFormField label="Title" required name="title">
              <UInput v-model="state.title" />
            </UFormField>

            <UFormField label="Description" required name="description">
              <UTextarea v-model="state.description" class="w-full" />
            </UFormField>

            <UFormField label="Keywords" name="subjects" required>
              <div v-if="state.subjects && state.subjects?.length > 0">
                <div
                  v-for="(_subject, sIndex) in state.subjects"
                  :key="sIndex"
                  class="mb-2 flex gap-2"
                >
                  <UFormField
                    class="w-full"
                    :name="`subjects.${sIndex}`"
                    label=""
                    required
                  >
                    <UInput
                      ref="subjectInputRefs"
                      v-model="state.subjects[sIndex]"
                      placeholder="e.g., Machine Learning, Type 2 Diabetes"
                      @keydown.enter.prevent="addSubjectAndFocus"
                    />
                  </UFormField>

                  <UButton
                    size="sm"
                    color="error"
                    variant="outline"
                    icon="i-lucide-trash"
                    @click="removeRow(state.subjects, sIndex)"
                  />

                  <UButton
                    size="sm"
                    color="success"
                    variant="outline"
                    icon="i-lucide-plus"
                    @click="state.subjects.push('')"
                  />
                </div>
              </div>

              <div v-else>
                <UButton
                  size="sm"
                  class="w-full"
                  color="success"
                  variant="outline"
                  label="Add Keyword"
                  icon="i-lucide-plus"
                  @click="state.subjects.push('')"
                />
              </div>
            </UFormField>
          </div>
        </CardCollapsibleContent>

        <CardCollapsibleContent
          title="Creators"
          :collapse="false"
          description="These are the people who contributed to the poster"
        >
          <div class="space-y-4">
            <div
              v-for="(creator, cIndex) in state.creators"
              :key="cIndex"
              class="space-y-2 rounded-xl border border-gray-200 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <UFormField
                  :name="`creators.${cIndex}.givenName`"
                  label="Given Name"
                  required
                  class="flex-1"
                >
                  <UInput
                    v-model="creator.givenName"
                    placeholder="e.g., Garcia, Sofia"
                  />
                </UFormField>

                <UFormField
                  :name="`creators.${cIndex}.familyName`"
                  label="Family Name"
                  required
                  class="flex-1"
                >
                  <UInput
                    v-model="creator.familyName"
                    placeholder="e.g., Garcia, Sofia"
                  />
                </UFormField>

                <UFormField
                  :name="`creators.${cIndex}.nameType`"
                  label="Type"
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
                >
                  Delete Creator
                </UButton>
              </div>

              <UFormField label="Affiliations" name="affiliation">
                <div
                  v-if="
                    state.creators[cIndex]?.affiliation &&
                    state.creators[cIndex]?.affiliation?.length > 0
                  "
                >
                  <div
                    v-for="(affiliation, aIndex) in state.creators[cIndex]
                      ?.affiliation"
                    :key="aIndex"
                    class="mb-2 flex gap-2"
                  >
                    <UFormField
                      class="w-full"
                      :name="`creators.${cIndex}.affiliation.${aIndex}.name`"
                      label=""
                      required
                    >
                      <UInput
                        v-model="affiliation.name"
                        placeholder="University of California, San Diego"
                      />
                    </UFormField>

                    <UButton
                      size="sm"
                      color="error"
                      variant="outline"
                      icon="i-lucide-trash"
                      @click="
                        removeRow(state.creators[cIndex]?.affiliation!, aIndex)
                      "
                    />

                    <UButton
                      size="sm"
                      color="success"
                      variant="outline"
                      icon="i-lucide-plus"
                      @click="
                        state.creators[cIndex]?.affiliation?.push({
                          name: '',
                          affiliationIdentifier: '',
                          affiliationIdentifierScheme: '',
                          schemeURI: '',
                        })
                      "
                    />
                  </div>
                </div>

                <div v-else>
                  <UButton
                    size="sm"
                    class="w-full"
                    color="success"
                    variant="outline"
                    label="Add Affiliation"
                    icon="i-lucide-plus"
                    @click="
                      state.creators[cIndex]?.affiliation?.push({
                        name: '',
                        affiliationIdentifier: '',
                        affiliationIdentifierScheme: '',
                        schemeURI: '',
                      })
                    "
                  />
                </div>
              </UFormField>
            </div>

            <UButton
              icon="i-lucide-plus"
              variant="outline"
              color="primary"
              class="w-full"
              label="Add Creator"
              @click="
                state.creators.push({
                  givenName: '',
                  familyName: '',
                  nameType: 'Personal',
                  nameIdentifiers: [],
                  affiliation: [],
                })
              "
            />
          </div>
        </CardCollapsibleContent>

        <CardCollapsibleContent
          title="Conference"
          :collapse="false"
          description="The conference or event where the poster was presented"
        >
          <div class="space-y-4">
            <div class="grid gap-3 md:grid-cols-2">
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

              <UFormField
                name="conference.conferenceYear"
                label="Conference year"
                required
              >
                <USelect
                  v-model="state.conference.conferenceYear"
                  class="w-full"
                  :items="conferenceYearOptions"
                  placeholder="Select a year"
                />
              </UFormField>
            </div>

            <UFormField name="conference.conferenceLocation" label="Location">
              <UInput
                v-model="state.conference.conferenceLocation"
                placeholder="e.g., Seattle, WA, USA"
              />
            </UFormField>

            <div class="grid gap-3 md:grid-cols-3">
              <UFormField name="conference.conferenceAcronym" label="Acronym">
                <UInput
                  v-model="state.conference.conferenceAcronym"
                  placeholder="e.g., ARVO"
                />
              </UFormField>

              <UFormField
                name="conference.conferenceUri"
                label="Conference URI"
              >
                <UInput
                  v-model="state.conference.conferenceUri"
                  placeholder="https://arvo.org"
                  type="url"
                />
              </UFormField>

              <div class="flex items-end gap-3">
                <UFormField
                  name="conference.conferenceStartDate"
                  label="Start date"
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
                            conferenceStartDateCalendar.toDate(
                              getLocalTimeZone(),
                            ),
                          )
                        }}
                      </template>

                      <template v-else>Pick a date</template>
                    </UButton>

                    <template #content>
                      <UCalendar v-model="conferenceStartDateCalendar" />
                    </template>
                  </UPopover>
                </UFormField>

                <span class="mb-2 text-gray-500">to</span>

                <UFormField
                  name="conference.conferenceEndDate"
                  label="End date"
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
                            conferenceEndDateCalendar.toDate(
                              getLocalTimeZone(),
                            ),
                          )
                        }}
                      </template>

                      <template v-else>Pick a date</template>
                    </UButton>

                    <template #content>
                      <UCalendar v-model="conferenceEndDateCalendar" />
                    </template>
                  </UPopover>
                </UFormField>
              </div>
            </div>
          </div>
        </CardCollapsibleContent>
      </div>

      <div
        class="group cursor-pointer select-none"
        @click="additionalInfoCollapsed = !additionalInfoCollapsed"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2
              class="dark:group-hover:text-primary-300 group-hover:text-primary-600 text-2xl font-semibold transition-colors"
            >
              Additional Information
            </h2>

            <p class="text-gray-500">
              Optional metadata, identifiers, and related identifiers for your
              poster.
            </p>
          </div>

          <UIcon
            name="i-lucide-chevron-down"
            class="group-hover:text-primary-600 dark:group-hover:text-primary-300 size-8 text-gray-400 transition-all"
            :class="{ 'rotate-180': !additionalInfoCollapsed }"
          />
        </div>

        <USeparator class="my-4" type="dashed" />
      </div>

      <div
        class="transition-all duration-200 ease-in-out"
        :class="additionalInfoCollapsed ? 'hidden opacity-0' : 'opacity-100'"
      >
        <div class="space-y-6">
          <CardCollapsibleContent
            title="General"
            :collapse="false"
            description="Language, domain, and version details for this poster"
          >
            <div class="space-y-4">
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

              <UFormField label="Version" name="version">
                <UInput v-model="state.version" placeholder="e.g., 1.0" />
              </UFormField>

              <UFormField name="license" label="License">
                <USelect
                  v-model="state.license"
                  class="w-full"
                  :items="LICENSE_OPTIONS"
                  placeholder="Select a license"
                />
              </UFormField>
            </div>
          </CardCollapsibleContent>

          <CardCollapsibleContent
            title="Identifiers"
            :collapse="false"
            description="Alternative identifiers assigned to this poster (e.g. arXiv, Handle)"
          >
            <div class="space-y-4">
              <div
                v-for="(identifier, iIndex) in state.identifiers"
                :key="iIndex"
                class="space-y-2 rounded-xl border border-gray-200 p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <UFormField
                    :name="`identifiers.${iIndex}.identifier`"
                    label="Identifier"
                    required
                    class="flex-1"
                  >
                    <UInput
                      v-model="identifier.identifier"
                      :placeholder="
                        IDENTIFIER_TYPE_PLACEHOLDER_OPTIONS.find(
                          (id) => id.value === identifier.identifierType,
                        )?.label || 'Select an identifier type'
                      "
                    />
                  </UFormField>

                  <UFormField
                    :name="`identifiers.${iIndex}.identifierType`"
                    label="Type"
                    required
                    class="flex-1"
                  >
                    <USelect
                      v-model="identifier.identifierType"
                      class="w-full"
                      :items="IDENTIFIER_TYPE_OPTIONS"
                      placeholder="Select an identifier type"
                    />
                  </UFormField>

                  <UButton
                    v-if="state.identifiers.length > 1"
                    class="mt-7"
                    size="xs"
                    trailing-icon="i-lucide-trash-2"
                    color="error"
                    variant="solid"
                    @click="removeRow(state.identifiers, iIndex)"
                  >
                    Delete Identifier
                  </UButton>
                </div>
              </div>

              <UButton
                icon="i-lucide-plus"
                variant="outline"
                color="primary"
                class="w-full"
                label="Add Identifier"
                @click="
                  state.identifiers.push({
                    identifier: '',
                    identifierType: '',
                  })
                "
              />
            </div>
          </CardCollapsibleContent>

          <CardCollapsibleContent
            title="Related Identifiers"
            :collapse="false"
            description="Links to related works such as datasets, preprints, or supplementary materials"
          >
            <div class="space-y-4">
              <div
                v-for="(relatedIdentifier, iIndex) in state.relatedIdentifiers"
                :key="iIndex"
                class="space-y-2 rounded-xl border border-gray-200 p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <UFormField
                    :name="`relatedIdentifiers.${iIndex}.relatedIdentifier`"
                    label="Identifier"
                    required
                    class="flex-1"
                  >
                    <UInput
                      v-model="relatedIdentifier.relatedIdentifier"
                      :placeholder="
                        IDENTIFIER_TYPE_PLACEHOLDER_OPTIONS.find(
                          (id) =>
                            id.value ===
                            relatedIdentifier.relatedIdentifierType,
                        )?.label || 'Select an identifier type'
                      "
                    />
                  </UFormField>

                  <UFormField
                    :name="`relatedIdentifiers.${iIndex}.relatedIdentifierType`"
                    label="Type"
                    required
                    class="flex-1"
                  >
                    <USelect
                      v-model="relatedIdentifier.relatedIdentifierType"
                      class="w-full"
                      :items="IDENTIFIER_TYPE_OPTIONS"
                      placeholder="Select an identifier type"
                    />
                  </UFormField>
                </div>

                <div class="flex items-start justify-between gap-3">
                  <UFormField
                    :name="`relatedIdentifiers.${iIndex}.relationType`"
                    label="Relation Type"
                    required
                    class="flex-1"
                  >
                    <USelect
                      v-model="relatedIdentifier.relationType"
                      class="w-full"
                      :items="RELATION_TYPE_OPTIONS"
                      placeholder="Select a relation type"
                    />
                  </UFormField>

                  <UButton
                    v-if="
                      state.relatedIdentifiers &&
                      state.relatedIdentifiers.length > 1
                    "
                    class="mt-7"
                    size="xs"
                    trailing-icon="i-lucide-trash-2"
                    color="error"
                    variant="solid"
                    @click="removeRow(state.relatedIdentifiers, iIndex)"
                  >
                    Delete Related Identifier
                  </UButton>
                </div>
              </div>

              <UButton
                icon="i-lucide-plus"
                variant="outline"
                color="primary"
                class="w-full"
                label="Add Related  Identifier"
                @click="
                  state.relatedIdentifiers.push({
                    relatedIdentifier: '',
                    relatedIdentifierType: '',
                    relationType: '',
                  })
                "
              />
            </div>
          </CardCollapsibleContent>
        </div>
      </div>

      <div
        class="group cursor-pointer select-none"
        @click="posterContentCollapsed = !posterContentCollapsed"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2
              class="dark:group-hover:text-primary-300 group-hover:text-primary-600 text-2xl font-semibold transition-colors"
            >
              Poster Content
            </h2>

            <p class="text-gray-500">
              These are the sections that are included in the poster.
            </p>
          </div>

          <UIcon
            name="i-lucide-chevron-down"
            class="group-hover:text-primary-600 dark:group-hover:text-primary-300 size-8 text-gray-400 transition-all"
            :class="{ 'rotate-180': !posterContentCollapsed }"
          />
        </div>

        <USeparator class="my-4" type="dashed" />
      </div>

      <div
        class="transition-all duration-200 ease-in-out"
        :class="posterContentCollapsed ? 'hidden opacity-0' : 'opacity-100'"
      >
        <div class="space-y-6">
          <CardCollapsibleContent
            title="Poster Content"
            :collapse="false"
            description="These are the sections that are included in the poster."
          >
            <div class="space-y-4">
              <div
                v-for="(section, sIndex) in state.posterContent?.sections || []"
                :key="sIndex"
                class="space-y-2 rounded-xl border border-gray-200 p-4"
              >
                <UFormField
                  :name="`posterContent.sections.${sIndex}.sectionTitle`"
                  label="Section Title"
                  required
                  class="flex-1"
                >
                  <UInput
                    v-model="section.sectionTitle"
                    placeholder="e.g., Introduction"
                  />
                </UFormField>

                <UFormField
                  :name="`posterContent.sections.${sIndex}.sectionContent`"
                  label="Section Content"
                  required
                  class="flex-1"
                >
                  <!-- TODO: Add a rich text editor here. -->
                  <UTextarea
                    v-model="section.sectionContent"
                    placeholder="e.g., Machine learning algorithms were applied to analyze retinal images from 4,000 participants..."
                    class="w-full"
                  />
                </UFormField>

                <div class="flex justify-end">
                  <UButton
                    class="mt-7"
                    size="xs"
                    trailing-icon="i-lucide-trash-2"
                    color="error"
                    variant="solid"
                    @click="
                      removeRow(state.posterContent?.sections || [], sIndex)
                    "
                  >
                    Delete Section
                  </UButton>
                </div>
              </div>

              <UButton
                icon="i-lucide-plus"
                variant="outline"
                color="primary"
                class="w-full"
                label="Add Section"
                @click="
                  state.posterContent?.sections?.push({
                    sectionTitle: '',
                    sectionContent: '',
                  })
                "
              />
            </div>
          </CardCollapsibleContent>

          <CardCollapsibleContent
            title="Table Captions"
            :collapse="false"
            description="These are the table captions that are associated with the poster."
          >
            <div class="space-y-4">
              <div
                v-for="(caption, cIndex) in state.tableCaptions || []"
                :key="cIndex"
                class="space-y-2 rounded-xl border border-gray-200 p-4"
              >
                <UFormField
                  :name="`tableCaptions.${cIndex}.id`"
                  label="Table Identifier"
                  required
                  class="flex-1"
                >
                  <UInput v-model="caption.id" placeholder="e.g., Table 1" />
                </UFormField>

                <UFormField
                  :name="`tableCaptions.${cIndex}.caption`"
                  label="Table Caption"
                  required
                  class="flex-1"
                >
                  <UInput
                    v-model="caption.caption"
                    placeholder="e.g., Summary of Results"
                  />
                </UFormField>

                <div class="flex justify-end">
                  <UButton
                    class="mt-7"
                    size="xs"
                    trailing-icon="i-lucide-trash-2"
                    color="error"
                    variant="solid"
                    @click="removeRow(state.tableCaptions || [], cIndex)"
                  >
                    Delete Caption
                  </UButton>
                </div>
              </div>

              <UButton
                icon="i-lucide-plus"
                variant="outline"
                color="primary"
                class="w-full"
                label="Add Caption"
                @click="
                  state.tableCaptions?.push({
                    id: '',
                    caption: '',
                  })
                "
              />
            </div>
          </CardCollapsibleContent>

          <CardCollapsibleContent
            title="Image Captions"
            :collapse="false"
            description="These are the image captions that are associated with the poster."
          >
            <div class="space-y-4">
              <div
                v-for="(caption, cIndex) in state.imageCaptions || []"
                :key="cIndex"
                class="space-y-2 rounded-xl border border-gray-200 p-4"
              >
                <UFormField
                  :name="`imageCaptions.${cIndex}.id`"
                  label="Image Identifier"
                  required
                  class="flex-1"
                >
                  <UInput v-model="caption.id" placeholder="e.g., Image 1" />
                </UFormField>

                <UFormField
                  :name="`imageCaptions.${cIndex}.caption`"
                  label="Image Caption"
                  required
                  class="flex-1"
                >
                  <UInput
                    v-model="caption.caption"
                    placeholder="e.g., Summary of Results"
                  />
                </UFormField>

                <div class="flex justify-end">
                  <UButton
                    class="mt-7"
                    size="xs"
                    trailing-icon="i-lucide-trash-2"
                    color="error"
                    variant="solid"
                    @click="removeRow(state.imageCaptions || [], cIndex)"
                  >
                    Delete Image Caption
                  </UButton>
                </div>
              </div>

              <UButton
                icon="i-lucide-plus"
                variant="outline"
                color="primary"
                class="w-full"
                label="Add Image Caption"
                @click="
                  state.imageCaptions?.push({
                    id: '',
                    caption: '',
                  })
                "
              />
            </div>
          </CardCollapsibleContent>
        </div>
      </div>

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
  </div>
</template>
