<script setup lang="ts">
const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Posters.science")}&description=${encodeURIComponent("The best way to discover and share scientific posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Posters.science",
  description: "The best way to discover and share scientific posters.",
  ogTitle: "Posters.science",
  ogDescription: "The best way to discover and share scientific posters.",
  ogImage,
});

const links = ref([
  {
    label: "Find Posters",
    to: "/discover",
    size: "xl" as const,
    trailingIcon: "ic:outline-saved-search",
  },
  {
    label: "Share a Poster",
    to: "/share/new",
    size: "xl" as const,
    trailingIcon: "line-md:file-upload",
    variant: "outline" as const,
  },
]);

const { data: discoverData } = await useFetch("/api/discover");

const displayCount = ref(0);
const scrollY = ref(0);

onMounted(() => {
  const target = discoverData.value?.total ?? 0;
  if (target === 0) return;
  const duration = 1200;
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    displayCount.value = Math.round(progress * target * (2 - progress));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

onMounted(() => {
  const onScroll = () => {
    scrollY.value = window.scrollY;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onUnmounted(() => window.removeEventListener("scroll", onScroll));
});
</script>

<template>
  <section>
    <UPageHero
      title="The best way to discover and share posters"
      description="Posters.science is a platform for discovering and sharing scientific posters."
      headline="Releasing in Summer 2026"
      orientation="horizontal"
      :links="links"
    >
      <div class="relative inline-block">
        <img src="/assets/images/fairy.png" alt="Logo" class="block pl-16" />
        <!-- Glow effect behind the image -->
        <div
          class="bg-primary/20 absolute inset-0 -z-10 animate-pulse rounded-xl blur-3xl"
        />

        <p class="text-muted text-center text-xs sm:-ml-4">
          This image is AI-generated.
        </p>
      </div>
    </UPageHero>

    <!-- Section A: How It Works -->
    <div class="mt-10">
      <div class="mx-auto max-w-screen-xl px-6 py-12">
        <div class="mb-12 text-center">
          <UBadge color="primary" variant="soft" class="mb-4">
            How It Works
          </UBadge>

          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            Share your poster in three steps
          </h2>

          <p class="text-muted mx-auto mt-4 max-w-2xl text-lg">
            From upload to a citable, FAIR-compliant record in minutes.
          </p>
        </div>

        <!-- Timeline steps with connecting gradient line -->
        <div class="relative">
          <div
            class="from-primary/0 via-primary/40 to-primary/0 absolute top-5 left-0 hidden h-px w-full bg-gradient-to-r md:block"
          />

          <div class="grid grid-cols-1 gap-10 md:grid-cols-3">
            <!-- Step 1 -->
            <div class="flex flex-col items-center text-center">
              <div
                class="bg-primary relative z-10 mb-5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ring-4 ring-white dark:ring-gray-950"
              >
                01
              </div>

              <Icon
                name="line-md:file-upload"
                class="text-primary mb-3 h-6 w-6"
              />

              <h3 class="mb-2 text-lg font-semibold">
                Upload your poster file
              </h3>

              <p class="text-muted text-sm leading-relaxed">
                Upload a PDF or image of your poster (up to 10 MB).
                Posters.science stores your file on a secure CDN and immediately
                begins automated metadata extraction.
              </p>
            </div>

            <!-- Step 2 -->
            <div class="flex flex-col items-center text-center">
              <div
                class="bg-primary relative z-10 mb-5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ring-4 ring-white dark:ring-gray-950"
              >
                02
              </div>

              <Icon
                name="heroicons:sparkles"
                class="text-primary mb-3 h-6 w-6"
              />

              <h3 class="mb-2 text-lg font-semibold">
                Review and refine metadata
              </h3>

              <p class="text-muted text-sm leading-relaxed">
                An AI-powered extraction model analyzes your poster and
                pre-populates title, authors with affiliations, subjects,
                conference details, and funding references. Verify and edit
                these fields before submission to ensure a complete and accurate
                metadata record.
                <a
                  href="https://github.com/fairdataihub/poster2json"
                  target="_blank"
                  class="text-primary hover:underline"
                  >View the model on GitHub.</a
                >
              </p>
            </div>

            <!-- Step 3 -->
            <div class="flex flex-col items-center text-center">
              <div
                class="bg-primary relative z-10 mb-5 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ring-4 ring-white dark:ring-gray-950"
              >
                03
              </div>

              <Icon
                name="iconoir:journal-page"
                class="text-primary mb-3 h-6 w-6"
              />

              <h3 class="mb-2 text-lg font-semibold">
                Publish to a repository
              </h3>

              <p class="text-muted text-sm leading-relaxed">
                Connect your Zenodo account via OAuth and publish with one
                click. Your poster receives a DOI and a structured poster.json
                record conforming to the Posters.science schema.
              </p>
            </div>
          </div>
        </div>

        <!-- <div class="mt-10 flex justify-center">
          <UButton
            to="/share/new"
            size="xl"
            trailing-icon="line-md:file-upload"
          >
            Share a Poster
          </UButton>
        </div> -->
      </div>
    </div>

    <!-- Section B: Discover -->
    <div class="mt-16">
      <div class="mx-auto max-w-screen-xl px-6 py-12">
        <div class="mb-12 text-center">
          <UBadge color="primary" variant="soft" class="mb-4">
            Browse the Collection
          </UBadge>

          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            Explore published scientific posters
          </h2>

          <p class="text-muted mx-auto mt-4 max-w-2xl text-lg">
            The discover page gives you flexible tools to find posters across
            disciplines and conferences.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-8 md:grid-cols-3">
          <UCard class="h-full transition-shadow duration-200 hover:shadow-md">
            <div class="flex flex-col gap-4">
              <Icon name="heroicons:squares-2x2" class="text-primary h-8 w-8" />

              <h3 class="text-xl font-semibold">Browse and filter</h3>

              <p class="text-muted text-sm leading-relaxed">
                Browse all published posters sorted by date. Filter by keyword
                tags to narrow results to your area of interest.
              </p>
            </div>
          </UCard>

          <UCard class="h-full transition-shadow duration-200 hover:shadow-md">
            <div class="flex flex-col gap-4">
              <Icon name="si:ai-fill" class="text-primary h-8 w-8" />

              <h3 class="text-xl font-semibold">AI-powered smart search</h3>

              <p class="text-muted text-sm leading-relaxed">
                Pose a research question in natural language. Smart Search uses
                the content of indexed posters to surface the most relevant
                results.
              </p>
            </div>
          </UCard>

          <UCard class="h-full transition-shadow duration-200 hover:shadow-md">
            <div class="flex flex-col gap-4">
              <Icon
                name="heroicons:document-magnifying-glass"
                class="text-primary h-8 w-8"
              />

              <h3 class="text-xl font-semibold">Poster detail pages</h3>

              <p class="text-muted text-sm leading-relaxed">
                Each poster has a dedicated page with its full metadata record,
                a preview image, keyword tags, and a direct link to the archived
                file on Zenodo.
              </p>
            </div>
          </UCard>
        </div>

        <!-- <div class="mt-10 flex justify-center">
          <UButton
            to="/discover"
            size="xl"
            trailing-icon="ic:outline-saved-search"
          >
            Find Posters
          </UButton>
        </div> -->
      </div>
    </div>

    <!-- Section C: FAIR Readiness + Poster Schema -->
    <div class="mt-16">
      <div class="mx-auto max-w-screen-xl px-6 py-12">
        <div class="mb-12 text-center">
          <UBadge color="primary" variant="soft" class="mb-4">
            FAIR Data Principles
          </UBadge>

          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            Every poster is FAIR by design
          </h2>

          <p class="text-muted mx-auto mt-4 max-w-2xl text-lg">
            Posters.science generates a structured poster.json record for each
            submission, modeled on the DataCite metadata schema and built to
            satisfy FAIR principles for scientific data.
          </p>
        </div>

        <div class="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <UCard
            class="border-primary h-full border-l-4 transition-shadow duration-200 hover:shadow-md"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <Icon
                  name="heroicons:magnifying-glass-circle"
                  class="text-primary h-6 w-6"
                />

                <span class="text-primary font-bold">Findable</span>
              </div>

              <p class="text-muted text-sm leading-relaxed">
                Each poster receives a persistent DOI via Zenodo. The
                poster.json record is indexed with rich metadata including
                titles, creators, subjects, and conference details.
              </p>
            </div>
          </UCard>

          <UCard
            class="border-primary h-full border-l-4 transition-shadow duration-200 hover:shadow-md"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <Icon name="heroicons:globe-alt" class="text-primary h-6 w-6" />

                <span class="text-primary font-bold">Accessible</span>
              </div>

              <p class="text-muted text-sm leading-relaxed">
                Posters are archived on Zenodo, a trusted open-access repository
                operated by CERN. Files and metadata are retrievable via
                standard HTTP and the Zenodo REST API.
              </p>
            </div>
          </UCard>

          <UCard
            class="border-primary h-full border-l-4 transition-shadow duration-200 hover:shadow-md"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <Icon
                  name="heroicons:arrows-right-left"
                  class="text-primary h-6 w-6"
                />

                <span class="text-primary font-bold">Interoperable</span>
              </div>

              <p class="text-muted text-sm leading-relaxed">
                The poster schema uses controlled vocabulary for license
                identifiers (SPDX), name identifiers (ORCID), and related
                identifier types (DataCite). All fields are defined in a
                published JSON schema.
              </p>
            </div>
          </UCard>

          <UCard
            class="border-primary h-full border-l-4 transition-shadow duration-200 hover:shadow-md"
          >
            <div class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <Icon
                  name="heroicons:arrow-path"
                  class="text-primary h-6 w-6"
                />

                <span class="text-primary font-bold">Reusable</span>
              </div>

              <p class="text-muted text-sm leading-relaxed">
                Creators specify a license, funding references, affiliation
                identifiers (ROR), and ORCID links. Related identifiers connect
                the poster to papers, datasets, and proceedings.
              </p>
            </div>
          </UCard>
        </div>

        <div class="text-center">
          <h3 class="mb-6 text-xl font-semibold">
            Rich metadata fields in
            <code
              class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:bg-slate-800"
              >poster.json</code
            >
          </h3>

          <div class="flex flex-wrap justify-center gap-2">
            <UBadge color="neutral" variant="soft">titles</UBadge>

            <UBadge color="neutral" variant="soft">descriptions</UBadge>

            <UBadge color="neutral" variant="soft">creators</UBadge>

            <UBadge color="neutral" variant="soft">affiliations</UBadge>

            <UBadge color="neutral" variant="soft"
              >nameIdentifiers (ORCID)</UBadge
            >

            <UBadge color="neutral" variant="soft">publisher</UBadge>

            <UBadge color="neutral" variant="soft">publicationYear</UBadge>

            <UBadge color="neutral" variant="soft">subjects</UBadge>

            <UBadge color="neutral" variant="soft">language</UBadge>

            <UBadge color="neutral" variant="soft">relatedIdentifiers</UBadge>

            <UBadge color="neutral" variant="soft">fundingReferences</UBadge>

            <UBadge color="neutral" variant="soft">conference</UBadge>

            <UBadge color="neutral" variant="soft">rightsList (SPDX)</UBadge>

            <UBadge color="neutral" variant="soft">formats</UBadge>

            <UBadge color="neutral" variant="soft">sizes</UBadge>

            <UBadge color="neutral" variant="soft">version</UBadge>

            <UBadge color="neutral" variant="soft">doi</UBadge>

            <UBadge color="neutral" variant="soft">posterContent</UBadge>
          </div>
        </div>

        <div class="mt-10 flex justify-center">
          <UButton
            to="/schemas"
            variant="outline"
            trailing-icon="heroicons:code-bracket"
          >
            View Schema
          </UButton>
        </div>
      </div>
    </div>

    <!-- Section D: Metrics -->
    <div class="mt-16">
      <div class="mx-auto max-w-screen-xl px-6 py-12">
        <div class="mb-12 text-center">
          <UBadge color="primary" variant="soft" class="mb-4">
            Platform Activity
          </UBadge>

          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            A growing collection of FAIR poster records
          </h2>

          <p class="text-muted mx-auto mt-4 max-w-2xl text-lg">
            Posters.science is currently in active beta, releasing Summer 2026.
            The figures below reflect real published records on the platform.
          </p>
        </div>

        <div class="flex flex-col items-center gap-8">
          <!-- Subtle glow wrapper around the stat card -->
          <div class="relative">
            <div
              class="bg-primary/10 absolute inset-0 animate-pulse rounded-xl blur-md"
            />

            <UCard class="relative w-full min-w-64 text-center">
              <div class="flex flex-col items-center gap-3 py-4">
                <Icon
                  name="heroicons:document-text"
                  class="h-10 w-10 text-pink-600"
                />

                <div class="text-5xl font-bold text-pink-600">
                  {{ displayCount }}
                </div>

                <p class="text-lg font-semibold">Published Posters</p>

                <p class="text-muted text-sm">
                  Figure represent live, publicly accessible poster records.
                </p>
              </div>
            </UCard>
          </div>

          <!-- <p class="text-muted max-w-xl text-center text-sm">
            Additional platform analytics are available on the metrics page.
          </p>

          <UButton
            to="/metrics"
            variant="outline"
            trailing-icon="heroicons:chart-bar"
          >
            View Full Metrics
          </UButton> -->
        </div>
      </div>
    </div>

    <!-- Funding acknowledgment -->
    <div
      class="mx-auto mt-16 mb-2 flex max-w-md flex-col items-center gap-2 border-t pt-8"
    >
      <p class="text-muted text-xs font-medium tracking-widest uppercase">
        Supported by
      </p>

      <a
        href="https://www.navigation.org/"
        target="_blank"
        class="text-primary text-base font-semibold hover:underline"
        >The Navigation Fund</a
      >

      <a
        href="https://commons.datacite.org/doi.org/10.71707/rk36-9x79"
        target="_blank"
        class="text-muted text-xs hover:underline"
        >View grant record on DataCite Commons</a
      >
    </div>
  </section>
</template>

<style scoped>
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
</style>
