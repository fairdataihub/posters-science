<script setup lang="ts">
const {
  open,
  goShareIndividualPoster,
  goSharePosterBatch,
} = useSharePostersChooser();
</script>

<template>
  <UModal
    v-model:open="open"
    title="How many posters will you be sharing?"
    class="max-w-lg"
    :ui="{ title: 'text-xl font-semibold' }"
  >
    <template #body>
      <div class="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="border-default hover:bg-elevated/50 flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors"
          @click="goShareIndividualPoster"
        >
          <UIcon
            name="line-md:file-upload"
            class="text-primary size-8 shrink-0"
          />
          <span class="font-semibold">One poster</span>
          <span class="text-muted text-sm text-balance">
            Share a poster to be displayed on Posters.Science and archived on
            Zenodo.
          </span>
        </button>

        <button
          type="button"
          class="border-default hover:bg-elevated/50 flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors"
          @click="goSharePosterBatch"
        >
          <UIcon
            name="material-symbols:library-add"
            class="text-primary size-8 shrink-0"
          />
          <span class="font-semibold">Five or more</span>
          <span class="text-muted text-sm text-balance">
            For conference organizers, or if you are sharing several of your own
            posters and want to upload them as one batch.
          </span>
        </button>
      </div>
    </template>
  </UModal>
</template>
