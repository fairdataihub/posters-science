<script setup lang="ts">
import { faker } from "@faker-js/faker";
import dayjs from "dayjs";

// Get the poster ID from the route
const route = useRoute();
const posterId = route.params.posterid as string;

useSeoMeta({
  title: "Poster Details",
  description: "View detailed information about this research poster.",
});

const poster = ref({
  id: posterId,
  title: faker.lorem.sentence(8),
  description: faker.lorem.paragraphs(4, "\n\n"),
  imageUrl: faker.image.urlPicsumPhotos({
    width: 800,
    height: 600,
    blur: 0,
  }),
  authors: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
    givenName: faker.person.firstName(),
    familyName: faker.person.lastName(),
    affiliation: faker.company.name(),
    orcid: `${faker.string.numeric(4)}-${faker.string.numeric(4)}-${faker.string.numeric(4)}-${faker.string.numeric(4)}`,
    email: faker.internet.email(),
  })),
  publishedAt: faker.date.past(),
  created: faker.date.past(),
  version: faker.number.int({ min: 1, max: 5 }),
  doi: `10.5281/zenodo.${faker.string.numeric(8)}`,
  license: faker.helpers.arrayElement([
    "CC BY 4.0",
    "CC BY-SA 4.0",
    "CC0 1.0",
    "CC BY-NC 4.0",
  ]),
  keywords: Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () =>
    faker.lorem.word(),
  ),
  views: faker.number.int({ min: 100, max: 10000 }),
  citations: faker.number.int({ min: 0, max: 100 }),
  shares: faker.number.int({ min: 10, max: 500 }),
  likes: faker.number.int({ min: 5, max: 200 }),
  relatedItems: Array.from(
    { length: faker.number.int({ min: 3, max: 8 }) },
    (_, index) => ({
      id: index + 1,
      title: faker.lorem.sentence(6),
      authors: faker.person.fullName(),
      publishedAt: faker.date.past(),
      views: faker.number.int({ min: 10, max: 1000 }),
      imageUrl: faker.image.urlPicsumPhotos({ width: 200, height: 150 }),
    }),
  ),
  references: Array.from(
    { length: faker.number.int({ min: 5, max: 15 }) },
    () => ({
      id: faker.string.alphanumeric(8),
      title: faker.lorem.sentence(8),
      relationType: faker.helpers.arrayElement([
        "Cited by",
        "Cites",
        "Is cited by",
        "Is cited",
      ]),
      authors: Array.from(
        { length: faker.number.int({ min: 1, max: 4 }) },
        () => faker.person.fullName(),
      ).join(", "),
      journal: faker.company.name() + " Journal",
      year: faker.date.past().getFullYear(),
      doi: `10.1000/${faker.string.alphanumeric(8)}`,
      url: faker.internet.url(),
    }),
  ),
  funding: Array.from({ length: faker.number.int({ min: 0, max: 3 }) }, () => ({
    agency: faker.company.name(),
    grantNumber: faker.string.alphanumeric(10),
  })),
  acknowledgments: faker.lorem.paragraph(),
  conference: {
    name: faker.helpers.arrayElement([
      "International Conference on Machine Learning (ICML)",
      "Conference on Neural Information Processing Systems (NeurIPS)",
      "International Conference on Learning Representations (ICLR)",
      "Association for Computational Linguistics (ACL)",
      "IEEE Conference on Computer Vision and Pattern Recognition (CVPR)",
      "International Conference on Computer Vision (ICCV)",
      "European Conference on Computer Vision (ECCV)",
      "SIGGRAPH Conference",
      "International Conference on Data Mining (ICDM)",
      "World Wide Web Conference (WWW)",
    ]),
    acronym: faker.helpers.arrayElement([
      "ICML",
      "NeurIPS",
      "ICLR",
      "ACL",
      "CVPR",
      "ICCV",
      "ECCV",
      "SIGGRAPH",
      "ICDM",
      "WWW",
    ]),
    year: faker.date.past().getFullYear(),
    location: faker.location.city() + ", " + faker.location.country(),
    venue: faker.company.name() + " Convention Center",
    dates: {
      start: faker.date.past(),
      end: faker.date.past(),
    },
    session: faker.helpers.arrayElement([
      "Oral Presentation",
      "Poster Session A",
      "Poster Session B",
      "Workshop: " + faker.lorem.words(3),
      "Tutorial: " + faker.lorem.words(2),
      "Demo Session",
    ]),
  },
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
                {{ poster.conference.acronym }} {{ poster.conference.year }}
              </UBadge>

              <template #content>
                <p class="px-2 py-1 text-sm">
                  {{ poster.conference.name }} <br />
                  {{ poster.conference.venue }} |
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
              likes
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
            <span> DOI: {{ poster.doi }} </span>

            <span>•</span>

            <span>
              Published {{ dayjs(poster.publishedAt).format("MMM D, YYYY") }}
            </span>

            <span>•</span>

            <span> Version {{ poster.version }} </span>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              variant="solid"
              icon="heroicons:arrow-down-tray"
              size="lg"
            >
              Download
            </UButton>

            <UButton
              color="neutral"
              variant="outline"
              icon="heroicons:heart"
              size="lg"
            >
              Like
            </UButton>

            <UButton
              color="neutral"
              variant="outline"
              icon="heroicons:share"
              size="lg"
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
                        <div class="flex items-center gap-2">
                          <Icon name="heroicons:academic-cap" class="h-4 w-4" />

                          <span class="">Acronym:</span>

                          <span class="font-medium">{{
                            poster.conference.acronym
                          }}</span>
                        </div>

                        <div class="space-y-2 text-sm">
                          <div class="flex items-center gap-2">
                            <Icon
                              name="heroicons:building-office"
                              class="h-4 w-4"
                            />

                            <span class="">Venue:</span>

                            <span class="font-medium">{{
                              poster.conference.venue
                            }}</span>
                          </div>

                          <div class="flex items-center gap-2">
                            <Icon name="heroicons:map-pin" class="h-4 w-4" />

                            <span class="">Location:</span>

                            <span class="font-medium">{{
                              poster.conference.location
                            }}</span>
                          </div>

                          <div class="flex items-center gap-2">
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

                          <div class="flex items-center gap-2">
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
              <UCard class="mt-4">
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
            </template>

            <template #related>
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
            </template>
          </UTabs>
        </div>

        <div class="mt-[64px] flex flex-col gap-4">
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

                <p class="text-sm">{{ author.affiliation }}</p>

                <p class="text-xs">ORCID: {{ author.orcid }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <Icon
                  name="heroicons:academic-cap"
                  class="h-5 w-5 text-blue-600"
                />

                <h3 class="text-lg font-semibold">Conference Details</h3>
              </div>
            </template>

            <div class="space-y-4">
              <div>
                <h4 class="mb-1 font-semibold">
                  {{ poster.conference.name }}
                </h4>
              </div>

              <div class="space-y-3 text-sm">
                <div class="flex items-start gap-2">
                  <Icon
                    name="heroicons:building-office"
                    class="mt-0.5 h-4 w-4"
                  />

                  <div>
                    <span class="">Venue:</span>

                    <p class="font-medium">{{ poster.conference.venue }}</p>
                  </div>
                </div>

                <div class="flex items-start gap-2">
                  <Icon name="heroicons:map-pin" class="mt-0.5 h-4 w-4" />

                  <div>
                    <span class="">Location:</span>

                    <p class="font-medium">{{ poster.conference.location }}</p>
                  </div>
                </div>

                <div class="flex items-start gap-2">
                  <Icon name="heroicons:calendar" class="mt-0.5 h-4 w-4" />

                  <div>
                    <span class="">Dates:</span>

                    <p class="font-medium">
                      {{ dayjs(poster.conference.dates.start).format("MMM D") }}
                      -
                      {{
                        dayjs(poster.conference.dates.end).format("MMM D, YYYY")
                      }}
                    </p>
                  </div>
                </div>

                <div class="flex items-start gap-2">
                  <Icon
                    name="heroicons:presentation-chart-bar"
                    class="mt-0.5 h-4 w-4"
                  />

                  <div>
                    <span class="">Session:</span>

                    <p class="font-medium">{{ poster.conference.session }}</p>
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="text-lg font-semibold">Details</h3>
            </template>

            <div class="space-y-3 text-sm">
              <div class="flex justify-between">
                <span class="">License:</span>

                <span class="font-medium">{{ poster.license }}</span>
              </div>

              <div class="flex justify-between">
                <span class="">Published:</span>

                <span class="font-medium">{{
                  dayjs(poster.publishedAt).format("MMM D, YYYY")
                }}</span>
              </div>

              <div class="flex justify-between">
                <span class="">Version:</span>

                <span class="font-medium">{{ poster.version }}</span>
              </div>

              <div class="flex justify-between">
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
