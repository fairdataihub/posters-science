<script setup lang="ts">
const feedbackOpen = useState("feedbackOpen", () => false);

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
</script>

<template>
  <section>
    <UPageHero
      title="The best way to discover and share posters"
      description="Posters.science is a free and open source platform for easily discovering and sharing scientific posters"
      orientation="horizontal"
      :links="links"
      class="mb-0 pb-0"
    >
      <div class="group relative inline-block">
        <img src="/assets/images/fairy.png" alt="Logo" class="block pl-16" />
        <!-- Glow effect behind the image -->
        <div
          class="bg-primary/20 absolute inset-0 -z-10 animate-pulse rounded-xl blur-3xl"
        />

        <p
          class="text-muted text-center text-xs opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:-ml-4"
        >
          This image is AI-generated.
        </p>
      </div>
    </UPageHero>

    <!-- Why Posters Matter -->
    <div class="mt-0">
      <!-- Gradient beam border -->
      <div class="relative mx-auto h-px w-full">
        <div
          class="absolute top-0 left-1/2 h-[3px] w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-pink-400/50 to-transparent blur-sm"
        />

        <div
          class="absolute top-0 left-1/2 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-pink-400/70 to-transparent"
        />

        <div
          class="absolute top-0 left-1/2 h-[2px] w-1/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-pink-400/90 to-transparent blur-[1px]"
        />
      </div>
    </div>

    <div class="mt-0">
      <div class="mx-auto max-w-screen-xl px-6 py-16">
        <!-- Soft launch notice -->
        <div class="mx-auto max-w-3xl px-6 pb-12">
          <div
            class="border-primary/20 bg-primary/5 flex items-start gap-3 rounded-xl border px-5 py-4"
          >
            <Icon
              name="heroicons:beaker"
              class="text-primary mt-0.5 h-5 w-5 shrink-0"
            />

            <p class="text-muted text-sm leading-relaxed">
              <span class="text-foreground font-semibold">Soft launch:</span>
              Posters.science is currently in early access. Core platform
              functionality is up and running, and we'd love for you to test it.
              We would greatly appreciate it if you could share a poster,
              discover posters, and
              <button
                class="text-primary cursor-pointer font-medium underline underline-offset-2"
                @click="feedbackOpen = true"
              >
                share your thoughts via our feedback form</button
              >.
            </p>
          </div>
        </div>

        <div class="mx-auto max-w-3xl text-center">
          <h2 class="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">
            Why Posters Matter
          </h2>

          <p class="text-muted text-lg leading-relaxed">
            It is estimated that millions of scientific posters are presented
            every year at conferences, making them one of the most common forms
            of scientific communication. Posters often highlight early-stage
            insights and preliminary results, introducing them for the first
            time beyond the research team. As such, they represent a valuable
            source of scientific knowledge. However, they are not consistently
            shared. When shared, they are not FAIR (Findable, Accessible,
            Interoperable, Reusable). This limits their visibility and long-term
            impact. We want to change that.
          </p>
        </div>
      </div>
    </div>

    <!-- Section A: How It Works -->
    <div class="mt-10">
      <div class="mx-auto max-w-screen-xl px-6 py-12">
        <div class="mb-12 text-center">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            Share your poster in three steps
          </h2>

          <p class="text-muted mx-auto mt-4 max-w-2xl text-lg">
            From upload to a citable, FAIR-compliant and AI-ready poster record
            in minutes.
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

              <h3 class="mb-2 text-lg font-semibold">Upload poster</h3>

              <p class="text-muted text-sm leading-relaxed">
                Upload a PDF or image of your poster.
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

              <h3 class="mb-2 text-lg font-semibold">Review metadata</h3>

              <p class="text-muted text-sm leading-relaxed">
                Review and adjust the metadata automatically extracted from your
                poster by an AI-powered model.
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
                Archive your poster on Zenodo to make it FAIR and citable.
              </p>
            </div>
          </div>
        </div>

        <!-- poster.json info box -->
        <UCard class="bg-primary/5 border-primary/20 mt-16 border">
          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2">
              <Icon
                name="heroicons:code-bracket"
                class="text-primary h-5 w-5"
              />

              <span class="font-semibold">
                <code
                  class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:bg-slate-800"
                  >poster.json</code
                >
              </span>
            </div>

            <p class="text-muted text-base leading-relaxed">
              Scientific posters are typically shared as PDFs with highly
              variable structure, leaving their content largely inaccessible to
              programmatic discovery and analysis. To address this, we developed
              a standardized JSON schema for representing poster metadata and
              content. Every poster shared with Posters.science is accompanied
              by a poster.json file conforming to this schema, making posters
              machine-actionable, FAIR-compliant, and ready for automated
              processing. Our vision is that any time a poster is shared, a
              companion poster.json should be included to enable greater
              findability and reusability across the research ecosystem. We have
              developed an AI-powered model to help create structured metadata
              automatically from posters.
            </p>

            <div class="flex flex-wrap gap-3">
              <UButton
                to="/schemas"
                variant="outline"
                trailing-icon="heroicons:code-bracket"
              >
                View schema
              </UButton>

              <UButton
                to="https://github.com/fairdataihub/poster2json"
                target="_blank"
                variant="outline"
                trailing-icon="i-simple-icons-github"
              >
                View AI model
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Section B: Discover -->
    <div class="mt-16">
      <div class="mx-auto max-w-screen-xl px-6 py-12">
        <div class="mb-12 text-center">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
            Explore scientific posters from across the web
          </h2>

          <p class="text-muted mx-auto mt-4 max-w-2xl text-lg">
            Posters.science automatically discovers and indexes posters from
            repositories and other platforms, so you can find them all in one
            place.
          </p>
        </div>

        <div class="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
          <UCard class="h-full transition-shadow duration-200 hover:shadow-md">
            <div class="flex h-full flex-col gap-4">
              <Icon
                name="heroicons:arrow-path-rounded-square"
                class="text-primary h-8 w-8"
              />

              <h3 class="text-xl font-semibold">Auto-indexed posters</h3>

              <p class="text-muted flex-1 text-sm leading-relaxed">
                Posters.science automatically discovers and indexes poster
                records from repositories. An AI-powered model called
                PosterSentry verifies that the records contains a poster file
                before indexing it.
              </p>

              <a
                href="https://github.com/fairdataihub/poster-sentry"
                target="_blank"
                class="text-muted hover:text-primary flex items-center gap-1.5 text-xs transition-colors"
              >
                <Icon name="i-simple-icons-github" class="h-3.5 w-3.5" />
                fairdataihub/poster-sentry
              </a>
            </div>
          </UCard>

          <UCard class="h-full transition-shadow duration-200 hover:shadow-md">
            <div class="flex flex-col gap-4">
              <Icon name="heroicons:squares-2x2" class="text-primary h-8 w-8" />

              <h3 class="text-xl font-semibold">Browse and filter</h3>

              <p class="text-muted text-sm leading-relaxed">
                Browse all indexed posters. Filter by publication date or search
                using keywords to find posters of interest.
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
                Each poster has a dedicated page that includes full metadata, a
                preview, and a direct link to the original archived file.
              </p>
            </div>
          </UCard>

          <UCard class="h-full transition-shadow duration-200 hover:shadow-md">
            <div class="flex flex-col gap-4">
              <div class="flex items-start justify-between">
                <Icon name="si:ai-fill" class="text-primary h-8 w-8" />

                <UBadge color="neutral" variant="soft" size="sm">
                  Coming soon
                </UBadge>
              </div>

              <h3 class="text-xl font-semibold">AI-powered smart search</h3>

              <p class="text-muted text-sm leading-relaxed">
                Pose a research question in natural language. Smart Search uses
                the content of indexed posters to surface the most relevant
                results.
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

    <ClientOnly>
      <MetricsSection />

      <template #fallback>
        <div
          class="bg-primary/10 mx-auto mt-16 flex max-w-md animate-pulse flex-col items-center gap-4 rounded-xl p-6 text-center"
        >
          <Icon name="heroicons:chart-bar" class="h-10 w-10 text-pink-600" />

          <div class="h-8 w-24 rounded bg-pink-600/70" />

          <p class="text-muted text-sm">Loading metrics...</p>
        </div>
      </template>
    </ClientOnly>

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
