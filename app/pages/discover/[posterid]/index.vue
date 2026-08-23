<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import licenses from "@/assets/data/licenses.json";
import notFoundAnimation from "@/assets/animations/404-not-found.json";
import {
  RESOURCE_TYPE_OPTIONS,
  RELATION_TYPE_OPTIONS,
} from "@/utils/poster_schema";
import { resolveDoiUrl } from "@/utils/doi";
import type { WithContext, ScholarlyArticle } from "schema-dts";

const route = useRoute();
const posterId = route.params.posterid as string;

const { loggedIn } = useUserSession();
const toast = useToast();

const versionQuery = Array.isArray(route.query.version)
  ? route.query.version[0]
  : route.query.version;
const { data: apiData, error } = await useFetch(
  `/api/discover/${posterId}${versionQuery ? `?version=${encodeURIComponent(versionQuery)}` : ""}`,
);

if (error.value) {
  console.error(error.value);
  useSeoMeta({
    title: "Poster Not Found - Posters.science",
    description:
      "The requested poster could not be found or has not been indexed.",
    ogTitle: "Poster Not Found - Posters.science",
    ogDescription:
      "The requested poster could not be found or has not been indexed.",
  });
}

const api = apiData.value as any;
const conf = api?.conference;
const versionHistory = (api?.versions ?? []) as Array<{
  versionSequence: number;
  publishedAt?: string | null;
  posterMetadata?: { version?: string | null; doi?: string | null } | null;
}>;

function historyVersionLabel(entry: (typeof versionHistory)[number]) {
  return (
    entry.posterMetadata?.version?.trim() ||
    (api?.automated ? "Unspecified" : String(entry.versionSequence))
  );
}

function historyVersionUrl(entry: (typeof versionHistory)[number]) {
  // The API resolves this as public metadata first, then as the internal
  // sequence for older entries that do not have a public version label.
  const version =
    entry.posterMetadata?.version?.trim() || String(entry.versionSequence);

  return `/discover/${posterId}?version=${encodeURIComponent(version)}`;
}

const liked = ref(api?.liked ?? false);

const liking = ref(false);

const getDicebearUrl = (seed: string) =>
  `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}`;

const relatedIdentifierUrl = (relatedIdentifier: {
  relatedIdentifier?: string;
  relatedIdentifierType?: string;
}) => {
  const identifier = relatedIdentifier.relatedIdentifier?.trim();
  if (!identifier) return "";
  if (/^https?:\/\//i.test(identifier)) return identifier;
  if (relatedIdentifier.relatedIdentifierType === "DOI") {
    return resolveDoiUrl(identifier);
  }

  return "";
};

const onImageError = (event: Event, seed: string) => {
  const img = event.target as HTMLImageElement;
  const fallbackUrl = getDicebearUrl(seed);

  if (img.src === fallbackUrl) return;

  img.src = fallbackUrl;
};

const poster = ref({
  id: api?.id ?? posterId,
  automated: api?.automated ?? false,
  citations: (api?.relatedIdentifiers ?? []).filter(
    (ri: any) => ri.relationType === "Cites",
  ),
  title: api?.title ?? "Untitled Poster",
  description: api?.description ?? "",
  imageUrl: api?.imageUrl || getDicebearUrl(api?.id ?? posterId),
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
  submissionAbstract: api?.submissionAbstract ?? null,
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
    resourceType:
      RESOURCE_TYPE_OPTIONS.find((rt) => rt.value === ri.resourceTypeGeneral)
        ?.label ?? "Other",
    relationType:
      RELATION_TYPE_OPTIONS.find((rt) => rt.value === ri.relationType)?.label ??
      ri.relationType ??
      "References",
    doi: ri.relatedIdentifier ?? "",
    url: relatedIdentifierUrl(ri),
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
      start: conf?.conferenceStartDate ?? null,
      end: conf?.conferenceEndDate ?? null,
    },
  },
});

const resolvedPosterUrl = computed(() => {
  if (!poster.value.doi) return null;

  return resolveDoiUrl(poster.value.doi);
});

