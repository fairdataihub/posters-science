<script setup lang="ts">
const { goShareIndividualPoster, goSharePosterBatch } =
  useSharePostersChooser();

const options = [
  {
    key: "single",
    title: "One poster",
    icon: "line-md:file-upload",
    description:
      "Share a poster to be displayed on Posters.Science and archived on Zenodo.",
    points: [
      "Upload your poster",
      "AI fills in the details for you to review",
      "Publish with its own DOI",
    ],
    action: goShareIndividualPoster,
  },
  {
    key: "batch",
    title: "Batch submission",
    icon: "material-symbols:library-add",
    description:
      "Share one or more posters to be displayed on Posters.Science and archived on Zenodo. Ideal for conference organizers.",
    points: [
      "Upload your poster files",
      "Tell us about the conference and pick a license. AI fills in the rest for you to review",
      "Publish them all together, each with its own DOI",
    ],
    action: goSharePosterBatch,
  },
];
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <button
      v-for="option in options"
      :key="option.key"
      type="button"
      class="group border-default bg-default hover:border-primary/60 focus-visible:ring-primary relative flex h-full flex-col items-start gap-3 rounded-2xl border p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
      @click="option.action"
    >
      <div class="flex items-center gap-3">
        <span
          class="bg-primary/10 text-primary group-hover:bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors"
        >
          <UIcon :name="option.icon" class="size-6" />
        </span>
        <h2 class="text-lg font-semibold">{{ option.title }}</h2>
      </div>

      <p class="text-muted text-sm text-pretty">
        {{ option.description }}
      </p>

      <ol class="space-y-2 text-sm">
        <li
          v-for="(point, index) in option.points"
          :key="point"
          class="flex items-start gap-2.5"
        >
          <span
            class="bg-elevated text-muted mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums"
            aria-hidden="true"
          >
            {{ index + 1 }}
          </span>
          <span>{{ point }}</span>
        </li>
      </ol>

      <UIcon
        name="i-lucide-arrow-right"
        class="text-primary mt-auto size-5 self-end transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
