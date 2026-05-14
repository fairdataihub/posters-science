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
  FUNDER_IDENTIFIER_TYPE_OPTIONS,
  inferRelatedIdentifierType,
  inferFunderIdentifierType,
  inferNameIdentifierScheme,
  inferAffiliationIdentifierScheme,
} from "@/utils/poster_schema";
import {
  CalendarDate,
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

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Edit Poster Metadata - Posters.science")}&description=${encodeURIComponent("Review and edit the metadata for your poster submission")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Edit Poster Metadata - Posters.science",
  description: "Review and edit the metadata for your poster submission.",
  ogTitle: "Edit Poster Metadata - Posters.science",
  ogDescription: "Review and edit the metadata for your poster submission.",
  ogImage,
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
  submissionAbstract: "",
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
        identifier: i.identifier || "",
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
      // Back-fill scheme/schemeURI for data loaded from the API
      state.creators.forEach((creator) => {
        creator.nameIdentifiers?.forEach((ni) => {
          if (!ni.schemeURI && ni.nameIdentifier) {
            const inferred = inferNameIdentifierScheme(ni.nameIdentifier);
            if (inferred) {
              ni.nameIdentifierScheme ||= inferred.scheme;
              ni.schemeURI = inferred.schemeURI;
            }
          }
        });
        creator.affiliation?.forEach((aff) => {
          if (!aff.schemeURI && aff.affiliationIdentifier) {
            const inferred = inferAffiliationIdentifierScheme(
              aff.affiliationIdentifier,
            );
            if (inferred) {
              aff.affiliationIdentifierScheme ||= inferred.scheme;
              aff.schemeURI = inferred.schemeURI;
            }
          }
        });
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

      if (meta.posterContent.submissionAbstract) {
        state.submissionAbstract = meta.posterContent.submissionAbstract;
      }
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

// Conference dates as a range for UCalendar (range); state keeps conferenceStartDate/conferenceEndDate strings
type DateRange = { start: CalendarDate; end: CalendarDate };

function todayCalendarDate(): CalendarDate {
  const now = new Date();

  return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

const conferenceDateRange = computed<DateRange>({
  get() {
    const startStr = state.conference?.conferenceStartDate ?? "";
    const endStr = state.conference?.conferenceEndDate ?? "";

    const today = todayCalendarDate();
    let start: CalendarDate;
    let end: CalendarDate;
    try {
      start = startStr ? parseDate(startStr) : today;
      end = endStr ? parseDate(endStr) : today;
    } catch {
      start = today;
      end = today;
    }
    if (start.compare(end) > 0) end = start;

    return { start, end };
  },
  set(value: DateRange) {
    if (state.conference) {
      state.conference.conferenceStartDate = toW3CDate(value.start);
      state.conference.conferenceEndDate = toW3CDate(value.end);
    }
  },
});

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
    await $fetch(`/api/poster/${id}?draft=true`, {
      method: "PUT",
      body: state,
    });

    toast.add({
      title: "Changes Saved",
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
      title: "Changes Saved",
      description: "Your progress has been saved.",
      color: "success",
    });

    // Navigate to review page
    await navigateTo(`/share/${id}/publish`);
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

async function onError(event: {
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

  if (!firstError?.id) return;

  const fieldId = firstError.id;

  if (
    fieldId.startsWith("posterContent") ||
    fieldId.startsWith("tableCaptions") ||
    fieldId.startsWith("imageCaptions")
  ) {
    posterContentCollapsed.value = false;
  } else if (
    fieldId === "submissionAbstract" ||
    fieldId === "language" ||
    fieldId === "domain" ||
    fieldId === "license" ||
    fieldId.startsWith("identifiers") ||
    fieldId.startsWith("relatedIdentifiers") ||
    fieldId.startsWith("fundingReferences")
  ) {
    additionalInfoCollapsed.value = false;
  } else {
    mandatoryCollapsed.value = false;
  }

  await nextTick();

  const el = document.getElementById(fieldId);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function removeRow<T>(arr: T[], index: number) {
  arr.splice(index, 1);
}

function handleAffiliationIdentifierInput(
  value: string,
  cIndex: number,
  aIndex: number,
) {
  const aff = state.creators[cIndex]?.affiliation?.[aIndex];
  if (!aff) return;
  const inferred = inferAffiliationIdentifierScheme(value);
  if (inferred) {
    aff.affiliationIdentifierScheme ||= inferred.scheme;
    aff.schemeURI ||= inferred.schemeURI;
  }
}

function handleNameIdentifierInput(
  value: string,
  cIndex: number,
  niIndex: number,
) {
  const ni = state.creators[cIndex]?.nameIdentifiers?.[niIndex];
  if (!ni) return;
  const inferred = inferNameIdentifierScheme(value);
  if (inferred) {
    ni.nameIdentifierScheme ||= inferred.scheme;
    ni.schemeURI ||= inferred.schemeURI;
  }
}

function handleFunderIdentifierInput(value: string, fIndex: number) {
  const funder = state.fundingReferences[fIndex];
  if (!funder) return;
  const inferred = inferFunderIdentifierType(value);
  if (inferred) funder.funderIdentifierType ||= inferred;
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
      ref="formRef"
      :schema="strictFormSchema"
      :state="state"
      class="space-y-8"
      :disabled="loading"
      @submit="onSubmit"
      @error="onError"
    >
      <div
        class="overflow-hidden rounded-2xl border border-pink-200 bg-white shadow-sm dark:border-pink-900 dark:bg-gray-900"
      >
        <div
          class="group cursor-pointer bg-pink-50 px-6 py-5 transition-colors select-none hover:bg-pink-100 dark:bg-pink-950/40 dark:hover:bg-pink-950/60"
          :class="
            mandatoryCollapsed
              ? ''
              : 'border-b border-pink-200 dark:border-pink-900'
          "
          @click="mandatoryCollapsed = !mandatoryCollapsed"
        >
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-900/60"
              >
                <UIcon
                  name="i-lucide-clipboard-list"
                  class="size-5 text-pink-600 dark:text-pink-400"
                />
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <h2
                    class="text-xl font-semibold text-gray-900 dark:text-white"
                  >
                    Mandatory Information
                  </h2>

                  <UBadge
                    label="Required"
                    color="error"
                    variant="subtle"
                    size="sm"
                  />
                </div>

                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  These are the minimum fields required to submit your poster.
                </p>
              </div>
            </div>

            <UIcon
              name="i-lucide-chevron-up"
              class="size-5 shrink-0 text-pink-500 transition-transform duration-200 dark:text-pink-400"
              :class="{ 'rotate-180': mandatoryCollapsed }"
            />
          </div>
        </div>

        <div
          class="space-y-6 px-6 py-6 transition-all duration-200 ease-in-out"
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
                  </div>

                  <UButton
                    size="sm"
                    class="mt-2 w-full"
                    color="success"
                    variant="outline"
                    label="Add Keyword"
                    icon="i-lucide-plus"
                    @click="addSubjectAndFocus"
                  />
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
                class="space-y-4 rounded-xl border border-gray-200 p-4"
              >
                <div
                  class="bg-primary-50 inline-flex items-center rounded-md px-3 py-1 dark:bg-pink-950/60"
                >
                  <p
                    class="text-primary-700 text-base font-medium dark:text-pink-300"
                  >
                    Author {{ cIndex + 1 }}
                  </p>
                </div>

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

                <UFormField
                  label="Creator Identifiers (e.g., ORCID)"
                  name="nameIdentifiers"
                >
                  <div
                    v-if="
                      state.creators[cIndex]?.nameIdentifiers &&
                      state.creators[cIndex]?.nameIdentifiers?.length > 0
                    "
                  >
                    <div
                      v-for="(ni, niIndex) in state.creators[cIndex]
                        ?.nameIdentifiers"
                      :key="niIndex"
                      class="mb-2 space-y-2 rounded-xl border border-l-4 border-gray-200 border-l-pink-300 p-3 dark:border-l-pink-700"
                    >
                      <div class="flex gap-2">
                        <UFormField
                          class="w-40 shrink-0"
                          :name="`creators.${cIndex}.nameIdentifiers.${niIndex}.nameIdentifierScheme`"
                          label="Identifier Type"
                        >
                          <UInput
                            v-model="ni.nameIdentifierScheme"
                            placeholder="e.g., ORCID"
                          />
                        </UFormField>

                        <UFormField
                          class="w-full"
                          :name="`creators.${cIndex}.nameIdentifiers.${niIndex}.nameIdentifier`"
                          label="Identifier"
                          required
                        >
                          <UInput
                            v-model="ni.nameIdentifier"
                            placeholder="https://orcid.org/0000-0000-0000-0000"
                            @update:model-value="
                              (v) =>
                                handleNameIdentifierInput(v, cIndex, niIndex)
                            "
                          />
                        </UFormField>

                        <UButton
                          class="mt-6"
                          size="sm"
                          color="error"
                          variant="outline"
                          icon="i-lucide-trash"
                          @click="
                            removeRow(
                              state.creators[cIndex]?.nameIdentifiers!,
                              niIndex,
                            )
                          "
                        />
                      </div>

                      <UFormField
                        :name="`creators.${cIndex}.nameIdentifiers.${niIndex}.schemeURI`"
                        label="Scheme URI"
                      >
                        <UInput
                          v-model="ni.schemeURI"
                          placeholder="https://orcid.org"
                          class="w-full"
                        />
                      </UFormField>
                    </div>

                    <UButton
                      size="sm"
                      class="mt-2 w-full"
                      color="success"
                      variant="outline"
                      label="Add Creator Identifier"
                      icon="i-lucide-plus"
                      @click="
                        state.creators[cIndex]?.nameIdentifiers?.push({
                          nameIdentifier: '',
                          nameIdentifierScheme: '',
                          schemeURI: '',
                        })
                      "
                    />
                  </div>

                  <div v-else>
                    <UButton
                      size="sm"
                      class="w-full"
                      color="success"
                      variant="outline"
                      label="Add Creator Identifier"
                      icon="i-lucide-plus"
                      @click="
                        state.creators[cIndex]?.nameIdentifiers?.push({
                          nameIdentifier: '',
                          nameIdentifierScheme: '',
                          schemeURI: '',
                        })
                      "
                    />
                  </div>
                </UFormField>

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
                      class="mb-2 space-y-2 rounded-xl border border-l-4 border-gray-200 border-l-pink-300 p-3 dark:border-l-pink-700"
                    >
                      <div class="flex gap-2">
                        <UFormField
                          class="w-full"
                          :name="`creators.${cIndex}.affiliation.${aIndex}.name`"
                          label="Name"
                          required
                        >
                          <UInput
                            v-model="affiliation.name"
                            placeholder="University of California, San Diego"
                          />
                        </UFormField>

                        <UButton
                          class="mt-6"
                          size="sm"
                          color="error"
                          variant="outline"
                          icon="i-lucide-trash"
                          @click="
                            removeRow(
                              state.creators[cIndex]?.affiliation!,
                              aIndex,
                            )
                          "
                        />
                      </div>

                      <div class="grid gap-2 md:grid-cols-2">
                        <UFormField
                          :name="`creators.${cIndex}.affiliation.${aIndex}.affiliationIdentifier`"
                          label="Affiliation Identifier"
                        >
                          <UInput
                            v-model="affiliation.affiliationIdentifier"
                            placeholder="https://ror.org/0168r3w48"
                            @update:model-value="
                              (v) =>
                                handleAffiliationIdentifierInput(
                                  v,
                                  cIndex,
                                  aIndex,
                                )
                            "
                          />
                        </UFormField>

                        <UFormField
                          :name="`creators.${cIndex}.affiliation.${aIndex}.affiliationIdentifierScheme`"
                          label="Identifier Scheme"
                        >
                          <UInput
                            v-model="affiliation.affiliationIdentifierScheme"
                            placeholder="ROR"
                          />
                        </UFormField>
                      </div>

                      <UFormField
                        :name="`creators.${cIndex}.affiliation.${aIndex}.schemeURI`"
                        label="Scheme URI"
                      >
                        <UInput
                          v-model="affiliation.schemeURI"
                          placeholder="https://ror.org"
                          class="w-full"
                        />
                      </UFormField>
                    </div>

                    <UButton
                      size="sm"
                      class="mt-2 w-full"
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
                    placeholder="e.g., Association for Research in Vision and Ophthalmology Conference"
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
                  label="Conference Website"
                >
                  <UInput
                    v-model="state.conference.conferenceUri"
                    placeholder="https://www.arvo.org/annual-meeting"
                    type="url"
                  />
                </UFormField>

                <UFormField
                  name="conference.conferenceStartDate"
                  label="Conference dates"
                >
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="subtle"
                      icon="i-lucide-calendar"
                      class="w-full"
                    >
                      <template
                        v-if="
                          state.conference?.conferenceStartDate &&
                          state.conference?.conferenceEndDate
                        "
                      >
                        {{
                          df.format(
                            conferenceDateRange.start.toDate(
                              getLocalTimeZone(),
                            ),
                          )
                        }}
                        –
                        {{
                          df.format(
                            conferenceDateRange.end.toDate(getLocalTimeZone()),
                          )
                        }}
                      </template>

                      <template v-else>Pick a date range</template>
                    </UButton>

                    <template #content>
                      <UCalendar v-model="conferenceDateRange" range />
                    </template>
                  </UPopover>
                </UFormField>
              </div>
            </div>
          </CardCollapsibleContent>
        </div>
      </div>

      <div
        class="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm dark:border-violet-900 dark:bg-gray-900"
      >
        <div
          class="group cursor-pointer bg-violet-50 px-6 py-5 transition-colors select-none hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-950/60"
          :class="
            additionalInfoCollapsed
              ? ''
              : 'border-b border-violet-200 dark:border-violet-900'
          "
          @click="additionalInfoCollapsed = !additionalInfoCollapsed"
        >
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/60"
              >
                <UIcon
                  name="i-lucide-layers"
                  class="size-5 text-violet-600 dark:text-violet-400"
                />
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <h2
                    class="text-xl font-semibold text-gray-900 dark:text-white"
                  >
                    Additional Information
                  </h2>

                  <UBadge
                    label="Optional"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                </div>

                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Optional metadata. Providing more detail makes your poster
                  more FAIR.
                </p>
              </div>
            </div>

            <UIcon
              name="i-lucide-chevron-down"
              class="size-5 shrink-0 text-violet-500 transition-transform duration-200 dark:text-violet-400"
              :class="{ 'rotate-180': !additionalInfoCollapsed }"
            />
          </div>
        </div>

        <div
          class="transition-all duration-200 ease-in-out"
          :class="additionalInfoCollapsed ? 'hidden opacity-0' : 'opacity-100'"
        >
          <div class="space-y-6 px-6 py-6">
            <CardCollapsibleContent
              title="Poster Abstract"
              :collapse="false"
              description="Provide here your poster abstract exactly as submitted to the conference."
            >
              <UFormField name="submissionAbstract">
                <UTextarea
                  v-model="state.submissionAbstract"
                  class="w-full"
                  placeholder="Enter your poster abstract as submitted to the conference"
                />
              </UFormField>
            </CardCollapsibleContent>

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

                <!-- License moved to review/submit step (Zenodo flow) -->
                <UFormField v-if="false" name="license" label="License">
                  <USelect
                    v-model="state.license"
                    class="w-full"
                    :items="LICENSE_OPTIONS"
                    placeholder="Select a license"
                  />
                </UFormField>
              </div>
            </CardCollapsibleContent>

            <!-- Identifiers section hidden for now -->
            <CardCollapsibleContent
              v-if="false"
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
              title="Related Resources"
              :collapse="false"
              description="Links to related publications, datasets, or supplementary materials"
            >
              <div class="space-y-4">
                <div
                  v-for="(
                    relatedIdentifier, iIndex
                  ) in state.relatedIdentifiers"
                  :key="iIndex"
                  class="space-y-2 rounded-xl border border-l-4 border-gray-200 border-l-pink-300 p-4 dark:border-l-pink-700"
                >
                  <div class="flex items-start gap-3">
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
                          )?.label || 'https://doi.org/10.1038/sdata.2016.18'
                        "
                        @update:model-value="
                          (v) => {
                            if (!relatedIdentifier.relatedIdentifierType) {
                              const inferred = inferRelatedIdentifierType(
                                String(v),
                              );
                              if (inferred)
                                relatedIdentifier.relatedIdentifierType =
                                  inferred;
                            }
                          }
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

                    <UButton
                      class="mt-6 shrink-0"
                      size="sm"
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="outline"
                      @click="removeRow(state.relatedIdentifiers, iIndex)"
                    />
                  </div>

                  <UFormField
                    :name="`relatedIdentifiers.${iIndex}.relationType`"
                    label="Relation Type"
                    description="A=Your poster, B=The resource"
                    required
                  >
                    <USelect
                      v-model="relatedIdentifier.relationType"
                      class="w-full"
                      :items="RELATION_TYPE_OPTIONS"
                      placeholder="Select a relation type"
                    />
                  </UFormField>
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

            <CardCollapsibleContent
              title="Funding"
              :collapse="false"
              description="Grants and funding sources that supported this work"
            >
              <div class="space-y-4">
                <div
                  v-for="(funder, fIndex) in state.fundingReferences"
                  :key="fIndex"
                  class="space-y-3 rounded-xl border border-l-4 border-gray-200 border-l-pink-300 p-4 dark:border-l-pink-700"
                >
                  <div class="flex items-start justify-between gap-3">
                    <UFormField
                      :name="`fundingReferences.${fIndex}.funderName`"
                      label="Funder Name"
                      required
                      class="flex-1"
                    >
                      <UInput
                        v-model="funder.funderName"
                        placeholder="National Institutes of Health"
                      />
                    </UFormField>

                    <UButton
                      class="mt-6 shrink-0"
                      size="sm"
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="outline"
                      @click="removeRow(state.fundingReferences, fIndex)"
                    />
                  </div>

                  <div class="grid gap-3 md:grid-cols-2">
                    <UFormField
                      :name="`fundingReferences.${fIndex}.funderIdentifier`"
                      label="Funder Identifier"
                    >
                      <UInput
                        v-model="funder.funderIdentifier"
                        placeholder="https://ror.org/04xfq0f34"
                        @update:model-value="
                          (v) => handleFunderIdentifierInput(String(v), fIndex)
                        "
                      />
                    </UFormField>

                    <UFormField
                      :name="`fundingReferences.${fIndex}.funderIdentifierType`"
                      label="Identifier Type"
                    >
                      <USelect
                        v-model="funder.funderIdentifierType"
                        :items="FUNDER_IDENTIFIER_TYPE_OPTIONS"
                        placeholder="Select a type"
                        class="w-full"
                      />
                    </UFormField>
                  </div>

                  <UFormField
                    :name="`fundingReferences.${fIndex}.schemeUri`"
                    label="Scheme URI"
                  >
                    <UInput
                      v-model="funder.schemeUri"
                      placeholder="https://ror.org"
                      class="w-full"
                    />
                  </UFormField>

                  <div class="grid gap-3 md:grid-cols-3">
                    <UFormField
                      :name="`fundingReferences.${fIndex}.awardNumber`"
                      label="Award Number"
                    >
                      <UInput
                        v-model="funder.awardNumber"
                        placeholder="R01GM123456"
                      />
                    </UFormField>

                    <UFormField
                      :name="`fundingReferences.${fIndex}.awardTitle`"
                      label="Award Title"
                    >
                      <UInput
                        v-model="funder.awardTitle"
                        placeholder="Grant title"
                      />
                    </UFormField>

                    <UFormField
                      :name="`fundingReferences.${fIndex}.awardUri`"
                      label="Award URI"
                    >
                      <UInput
                        v-model="funder.awardUri"
                        placeholder="https://reporter.nih.gov/..."
                      />
                    </UFormField>
                  </div>
                </div>

                <UButton
                  icon="i-lucide-plus"
                  variant="outline"
                  color="primary"
                  class="w-full"
                  label="Add Funding Reference"
                  @click="
                    state.fundingReferences.push({
                      funderName: '',
                      funderIdentifier: '',
                      funderIdentifierType: undefined,
                      schemeUri: '',
                      awardNumber: '',
                      awardUri: '',
                      awardTitle: '',
                    })
                  "
                />
              </div>
            </CardCollapsibleContent>
          </div>
        </div>
      </div>

      <div
        class="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm dark:border-sky-900 dark:bg-gray-900"
      >
        <div
          class="group cursor-pointer bg-sky-50 px-6 py-5 transition-colors select-none hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-950/60"
          :class="
            posterContentCollapsed
              ? ''
              : 'border-b border-sky-200 dark:border-sky-900'
          "
          @click="posterContentCollapsed = !posterContentCollapsed"
        >
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/60"
              >
                <UIcon
                  name="i-lucide-file-text"
                  class="size-5 text-sky-600 dark:text-sky-400"
                />
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <h2
                    class="text-xl font-semibold text-gray-900 dark:text-white"
                  >
                    Poster Content
                  </h2>

                  <UBadge
                    label="Auto-extracted"
                    color="primary"
                    variant="subtle"
                    size="sm"
                  />
                </div>

                <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  This is content we extracted directly from your poster.
                </p>
              </div>
            </div>

            <UIcon
              name="i-lucide-chevron-down"
              class="size-5 shrink-0 text-sky-500 transition-transform duration-200 dark:text-sky-400"
              :class="{ 'rotate-180': !posterContentCollapsed }"
            />
          </div>
        </div>

        <div
          class="transition-all duration-200 ease-in-out"
          :class="posterContentCollapsed ? 'hidden opacity-0' : 'opacity-100'"
        >
          <div class="space-y-6 px-6 py-6">
            <CardCollapsibleContent
              title="Poster Content"
              :collapse="false"
              description="This is content we extracted directly from your poster."
            >
              <div class="space-y-4">
                <div
                  v-for="(section, sIndex) in state.posterContent?.sections ||
                  []"
                  :key="sIndex"
                  class="space-y-2 rounded-xl border border-l-4 border-gray-200 border-l-pink-300 p-4 dark:border-l-pink-700"
                >
                  <UFormField
                    :name="`posterContent.sections.${sIndex}.sectionTitle`"
                    label="Section Title"
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
                  class="space-y-2 rounded-xl border border-l-4 border-gray-200 border-l-pink-300 p-4 dark:border-l-pink-700"
                >
                  <UFormField
                    :name="`tableCaptions.${cIndex}.id`"
                    label="Table Identifier"
                    class="flex-1"
                  >
                    <UInput v-model="caption.id" placeholder="e.g., Table 1" />
                  </UFormField>

                  <UFormField
                    :name="`tableCaptions.${cIndex}.caption`"
                    label="Table Caption"
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
                  class="space-y-2 rounded-xl border border-l-4 border-gray-200 border-l-pink-300 p-4 dark:border-l-pink-700"
                >
                  <UFormField
                    :name="`imageCaptions.${cIndex}.id`"
                    label="Image Identifier"
                    class="flex-1"
                  >
                    <UInput v-model="caption.id" placeholder="e.g., Image 1" />
                  </UFormField>

                  <UFormField
                    :name="`imageCaptions.${cIndex}.caption`"
                    label="Image Caption"
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
      </div>

      <div class="flex gap-3">
        <UTooltip
          text="Save your progress without moving to the next step"
          class="flex-1"
        >
          <UButton
            :disabled="savingDraft || loading"
            :loading="savingDraft"
            class="w-full"
            variant="outline"
            icon="i-lucide-save"
            label="Save Changes"
            type="button"
            size="lg"
            @click="saveDraft"
          />
        </UTooltip>

        <UTooltip
          text="Save your changes and proceed to the publishing step"
          class="flex-1"
        >
          <UButton
            :disabled="loading || savingDraft"
            :loading="loading"
            class="w-full"
            variant="solid"
            icon="i-lucide-arrow-right"
            label="Save Changes and Continue"
            type="submit"
            size="lg"
          />
        </UTooltip>
      </div>
    </UForm>
  </div>
</template>