const posterSource = computed(() => {
  if (!poster.value.automated) return null;
  const doi = poster.value.doi ?? "";
  const imageUrl = api?.imageUrl ?? "";
  if (doi.startsWith("10.6084/") || imageUrl.includes("/figshare_"))
    return "figshare";

  return "zenodo";
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

const conferenceDateDisplay = computed(() =>
  formatConferenceDateRange(
    poster.value.conference.dates.start,
    poster.value.conference.dates.end,
  ),
);

const discoverUrl = computed(() =>
  poster.value?.id
    ? `https://posters.science/discover/${poster.value.id}`
    : null,
);

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

// Recursively removes `undefined`, `null`, and empty array values from a schema object to eliminate noise in the structured data output.
const cleanSchema = (value: any): any => {
  if (Array.isArray(value)) {
    const filtered = value
      .map(cleanSchema)
      .filter(
        (v) =>
          v !== undefined &&
          v !== null &&
          !(Array.isArray(v) && v.length === 0),
      );

    return filtered.length > 0 ? filtered : undefined;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, cleanSchema(v)])
        .filter(
          ([, v]) =>
            v !== undefined &&
            v !== null &&
            !(Array.isArray(v) && v.length === 0),
        ),
    );
  }

  return value;
};

const citationIdentifiers = poster.value?.citations?.length
  ? poster.value.citations.map((citation: any) => citation.relatedIdentifier)
  : undefined;

const NuxtSchemaPoster: WithContext<ScholarlyArticle> = {
  "@context": "https://schema.org",
  "@id": resolvedPosterUrl.value || undefined,
  "@type": "ScholarlyArticle",
  about: poster.value?.domain
    ? {
        "@type": "Thing",
        name: poster.value.domain,
      }
    : undefined,
  abstract: poster.value?.submissionAbstract || undefined,
  author: poster.value?.authors?.length
    ? poster.value.authors.map((author: any) => ({
        "@type": "Person",
        givenName: author.givenName,
        familyName: author.familyName,
        affiliation: author.affiliation
          ? {
              "@type": "Organization",
              name: author.affiliation,
            }
          : undefined,
        sameAs: author.orcid || undefined,
      }))
    : undefined,
  citation: citationIdentifiers,
  datePublished: poster.value?.publishedAt?.toISOString() || undefined,
  description: poster.value?.description || undefined,
  funder: poster.value.funding?.length
    ? poster.value.funding.map((f: any) => ({
        "@type": "Organization",
        name: f.agency,
        url: f.awardUri || undefined,
      }))
    : undefined,
  headline: poster.value?.title || undefined,
  identifier: resolvedPosterUrl.value || undefined,
  image: poster.value?.imageUrl
    ? {
        "@type": "ImageObject",
        url: poster.value.imageUrl,
        contentUrl: poster.value.imageUrl,
      }
    : undefined,
  inLanguage: poster.value?.language || "en",
  interactionStatistic: [
    {
      "@type": "InteractionCounter",
      interactionType: { "@type": "LikeAction" },
      userInteractionCount: poster.value.likes,
    },
    {
      "@type": "InteractionCounter",
      interactionType: { "@type": "ViewAction" },
      userInteractionCount: poster.value.views,
    },
  ],
  keywords: poster.value?.keywords?.length ? poster.value.keywords : undefined,
  license: licenseInfo.value?.reference || undefined,
  publisher: poster.value?.publisher
    ? { "@type": "Organization", name: poster.value.publisher }
    : undefined,
  mainEntityOfPage: discoverUrl.value || undefined,
  name: poster.value?.title || undefined,
  url: discoverUrl.value || undefined,
  version: poster.value?.version || undefined,
};

useSchemaOrg([cleanSchema(NuxtSchemaPoster)]);

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
  ...(versionHistory.length > 1
    ? [
        {
          label: "Versions",
          icon: "i-lucide-history",
          slot: "versions",
        },
      ]
    : []),
  {
    label: "Related resources",
    icon: "ooui:reference",
    slot: "references",
  },
];
</script>

