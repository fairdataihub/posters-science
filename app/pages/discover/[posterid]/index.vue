<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
import dayjs from "dayjs";

// Get the poster ID from the route
const route = useRoute();
const posterId = route.params.posterid as string;

const { loggedIn } = useUserSession();
const toast = useToast();

useSeoMeta({
  title: "Poster Details",
  description: "View detailed information about this research poster.",
});

const { data: apiData, error } = await useFetch(`/api/discover/${posterId}`);

if (error.value) {
  console.error(error.value);
}

const api = apiData.value as any;
const conf = api?.conference;

const liked = ref(false);
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
  created: api?.created ? new Date(api.created) : undefined,
  version: api?.version ?? null,
  doi: api?.doi ?? null,
  license: api?.license ?? null,
  keywords: api?.keywords ?? [],
  views: 0,
  citations: 0,
  shares: 0,
  likes: 0,
  relatedItems: [] as any[],
  references: (api?.relatedIdentifiers ?? []).map((ri: any, index: number) => ({
    id: `ref-${index}`,
    title: ri.relatedIdentifier ?? `Related Resource ${index + 1}`,
    relationType: ri.relationType ?? "References",
    authors: "",
    journal: "",
    year: null as number | null,
    doi: ri.relatedIdentifier ?? "",
    url: ri.relatedIdentifier?.startsWith("http")
      ? ri.relatedIdentifier
      : ri.relatedIdentifier
        ? `https://doi.org/${ri.relatedIdentifier}`
        : "",
  })),
  funding: (api?.fundingReferences ?? []).map((f: any) => ({
    agency: f.funderName ?? "Unknown Funder",
    grantNumber: f.awardNumber ?? f.funderIdentifier ?? "",
  })),
  acknowledgments: "",
  conference: {
    name: conf?.conferenceName ?? "",
    acronym: conf?.conferenceAcronym ?? "",
    year: conf?.conferenceYear ?? null,
    location: conf?.conferenceLocation ?? "",
    venue: "",
    dates: {
      start: conf?.conferenceStartDate
        ? new Date(conf.conferenceStartDate)
        : undefined,
      end: conf?.conferenceEndDate
        ? new Date(conf.conferenceEndDate)
        : undefined,
    },
    session: "",
  },
});

const { data: likesData } = await useFetch<{ likes: number; liked: boolean }>(
  `/api/discover/${posterId}/like`,
);

if (likesData.value) {
  liked.value = likesData.value.liked;
  poster.value.likes = likesData.value.likes;
}

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
  {
    label: "Related Items",
    icon: "tdesign:relativity",
    slot: "related",
  },
];
</script>

