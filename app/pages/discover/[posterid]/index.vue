<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import dayjs from "dayjs";
import licenses from "@/assets/data/licenses.json";

const route = useRoute();
const posterId = route.params.posterid as string;

const { loggedIn } = useUserSession();
const toast = useToast();

const { data: apiData, error } = await useFetch(`/api/discover/${posterId}`);

if (error.value) {
  console.error(error.value);
}

const api = apiData.value as any;
const conf = api?.conference;

const liked = ref(api?.liked ?? false);
const liking = ref(false);

const poster = ref({
  id: api?.id ?? posterId,
  title: api?.title ?? "Untitled Poster",
  description: api?.description ?? "",
  imageUrl:
    api?.imageUrl ||
    `https://api.dicebear.com/9.x/shapes/svg?seed=${api?.id ?? posterId}`,
  authors: (api?.creators ?? []).map((creator: any) => {
    const rawName: string = creator.name ?? "";
    const givenName =
      creator.givenName ??
      (rawName.includes(",")
        ? rawName.split(",")[1]?.trim()
        : rawName.split(" ")[0]) ??
      "";
    const familyName =
      creator.familyName ??
      (rawName.includes(",")
        ? rawName.split(",")[0]?.trim()
        : rawName.split(" ").slice(1).join(" ")) ??
      "";
    const affiliation =
      (typeof creator.affiliation?.[0] === "string"
        ? creator.affiliation[0]
        : creator.affiliation?.[0]?.name) ?? "";
    const orcid =
      creator.nameIdentifiers?.find(
        (ni: any) => ni.nameIdentifierScheme === "ORCID",
      )?.nameIdentifier ?? null;

    return { givenName, familyName, affiliation, orcid };
  }),
  publishedAt: api?.publishedAt ? new Date(api.publishedAt) : undefined,
  version: api?.version ?? null,
  doi: api?.doi ?? null,
  license: api?.license ?? null,
  publisher: api?.publisher ?? null,
  publicationYear: api?.publicationYear ?? null,
  language: api?.language ?? null,
  format: api?.format ?? null,
  size: api?.size ?? null,
  domain: api?.domain ?? null,
  keywords: api?.keywords ?? [],
  identifiers: (api?.identifiers ?? []) as any[],
  likes: api?.likes ?? 0,
  views: api?.views ?? 0,
  references: (api?.relatedIdentifiers ?? []).map((ri: any, index: number) => ({
    id: `ref-${index}`,
    title: ri.relatedIdentifier ?? `Related Resource ${index + 1}`,
    relationType: ri.relationType ?? "References",
    doi: ri.relatedIdentifier ?? "",
    url: ri.relatedIdentifier?.startsWith("http")
      ? ri.relatedIdentifier
      : ri.relatedIdentifier
        ? `https://doi.org/${ri.relatedIdentifier}`
        : "",
  })),
  funding: (api?.fundingReferences ?? []).map((f: any) => ({
    agency: f.funderName ?? "Unknown Funder",
    awardTitle: f.awardTitle ?? null,
    grantNumber: f.awardNumber ?? f.funderIdentifier ?? "",
    awardUri: f.awardUri ?? null,
  })),
  conference: {
    name: conf?.conferenceName ?? "",
    acronym: conf?.conferenceAcronym ?? "",
    year: conf?.conferenceYear ?? null,
    location: conf?.conferenceLocation ?? "",
    uri: conf?.conferenceUri ?? "",
    series: conf?.conferenceSeries ?? "",
    dates: {
      start: conf?.conferenceStartDate
        ? new Date(conf.conferenceStartDate)
        : undefined,
      end: conf?.conferenceEndDate
        ? new Date(conf.conferenceEndDate)
        : undefined,
    },
  },
});

const licenseInfo = computed(() => {
  if (!poster.value.license) return null;

  return licenses.find((l) => l.licenseId === poster.value.license) ?? null;
});

const languageDisplay = computed(() => {
  if (!poster.value.language) return null;
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(
        poster.value.language,
      ) ?? poster.value.language
    );
  } catch {
    return poster.value.language;
  }
});

const posterTitle = poster.value.title;
const posterDescription = (
  poster.value.description ||
  "View detailed information about this research poster."
).slice(0, 160);
const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent(posterTitle)}&description=${encodeURIComponent(posterDescription)}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: `${posterTitle} - Posters.science`,
  description: posterDescription,
  ogTitle: posterTitle,
  ogDescription: posterDescription,
  ogImage,
});

