<script setup lang="ts">
type SupportedConference = {
  id: string;
  name: string;
  acronym: string;
  location: string;
  year: number;
  dateRange: string;
  posterCount: number;
  description: string;
};

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Conferences - Posters.science")}&description=${encodeURIComponent("Browse conferences supported on Posters.science and submit your poster")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Conferences - Posters.science",
  description:
    "Browse conferences supported on Posters.science, submit a poster, or register a new conference.",
  ogTitle: "Conferences - Posters.science",
  ogDescription:
    "Browse conferences supported on Posters.science, submit a poster, or register a new conference.",
  ogImage,
});

const supportedConferences: SupportedConference[] = [
  {
    id: "annual-research-conference-2026",
    name: "Annual Research Conference",
    acronym: "EARC",
    location: "Lisbon, Portugal",
    year: 2026,
    dateRange: "June 12–14, 2026",
    posterCount: 128,
    description:
      "Multi-day meeting with poster sessions across several research areas.",
  },
  {
    id: "regional-meeting-2025",
    name: "Regional Meeting",
    acronym: "ERM",
    location: "Montreal, Canada",
    year: 2025,
    dateRange: "September 8–10, 2025",
    posterCount: 64,
    description:
      "Regional gathering focused on sharing new results and networking.",
  },
  {
    id: "virtual-symposium-2025",
    name: "Virtual Symposium",
    acronym: "EVS",
    location: "Virtual",
    year: 2025,
    dateRange: "March 3–7, 2025",
    posterCount: 412,
    description: "Fully online program with poster sessions and live Q&A.",
  },
];

const searchQuery = ref("");

const filteredConferences = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return supportedConferences;

  return supportedConferences.filter(
    (conference) =>
      conference.name.toLowerCase().includes(q) ||
      conference.acronym.toLowerCase().includes(q) ||
      conference.location.toLowerCase().includes(q),
  );
});

function posterSubmitTo(conferenceId: string) {
  return {
    path: "/share/new",
    query: { conferenceId },
  };
}

function browsePostersFor(conferenceId: string) {
  return {
    path: "/discover",
    query: { conferenceId },
  };
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-8 px-6 pb-12">
    <UPageHeader
      title="Conferences"
      description="Browse conferences on Posters.science, submit a poster to a conference you’re attending or have attended, or register a new conference."
      :links="[
        {
          label: 'Register a conference',
          to: '/conferences/register',
          icon: 'material-symbols:event-available',
          color: 'neutral' as const,
          variant: 'outline' as const,
        },
      ]"
    />

    <section class="flex flex-col gap-4">
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h2 class="text-lg font-semibold">Supported conferences</h2>
        </div>

        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search by name, acronym, or location"
          class="w-full sm:max-w-xs"
        />
      </div>

      <div
        v-if="filteredConferences.length === 0"
        class="text-muted border-default rounded-lg border border-dashed px-6 py-12 text-center text-sm"
      >
        No conferences match your search.
      </div>

      <UPageGrid v-else class="items-stretch">
        <UCard
          v-for="conference in filteredConferences"
          :key="conference.id"
          class="h-full"
          :ui="{
            root: 'h-full flex flex-col',
            body: 'flex flex-1 flex-col',
            footer: 'mt-auto',
          }"
        >
          <div class="flex flex-1 flex-col gap-3">
            <div>
              <p class="text-primary text-sm font-semibold">
                {{ conference.acronym }} {{ conference.year }}
              </p>
              <h3 class="line-clamp-2 min-h-14 text-lg font-semibold">
                {{ conference.name }}
              </h3>
            </div>

            <p class="text-muted line-clamp-3 min-h-[3.75rem] text-sm">
              {{ conference.description }}
            </p>

            <ul class="text-muted space-y-1 text-sm">
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-map-pin"
                  class="size-4 shrink-0 opacity-70"
                />
                {{ conference.location }}
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-calendar"
                  class="size-4 shrink-0 opacity-70"
                />
                {{ conference.dateRange }}
              </li>
              <li class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-images"
                  class="size-4 shrink-0 opacity-70"
                />
                {{ conference.posterCount }} posters on Posters.science
              </li>
            </ul>
          </div>

          <template #footer>
            <div class="flex flex-wrap gap-2">
              <UButton
                :to="browsePostersFor(conference.id)"
                color="neutral"
                variant="outline"
                icon="material-symbols:saved-search"
                label="Browse Posters"
                class="flex-1 justify-center sm:flex-none"
              />
              <UButton
                :to="posterSubmitTo(conference.id)"
                icon="material-symbols:post-add"
                label="Submit poster"
                class="flex-1 justify-center sm:flex-none"
              />
            </div>
          </template>
        </UCard>
      </UPageGrid>
    </section>
  </div>
</template>
