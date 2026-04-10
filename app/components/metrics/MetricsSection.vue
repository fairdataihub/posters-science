<script setup lang="ts">
const { data: discoverData } = await useFetch("/api/discover/stats");

const displayCount = ref(0);
const displayIndexedCount = ref(0);

const animateCount = (target: number, output: Ref<number>) => {
  if (target === 0) return;
  const duration = 1200;
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    output.value = Math.round(progress * target * (2 - progress));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

onMounted(() => {
  animateCount(discoverData.value?.sharedViaPlatformCount ?? 0, displayCount);
  animateCount(
    discoverData.value?.indexedViaAutomationCount ?? 0,
    displayIndexedCount,
  );
});
</script>

<template>
  <!-- Section D: Metrics -->
  <div class="mt-16">
    <div class="mx-auto max-w-screen-xl px-6 py-12">
      <div class="mb-12 text-center">
        <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
          A growing collection of FAIR poster records
        </h2>
      </div>

      <div
        class="grid grid-cols-1 gap-8 md:grid-cols-2 md:justify-items-center"
      >
        <!-- Published posters card -->
        <div class="relative w-full">
          <div
            class="bg-primary/10 absolute inset-0 animate-pulse rounded-xl blur-md"
          />

          <UCard class="relative h-full w-full text-center">
            <div class="flex flex-col items-center gap-3 py-4">
              <Icon
                name="heroicons:document-text"
                class="h-10 w-10 text-pink-600"
              />

              <div class="text-5xl font-bold text-pink-600">
                {{ displayCount.toLocaleString() }}
              </div>

              <p class="text-lg font-semibold">Published Posters</p>

              <p class="text-muted text-sm">
                Posters shared using Posters.science.
              </p>
            </div>
          </UCard>
        </div>

        <!-- Discovered/indexed posters card -->
        <div class="relative w-full">
          <div
            class="bg-primary/10 absolute inset-0 animate-pulse rounded-xl blur-md"
          />

          <UCard class="relative h-full w-full text-center">
            <div class="flex flex-col items-center gap-3 py-4">
              <Icon
                name="heroicons:magnifying-glass-circle"
                class="h-10 w-10 text-pink-600"
              />

              <div class="text-5xl font-bold text-pink-600">
                {{ displayIndexedCount.toLocaleString() }}
              </div>

              <p class="text-lg font-semibold">Discovered Posters</p>

              <p class="text-muted text-sm">
                Posters automatically discovered and indexed from repositories
                and other platforms.
              </p>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>