const handleLike = async () => {
  if (!loggedIn.value) {
    toast.add({
      title: "Sign in required",
      description: "You need to be signed in to like posters.",
      color: "warning",
    });

    return;
  }

  if (liking.value) return;

  liking.value = true;

  try {
    const result = await $fetch<{
      likes: number;
      liked: boolean;
    }>(`/api/poster/${poster.value.id}/like`, {
      method: "POST",
    });

    poster.value.likes = result.likes ?? poster.value.likes;
    liked.value = result.liked;
    window.umami?.track(result.liked ? "poster_liked" : "poster_unliked", {
      posterId: poster.value.id,
    });
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem updating your like.",
      color: "error",
    });
  } finally {
    liking.value = false;
  }
};
onMounted(() => {
  window.umami?.track("poster_viewed", { posterId: poster.value.id });
});

const tabItems = [
  {
    label: "Overview",
    icon: "fluent:clover-48-filled",
    slot: "overview",
  },
  {
    label: "References",
    icon: "ooui:reference",
    slot: "references",
  },
];
</script>

<template>
  <div>
    <div class="border-b border-gray-200">
      <UContainer class="py-6">
        <div class="flex flex-col items-start justify-between">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <UBadge
              v-if="poster.domain"
              color="neutral"
              variant="soft"
              size="lg"
              icon="heroicons:beaker"
            >
              {{ poster.domain }}
            </UBadge>

            <UPopover v-if="poster.conference.name" arrow mode="hover">
              <UBadge
                color="primary"
                variant="soft"
                size="lg"
                icon="heroicons:academic-cap"
              >
                {{ poster.conference.name }}
                {{ poster.conference.year ? poster.conference.year : "" }}
              </UBadge>

              <template #content>
                <p class="px-2 py-1 text-sm">
                  {{ poster.conference.name }}
                  <template v-if="poster.conference.location">
                    - {{ poster.conference.location }}
                  </template>
                </p>
              </template>
            </UPopover>

            <UBadge
              color="info"
              variant="soft"
              size="lg"
              icon="heroicons:heart"
            >
              {{
                new Intl.NumberFormat("en-US", { notation: "compact" }).format(
                  poster.likes || 0,
                )
              }}
              like{{ poster.likes === 1 ? "" : "s" }}
            </UBadge>

            <UBadge
              v-if="poster.views > 0"
              color="neutral"
              variant="soft"
              size="lg"
              icon="heroicons:eye"
            >
              {{
                new Intl.NumberFormat("en-US", { notation: "compact" }).format(
                  poster.views,
                )
              }}
              view{{ poster.views === 1 ? "" : "s" }}
            </UBadge>
          </div>

          <div class="mt-1 mb-2 flex items-baseline gap-3">
            <h1 class="text-3xl font-bold">{{ poster.title }}</h1>
          </div>

          <div
            v-if="poster.keywords.length > 0"
            class="mb-4 flex flex-wrap items-center gap-1.5"
          >
            <span class="text-sm text-gray-400">Keywords:</span>

            <UBadge
              v-for="keyword in poster.keywords"
              :key="keyword"
              color="primary"
              variant="soft"
              size="md"
              class="capitalize"
            >
              {{ keyword }}
            </UBadge>
          </div>

          <div class="flex items-center gap-2">
            <NuxtLink
              v-if="poster.doi"
              :to="`https://doi.org/${poster.doi}`"
              target="_blank"
            >
              <UButton
                color="primary"
                variant="solid"
                icon="heroicons:eye"
                size="lg"
              >
                View Poster
              </UButton>
            </NuxtLink>

            <UButton
              :color="liked ? 'error' : 'neutral'"
              :variant="liked ? 'solid' : 'outline'"
              icon="heroicons:heart"
              size="lg"
              :disabled="!loggedIn"
              :loading="liking"
              @click="handleLike"
            >
              {{ liked ? "Liked" : "Like" }}
            </UButton>

            <UButton
              color="neutral"
              variant="outline"
              icon="heroicons:share"
              size="lg"
              disabled
            >
              Share
            </UButton>
          </div>
        </div>
      </UContainer>
    </div>

    <UContainer class="py-8">
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div class="space-y-8 lg:col-span-2">
          <UTabs :items="tabItems" variant="link">
            <template #overview>
              <div class="mt-4 flex flex-col gap-4">
                <UCard v-if="poster.conference.name">
                  <template #header>
                    <div class="flex items-center gap-2">
                      <Icon name="heroicons:academic-cap" class="h-5 w-5" />

                      <h2 class="text-xl font-semibold">
                        Conference Information
                      </h2>
                    </div>
                  </template>

                  <div class="space-y-2 text-sm">
                    <h3 class="mb-3 font-semibold">
                      {{ poster.conference.name }}
                    </h3>

                    <div
                      v-if="poster.conference.acronym"
                      class="flex items-center gap-2"
                    >
                      <Icon
                        name="heroicons:tag"
                        class="h-4 w-4 shrink-0 text-gray-400"
                      />

                      <span class="text-gray-500">Acronym:</span>

                      <span class="font-medium">{{
                        poster.conference.acronym
                      }}</span>
                    </div>

                    <div
                      v-if="poster.conference.series"
                      class="flex items-center gap-2"
                    >
                      <Icon
                        name="heroicons:rectangle-stack"
                        class="h-4 w-4 shrink-0 text-gray-400"
                      />

                      <span class="text-gray-500">Series:</span>

                      <span class="font-medium">{{
                        poster.conference.series
                      }}</span>
                    </div>

                    <div
                      v-if="poster.conference.year != null"
                      class="flex items-center gap-2"
                    >
                      <Icon
                        name="heroicons:calendar"
                        class="h-4 w-4 shrink-0 text-gray-400"
                      />

                      <span class="text-gray-500">Year:</span>

                      <span class="font-medium">{{
                        poster.conference.year
                      }}</span>
                    </div>

                    <div
                      v-if="poster.conference.location"
                      class="flex items-center gap-2"
                    >
                      <Icon
                        name="heroicons:map-pin"
                        class="h-4 w-4 shrink-0 text-gray-400"
                      />

                      <span class="text-gray-500">Location:</span>

                      <span class="font-medium">{{
                        poster.conference.location
                      }}</span>
                    </div>

                    <div
                      v-if="
                        poster.conference.dates.start ||
                        poster.conference.dates.end
                      "
                      class="flex items-center gap-2"
                    >
                      <Icon
                        name="heroicons:calendar-days"
                        class="h-4 w-4 shrink-0 text-gray-400"
                      />

                      <span class="text-gray-500">Dates:</span>

                      <span class="font-medium">
                        <template v-if="poster.conference.dates.start">
                          {{
                            dayjs(poster.conference.dates.start).format("MMM D")
                          }}
                        </template>

                        <template
                          v-if="
                            poster.conference.dates.start &&
                            poster.conference.dates.end
                          "
                        >
                          -
                        </template>

                        <template v-if="poster.conference.dates.end">
                          {{
                            dayjs(poster.conference.dates.end).format(
                              "MMM D, YYYY",
                            )
                          }}
                        </template>
                      </span>
                    </div>

                    <div
                      v-if="poster.conference.uri"
                      class="flex items-center gap-2"
                    >
                      <Icon
                        name="heroicons:link"
                        class="h-4 w-4 shrink-0 text-gray-400"
                      />

                      <span class="text-gray-500">Website:</span>

                      <a
                        :href="poster.conference.uri"
                        target="_blank"
                        class="font-medium text-blue-600 hover:underline"
                      >
                        {{ poster.conference.uri }}
                      </a>
                    </div>
                  </div>
                </UCard>

                <UCard>
                  <template #header>
                    <h2 class="text-xl font-semibold">Description</h2>
                  </template>

                  <div class="max-w-none">
                    <p class="whitespace-pre-line">{{ poster.description }}</p>
                  </div>
                </UCard>

                <UCard v-if="poster.identifiers.length > 0">
                  <template #header>
                    <h2 class="text-xl font-semibold">Identifiers</h2>
                  </template>

                  <div class="space-y-2">
                    <div
                      v-for="(identifier, index) in poster.identifiers"
                      :key="index"
                      class="flex items-center gap-2 text-sm"
                    >
                      <UBadge color="neutral" variant="soft" size="sm">
                        {{ identifier.identifierType }}
                      </UBadge>

                      <span class="font-mono text-gray-700">
                        {{ identifier.identifier }}
                      </span>

                      <NuxtLink
                        v-if="identifier.identifierType === 'DOI'"
                        :to="
                          identifier.identifierType === 'DOI'
                            ? `https://doi.org/${identifier.identifier}`
                            : identifier.url
                        "
                        target="_blank"
                      >
                        <UIcon
                          name="gridicons:external"
                          class="flex items-center justify-center"
                        />
                      </NuxtLink>
                    </div>
                  </div>
                </UCard>

                <UCard v-if="poster.funding.length > 0">
                  <template #header>
                    <h2 class="text-xl font-semibold">Funding Information</h2>
                  </template>

                  <div class="space-y-3">
                    <div
                      v-for="fund in poster.funding"
                      :key="fund.grantNumber"
                      class="border-l-4 border-blue-500 pl-4"
                    >
                      <p class="font-medium">{{ fund.agency }}</p>

                      <p
                        v-if="fund.awardTitle"
                        class="text-sm font-medium text-gray-700"
                      >
                        {{ fund.awardTitle }}
                      </p>

                      <p v-if="fund.grantNumber" class="text-sm text-gray-600">
                        Grant: {{ fund.grantNumber }}
                      </p>

                      <a
                        v-if="fund.awardUri"
                        :href="fund.awardUri"
                        target="_blank"
                        class="text-xs text-blue-600 hover:underline"
                      >
                        Award details
                      </a>
                    </div>
                  </div>
                </UCard>
              </div>
            </template>

            <template #references>
              <div>
                <UCard v-if="poster.references.length > 0" class="mt-4">
                  <div
                    v-for="ref in poster.references"
                    :key="ref.id"
                    class="mb-3 border-l-4 border-gray-200 pl-4"
                  >
                    <UBadge color="primary" variant="soft">
                      {{ ref.relationType }}
                    </UBadge>

                    <p class="mt-1 text-sm">
                      <a
                        :href="ref.url"
                        class="font-medium text-blue-600 hover:underline"
                        target="_blank"
                      >
                        {{ ref.doi }}
                      </a>
                    </p>
                  </div>
                </UCard>

                <UEmpty
                  v-else
                  class="mt-4"
                  icon="i-lucide-file"
                  title="No references found"
                  description="This poster has no related resources."
                />
              </div>
            </template>
          </UTabs>
        </div>

        <div class="flex flex-col gap-4">
          <UCard>
            <template #header>
              <h3 class="text-lg font-semibold">Authors</h3>
            </template>

            <div class="space-y-3">
              <div
                v-for="(author, index) in poster.authors"
                :key="index"
                class="border-l-4 border-blue-500 pl-3"
              >
                <p class="font-medium">
                  {{ author.givenName }} {{ author.familyName }}
                </p>

                <p v-if="author.affiliation" class="text-sm text-gray-600">
                  {{ author.affiliation }}
                </p>

                <p v-if="author.orcid" class="text-xs text-gray-500">
                  ORCID: {{ author.orcid }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="text-lg font-semibold">Additional Information</h3>
            </template>

            <div class="space-y-3 text-sm">
              <div v-if="languageDisplay" class="flex flex-col gap-0.5">
                <span
                  class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                  >Language</span
                >

                <span class="font-medium text-gray-700">{{
                  languageDisplay
                }}</span>
              </div>

              <div v-if="poster.format" class="flex flex-col gap-0.5">
                <span
                  class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                  >Format</span
                >

                <span class="font-medium text-gray-700">{{
                  poster.format
                }}</span>
              </div>

              <div v-if="poster.size" class="flex flex-col gap-0.5">
                <span
                  class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                  >Size</span
                >

                <span class="font-medium text-gray-700">{{ poster.size }}</span>
              </div>

              <div v-if="poster.version" class="flex flex-col gap-0.5">
                <span
                  class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                  >Version</span
                >

                <span class="font-medium text-gray-700">{{
                  poster.version
                }}</span>
              </div>

              <div v-if="poster.license" class="flex flex-col gap-0.5">
                <span
                  class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                  >License</span
                >

                <div class="flex flex-row gap-2">
                  <span class="font-medium text-gray-700">{{
                    licenseInfo?.name ?? poster.license
                  }}</span>

                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <UBadge
                      v-if="licenseInfo?.isOsiApproved"
                      color="success"
                      variant="soft"
                      size="md"
                      icon="heroicons:check-circle"
                    >
                      OSI Approved
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </UContainer>
  </div>
</template>
