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
      "AI fills in the metadata for you to review",
      "Publish with its own DOI",
    ],
    action: goShareIndividualPoster,
  },
  {
    key: "batch",
    title: "Five or more",
    icon: "material-symbols:library-add",
    description:
      "For conference organizers, or if you are sharing several of your own posters and want to upload them as one batch.",
    points: [
      "Upload files, a folder, or a ZIP",
      "Set conference and license once for the batch",
      "Review all posters in one grid, then publish together",
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
      class="group border-default bg-default hover:border-primary/60 focus-visible:ring-primary relative flex h-full flex-col items-start gap-4 rounded-2xl border p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
      @click="option.action"
    >
      <span
        class="bg-primary/10 text-primary group-hover:bg-primary/15 flex size-12 items-center justify-center rounded-xl transition-colors"
      >
        <UIcon :name="option.icon" class="size-7" />
      </span>

      <div class="space-y-1.5">
        <h2 class="text-lg font-semibold">{{ option.title }}</h2>
        <p class="text-muted text-sm text-pretty">
          {{ option.description }}
        </p>
      </div>

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

      <span
        class="text-primary mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium"
      >
        Get started
        <UIcon
          name="i-lucide-arrow-right"
          class="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </span>
    </button>
  </div>
</template>