<template>
  <div>
    <div
      v-if="error"
      class="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-screen-sm flex-col items-center justify-center gap-8 px-6 pt-4 pb-16 text-center"
    >
      <Vue3Lottie
        :animation-data="notFoundAnimation"
        :height="500"
        :width="500"
        :loop="true"
      />

      <div class="flex flex-col gap-3">
        <h1 class="text-4xl font-bold">Poster Not Found</h1>

        <p class="text-muted max-w-lg text-base">
          The poster ID
          <code
            class="rounded bg-gray-100 px-1.5 py-0.5 font-mono dark:bg-gray-800"
            >{{ posterId }}</code
          >
          doesn't exist or hasn't been indexed yet. If you followed a link, the
          poster may have been removed or the URL may be incorrect.
        </p>
      </div>

      <div class="flex gap-4">
        <UButton
          color="primary"
          size="xl"
          to="/discover"
          icon="i-lucide-search"
        >
          Browse Posters
        </UButton>

        <UButton variant="outline" size="xl" to="/" icon="i-lucide-house">
          Go Home
        </UButton>
      </div>
    </div>

    <template v-else>
      <div class="border-b border-gray-200">
        <UContainer class="py-6">
          <div class="grid w-full grid-cols-12 gap-6">
            <div
              class="col-span-12 flex flex-col items-start gap-3 sm:col-span-9"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UTooltip
                  v-if="poster.publishedAt"
                  :text="`Published on ${new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(poster.publishedAt))}`"
                >
                  <UBadge
                    color="secondary"
                    variant="soft"
                    size="md"
                    class="cursor-help"
                    icon="material-symbols:publish"
                  >
                    {{
                      new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                      }).format(new Date(poster.publishedAt))
                    }}
                  </UBadge>
                </UTooltip>

                <UBadge
                  v-if="poster.domain"
                  color="neutral"
                  variant="soft"
                  size="lg"
                  icon="heroicons:beaker"
                >
                  {{ poster.domain }}
                </UBadge>

                <UPopover v-if="poster.conference.acronym" arrow mode="hover">
                  <UBadge
                    color="primary"
                    variant="soft"
                    size="lg"
                    icon="heroicons:academic-cap"
                    class="cursor-help"
                  >
                    {{ poster.conference.acronym }}
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
                    new Intl.NumberFormat("en-US", {
                      notation: "compact",
                    }).format(poster.likes || 0)
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
                    new Intl.NumberFormat("en-US", {
                      notation: "compact",
                    }).format(poster.views)
                  }}
                  view{{ poster.views === 1 ? "" : "s" }}
                </UBadge>

                <UTooltip
                  v-if="poster.automated && posterSource"
                  :text="`Automatically indexed from ${posterSource === 'zenodo' ? 'Zenodo' : 'Figshare'}.`"
                >
                  <UBadge
                    color="primary"
                    variant="solid"
                    size="md"
                    icon="i-lucide-sparkles"
                    class="cursor-help"
                  >
                    Auto-indexed
                  </UBadge>
                </UTooltip>
              </div>

              <div class="flex items-baseline gap-3">
                <h1 class="text-3xl font-bold">{{ poster.title }}</h1>
              </div>

              <div
                v-if="poster.keywords.length > 0"
                class="flex flex-wrap items-center gap-1.5"
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
                  v-if="resolvedPosterUrl"
                  :to="resolvedPosterUrl"
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

            <div
              v-if="
                poster.imageUrl && poster.imageUrl.search('dicebear') === -1
              "
              class="hidden sm:col-span-3 sm:flex sm:items-start sm:justify-center"
            >
              <NuxtLink
                v-if="resolvedPosterUrl"
                :to="resolvedPosterUrl"
                target="_blank"
              >
                <img
                  :src="poster.imageUrl"
                  alt="Poster thumbnail"
                  class="max-h-64 w-full rounded-lg object-contain shadow-sm transition-all hover:shadow-lg"
                  @error="onImageError($event, poster.id)"
                />
              </NuxtLink>
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
                  <UCard>
                    <template #header>
                      <h2 class="text-xl font-semibold">Description</h2>
                    </template>

                    <div class="max-w-none">
                      <p class="whitespace-pre-line">
                        {{ poster.description }}
                      </p>
                    </div>
                  </UCard>

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

                        <span class="text-gray-500 dark:text-gray-400"
                          >Year:</span
                        >

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
                        v-if="conferenceDateDisplay"
                        class="flex items-center gap-2"
                      >
                        <Icon
                          name="heroicons:calendar-days"
                          class="h-4 w-4 shrink-0 text-gray-400"
                        />

                        <span class="text-gray-500">Dates:</span>

                        <span class="font-medium">
                          {{ conferenceDateDisplay }}
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

                        <span
                          class="font-mono text-gray-700 dark:text-gray-300"
                        >
                          {{ identifier.identifier }}
                        </span>

                        <NuxtLink
                          v-if="identifier.identifierType === 'DOI'"
                          :to="
                            identifier.identifierType === 'DOI'
                              ? resolveDoiUrl(identifier.identifier)
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
                          class="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {{ fund.awardTitle }}
                        </p>

                        <p
                          v-if="fund.grantNumber"
                          class="text-sm text-gray-600 dark:text-gray-400"
                        >
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

              <template #versions>
                <UCard class="mt-4">
                  <template #header>
                    <h2 class="text-xl font-semibold">Version History</h2>
                  </template>

                  <div class="space-y-2">
                    <a
                      v-for="entry in versionHistory"
                      :key="entry.versionSequence"
                      :href="historyVersionUrl(entry)"
                      class="border-default hover:bg-elevated flex items-center justify-between rounded-lg border px-3 py-3 text-sm"
                    >
                      <span class="font-medium">
                        Version
                        {{ historyVersionLabel(entry) }}
                      </span>

                      <UBadge
                        :color="
                          entry.versionSequence === api?.versionSequence
                            ? 'primary'
                            : 'neutral'
                        "
                        variant="soft"
                      >
                        {{
                          entry.versionSequence === api?.versionSequence
                            ? "Viewing"
                            : entry.publishedAt
                              ? new Intl.DateTimeFormat("en-US", {
                                  dateStyle: "medium",
                                }).format(new Date(entry.publishedAt))
                              : "Published"
                        }}
                      </UBadge>
                    </a>
                  </div>
                </UCard>
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

                      <UBadge color="secondary" variant="soft" class="ml-3">
                        {{ ref.resourceType }}
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

                  <p
                    v-if="author.affiliation"
                    class="text-sm text-gray-600 dark:text-gray-400"
                  >
                    {{ author.affiliation }}
                  </p>

                  <p
                    v-if="author.orcid"
                    class="text-xs text-gray-500 dark:text-gray-400"
                  >
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

                  <span class="font-medium text-gray-700 dark:text-gray-300">{{
                    languageDisplay
                  }}</span>
                </div>

                <div v-if="poster.format" class="flex flex-col gap-0.5">
                  <span
                    class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                    >Format</span
                  >

                  <span class="font-medium text-gray-700 dark:text-gray-300">{{
                    poster.format
                  }}</span>
                </div>

                <div v-if="poster.size" class="flex flex-col gap-0.5">
                  <span
                    class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                    >Size</span
                  >

                  <span class="font-medium text-gray-700 dark:text-gray-300">{{
                    poster.size
                  }}</span>
                </div>

                <div v-if="poster.version" class="flex flex-col gap-0.5">
                  <span
                    class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                    >Version</span
                  >

                  <span class="font-medium text-gray-700 dark:text-gray-300">{{
                    poster.version
                  }}</span>
                </div>

                <div v-if="poster.license" class="flex flex-col gap-0.5">
                  <span
                    class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                    >License</span
                  >

                  <div class="flex flex-row gap-2">
                    <span
                      class="font-medium text-gray-700 dark:text-gray-300"
                      >{{ licenseInfo?.name ?? poster.license }}</span
                    >

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

                <div
                  v-if="poster.automated && posterSource"
                  class="flex flex-col gap-0.5"
                >
                  <span
                    class="text-xs font-medium tracking-wide text-gray-400 uppercase"
                    >Indexed from</span
                  >

                  <a
                    :href="
                      posterSource === 'zenodo'
                        ? 'https://zenodo.org'
                        : 'https://figshare.com'
                    "
                    target="_blank"
                    class="font-medium text-blue-600 hover:underline"
                  >
                    {{ posterSource === "zenodo" ? "Zenodo" : "Figshare" }}
                  </a>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UContainer>
    </template>
  </div>
</template>