<template>
  <div>
    <div class="border-b border-gray-200">
      <UContainer class="py-6">
        <div class="flex flex-col items-start justify-between">
          <div class="flex items-center gap-3">
            <UPopover arrow mode="hover">
              <UBadge
                color="primary"
                variant="soft"
                size="lg"
                icon="heroicons:academic-cap"
              >
                {{ poster.conference.name }} {{ poster.conference.year }}
              </UBadge>

              <template #content>
                <p class="px-2 py-1 text-sm">
                  {{ poster.conference.name }}
                  {{ poster.conference.venue }} -
                  {{ poster.conference.location }}
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

            <UBadge color="info" variant="soft" size="lg" icon="heroicons:eye">
              {{
                new Intl.NumberFormat("en-US", { notation: "compact" }).format(
                  poster.views || 0,
                )
              }}
              views
            </UBadge>
          </div>

          <h1 class="mt-1 mb-2 text-3xl font-bold">
            {{ poster.title }}
          </h1>

          <div class="mb-2 flex items-center gap-4 text-sm">
            <span class="flex items-center gap-1">
              <Icon name="heroicons:eye" class="h-4 w-4" />
              {{ poster.views.toLocaleString() }} views
            </span>

            <span class="flex items-center gap-1">
              <Icon name="heroicons:heart" class="h-4 w-4" />
              {{ poster.likes }} likes
            </span>
          </div>

          <div class="mb-4 flex items-center gap-2 text-sm">
            <span v-if="poster.doi"> DOI: {{ poster.doi }} </span>

            <span v-if="poster.doi">•</span>

            <span v-if="poster.publishedAt">
              Published {{ dayjs(poster.publishedAt).format("MMM D, YYYY") }}
            </span>

            <span v-if="poster.version">•</span>

            <span v-if="poster.version"> Version {{ poster.version }} </span>
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
                <UCard>
                  <template #header>
                    <div class="flex items-center gap-2">
                      <Icon name="heroicons:academic-cap" class="h-5 w-5" />

                      <h2 class="text-xl font-semibold">
                        Conference Information
                      </h2>
                    </div>
                  </template>

                  <div class="space-y-4">
                    <div class="flex flex-col gap-4">
                      <h3 class="mb-1 font-semibold">
                        {{ poster.conference.name }}
                      </h3>

                      <div class="space-y-2 text-sm">
                        <div
                          v-if="poster.conference.acronym"
                          class="flex items-center gap-2"
                        >
                          <Icon name="heroicons:academic-cap" class="h-4 w-4" />

                          <span class="">Acronym:</span>

                          <span class="font-medium">{{
                            poster.conference.acronym
                          }}</span>
                        </div>

                        <div class="space-y-2 text-sm">
                          <div
                            v-if="poster.conference.year != null"
                            class="flex items-center gap-2"
                          >
                            <Icon name="heroicons:calendar" class="h-4 w-4" />

                            <span class="">Year:</span>

                            <span class="font-medium">{{
                              poster.conference.year
                            }}</span>
                          </div>

                          <div
                            v-if="poster.conference.venue"
                            class="flex items-center gap-2"
                          >
                            <Icon
                              name="heroicons:building-office"
                              class="h-4 w-4"
                            />

                            <span class="">Venue:</span>

                            <span class="font-medium">{{
                              poster.conference.venue
                            }}</span>
                          </div>

                          <div
                            v-if="poster.conference.location"
                            class="flex items-center gap-2"
                          >
                            <Icon name="heroicons:map-pin" class="h-4 w-4" />

                            <span class="">Location:</span>

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
                            <Icon name="heroicons:calendar" class="h-4 w-4" />

                            <span class="">Dates:</span>

                            <span class="font-medium">
                              {{
                                dayjs(poster.conference.dates.start).format(
                                  "MMM D",
                                )
                              }}
                              -
                              {{
                                dayjs(poster.conference.dates.end).format(
                                  "MMM D, YYYY",
                                )
                              }}
                            </span>
                          </div>

                          <div
                            v-if="poster.conference.session"
                            class="flex items-center gap-2"
                          >
                            <Icon
                              name="heroicons:presentation-chart-bar"
                              class="h-4 w-4"
                            />

                            <span class="">Session:</span>

                            <span class="font-medium">{{
                              poster.conference.session
                            }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div></UCard
                >

                <UCard>
                  <template #header>
                    <h2 class="text-xl font-semibold">Description</h2>
                  </template>

                  <div class="max-w-none">
                    <p class="whitespace-pre-line">{{ poster.description }}</p>
                  </div>
                </UCard>

                <UCard>
                  <template #header>
                    <h2 class="text-xl font-semibold">Keywords</h2>
                  </template>

                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="keyword in poster.keywords"
                      :key="keyword"
                      color="primary"
                      variant="soft"
                      size="lg"
                      class="capitalize"
                    >
                      {{ keyword }}
                    </UBadge>
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

                      <p class="text-sm">Grant: {{ fund.grantNumber }}</p>
                    </div>
                  </div>
                </UCard>

                <UCard v-if="poster.acknowledgments">
                  <template #header>
                    <h2 class="text-xl font-semibold">Acknowledgments</h2>
                  </template>

                  <p>{{ poster.acknowledgments }}</p>
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

                    <p class="font-medium">{{ ref.title }}</p>

                    <p class="text-sm">{{ ref.authors }}</p>

                    <p class="text-sm">{{ ref.journal }}, {{ ref.year }}</p>

                    <p class="text-sm">
                      <a
                        :href="ref.url"
                        class="text-blue-600 hover:underline"
                        target="_blank"
                      >
                        DOI: {{ ref.doi }}
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

            <template #related>
              <div v-if="poster.relatedItems.length > 0">
                <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <NuxtLink
                    v-for="item in poster.relatedItems"
                    :key="item.id"
                    :to="`/discover/${item.id}`"
                  >
                    <UCard
                      class="cursor-pointer transition-shadow hover:shadow-lg"
                    >
                      <div class="mb-3 aspect-video overflow-hidden rounded-lg">
                        <NuxtImg
                          :src="item.imageUrl"
                          :alt="item.title"
                          class="h-full w-full object-cover"
                        />
                      </div>

                      <h3 class="mb-2 line-clamp-2 font-medium">
                        {{ item.title }}
                      </h3>

                      <p class="mb-2 text-sm">{{ item.authors }}</p>

                      <div class="flex items-center justify-between text-xs">
                        <span>{{
                          dayjs(item.publishedAt).format("MMM YYYY")
                        }}</span>

                        <span class="flex items-center gap-1">
                          <Icon name="heroicons:eye" class="h-3 w-3" />
                          {{ item.views }}
                        </span>
                      </div>
                    </UCard>
                  </NuxtLink>
                </div>
              </div>

              <UEmpty
                v-else
                class="mt-4"
                icon="i-lucide-file"
                title="No related items found"
                description="This poster has no related resources."
              />
            </template>
          </UTabs>
        </div>

        <div class="flex flex-col gap-4">
          <UCard>
            <div class="aspect-video overflow-hidden rounded-lg">
              <NuxtImg
                :src="poster.imageUrl"
                :alt="poster.title"
                class="h-full w-full object-cover"
              />
            </div>
          </UCard>

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

                <p v-if="author.affiliation" class="text-sm">
                  {{ author.affiliation }}
                </p>

                <p v-if="author.orcid" class="text-xs">
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
              <div v-if="poster.license" class="flex justify-between">
                <span class="">License:</span>

                <span class="font-medium">{{ poster.license }}</span>
              </div>

              <div class="flex justify-between">
                <span class="">Published:</span>

                <span class="font-medium">{{
                  dayjs(poster.publishedAt).format("MMM D, YYYY")
                }}</span>
              </div>

              <div v-if="poster.version" class="flex justify-between">
                <span class="">Version:</span>

                <span class="font-medium">{{ poster.version }}</span>
              </div>

              <div v-if="poster.doi" class="flex justify-between">
                <span class="">DOI:</span>

                <span class="font-medium text-blue-600">{{ poster.doi }}</span>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="text-lg font-semibold">Metrics</h3>
            </template>

            <div class="grid grid-cols-2 gap-4 text-center">
              <div>
                <p class="text-2xl font-bold text-blue-600">
                  {{ poster.views.toLocaleString() }}
                </p>

                <p class="text-sm">Views</p>
              </div>

              <div>
                <p class="text-2xl font-bold text-purple-600">
                  {{ poster.citations }}
                </p>

                <p class="text-sm">Citations</p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </UContainer>
  </div>
</template>
