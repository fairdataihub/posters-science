<script setup lang="ts">
import WordCloud from "~/components/metrics/WordCloud.vue";

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Metrics - Posters.science")}&description=${encodeURIComponent("Usage and growth metrics for the Posters.science platform")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Metrics - Posters.science",
  description: "Usage and growth metrics for the Posters.science platform.",
  ogTitle: "Metrics - Posters.science",
  ogDescription: "Usage and growth metrics for the Posters.science platform.",
  ogImage,
});

const { data } = await useFetch("/api/discover/metrics");

// ── Animated counters ────────────────────────────────────────────────────────
const displayFunded = ref(0);
const displaySubjects = ref(0);
const displayInstitutions = ref(0);
const displayLanguages = ref(0);

const animateCount = (target: number, output: Ref<number>) => {
  if (!target) return;
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
  animateCount(data.value?.world.funded ?? 0, displayFunded);
  animateCount(data.value?.world.uniqueSubjectCount ?? 0, displaySubjects);
  animateCount(
    data.value?.world.uniqueInstitutionCount ?? 0,
    displayInstitutions,
  );
  animateCount(data.value?.world.languageCount ?? 0, displayLanguages);
});

// ── Dark-mode-aware label color ──────────────────────────────────────────────
const colorMode = useColorMode();
const labelColor = computed(() =>
  colorMode.value === "dark" ? "#d1d5db" : "#374151",
);

// ── Chart color palette ──────────────────────────────────────────────────────
const PINK = "#ec4899";
const PINK_LIGHT = "#f9a8d4";
const CHART_COLORS = [
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

// ── Monthly growth chart ─────────────────────────────────────────────────────
const monthlyChartOption = computed<ECOption>(() => {
  const trend = data.value?.platform.monthlyTrend ?? [];
  const months = trend.map((t) => {
    const [year, month] = t.month.split("-");

    return new Date(Number(year), Number(month) - 1).toLocaleDateString(
      "en-US",
      { month: "short", year: "numeric" },
    );
  });
  const counts = trend.map((t) => t.count);

  // Linear regression trend line
  const n = counts.length;
  const xMean = (n - 1) / 2;
  const yMean = counts.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (counts[i]! - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const trendLine = counts.map((_, i) =>
    Math.max(0, Math.round(slope * i + intercept)),
  );

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, appendToBody: true },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: {
      type: "category",
      data: months,
      axisLabel: { rotate: 45, fontSize: 12, color: labelColor.value },
    },
    yAxis: {
      type: "value",
      name: "Posters",
      nameLocation: "middle",
      nameGap: 45,
      nameTextStyle: { color: labelColor.value },
      axisLabel: { color: labelColor.value },
    },
    series: [
      {
        name: "New Posters",
        type: "bar",
        data: counts,
        itemStyle: { color: PINK, borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: "#be185d" } },
      },
      {
        name: "Trend",
        type: "line",
        data: trendLine,
        smooth: true,
        lineStyle: { color: PINK_LIGHT, width: 3 },
        itemStyle: { color: PINK_LIGHT },
        symbol: "none",
        z: 10,
      },
    ],
  };
});

// ── Horizontal bar helper ────────────────────────────────────────────────────
function makeHorizontalBar(
  items: Array<{ name: string; count: number }>,
  color = PINK,
): ECOption {
  const sorted = [...items].sort((a, b) => a.count - b.count);

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, appendToBody: true },
    grid: {
      left: "4%",
      right: "6%",
      top: "4%",
      bottom: "4%",
      containLabel: true,
    },
    xAxis: { type: "value", axisLabel: { color: labelColor.value } },
    yAxis: {
      type: "category",
      data: sorted.map((d) => d.name),
      axisLabel: {
        fontSize: 11,
        overflow: "truncate",
        width: 160,
        color: labelColor.value,
      },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((d) => d.count),
        itemStyle: { color, borderRadius: [0, 4, 4, 0] },
        emphasis: { itemStyle: { color: "#be185d" } },
        label: { show: true, position: "right", fontSize: 11, color: labelColor.value },
      },
    ],
  };
}

const domainsChartOption = computed(() =>
  makeHorizontalBar(data.value?.world.domains ?? []),
);
const conferencesChartOption = computed(() =>
  makeHorizontalBar(data.value?.world.conferences ?? [], "#8b5cf6"),
);
const publishersChartOption = computed(() =>
  makeHorizontalBar(data.value?.world.publishers ?? [], "#06b6d4"),
);
const institutionsChartOption = computed(() =>
  makeHorizontalBar(
    (data.value?.world.institutions ?? []).map((i) => ({
      name: i.institution,
      count: i.poster_count,
    })),
    "#10b981",
  ),
);

// ── Donut chart helper ───────────────────────────────────────────────────────
function makeDonut(
  title: string,
  items: Array<{ name: string; count: number }>,
): ECOption {
  return {
    title: {
      text: title,
      left: "center",
      textStyle: { fontSize: 15, fontWeight: "bold", color: labelColor.value },
    },
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
      appendToBody: true,
    },
    legend: {
      top: "12%",
      left: "center",
      orient: "horizontal",
      textStyle: { fontSize: 11, color: labelColor.value },
      type: "scroll",
    },
    color: CHART_COLORS,
    series: [
      {
        type: "pie",
        radius: ["40%", "68%"],
        center: ["50%", "62%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: "bold", position: "center" },
        },
        labelLine: { show: false },
        data: items.map((i) => ({ name: i.name, value: i.count })),
      },
    ],
  };
}

const licenseChartOption = computed(() =>
  makeDonut("License Distribution", data.value?.world.licenses ?? []),
);
const languageChartOption = computed(() =>
  makeDonut("Language Distribution", data.value?.world.languages ?? []),
);

// ── Conference year chart ────────────────────────────────────────────────────
const conferenceYearChartOption = computed<ECOption>(() => {
  const years = data.value?.world.conferenceYears ?? [];

  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, appendToBody: true },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: {
      type: "category",
      data: years.map((y) => y.year),
      axisLabel: { rotate: 45, fontSize: 12, color: labelColor.value },
    },
    yAxis: {
      type: "value",
      name: "Posters",
      nameLocation: "middle",
      nameGap: 45,
      nameTextStyle: { color: labelColor.value },
      axisLabel: { color: labelColor.value },
    },
    series: [
      {
        name: "Posters",
        type: "bar",
        data: years.map((y) => y.count),
        itemStyle: { color: "#f59e0b", borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: "#d97706" } },
        label: { show: true, position: "top", fontSize: 11, color: labelColor.value },
      },
    ],
  };
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 pb-16">
    <UPageCTA
      title="Metrics"
      description="Explore the research archived on Posters.science"
      variant="naked"
    />

    <!-- Archive Growth -->
    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Archive Growth</h2>

      <ClientOnly>
        <UCard>
          <template #header>
            <h3 class="text-base font-semibold">
              Monthly Poster Registrations
            </h3>
          </template>

          <div style="height: 380px">
            <VChart :option="monthlyChartOption" autoresize />
          </div>
        </UCard>

        <template #fallback>
          <USkeleton class="h-96 w-full rounded-xl" />
        </template>
      </ClientOnly>

      <div class="grid grid-cols-2 gap-4">
        <UCard>
          <div class="flex flex-col items-center gap-1 py-2 text-center">
            <div class="text-3xl font-bold text-pink-600">
              {{ (data?.platform.manualCount ?? 0).toLocaleString() }}
            </div>

            <p class="text-sm font-medium">Manually Shared</p>

            <p class="text-muted text-xs">Uploaded directly by researchers</p>
          </div>
        </UCard>

        <UCard>
          <div class="flex flex-col items-center gap-1 py-2 text-center">
            <div class="text-3xl font-bold text-pink-600">
              {{ (data?.platform.automatedCount ?? 0).toLocaleString() }}
            </div>

            <p class="text-sm font-medium">Auto-Indexed</p>

            <p class="text-muted text-xs">
              Discovered and indexed from repositories
            </p>
          </div>
        </UCard>
      </div>
    </section>

    <!-- Research at a Glance -->
    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Research at a Glance</h2>

      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <UCard>
          <div class="flex flex-col items-center gap-1 py-2 text-center">
            <div class="text-3xl font-bold text-pink-600">
              {{ displayFunded.toLocaleString() }}
            </div>

            <p class="text-sm font-medium">Funded Posters</p>

            <p class="text-muted text-xs">With public funding references</p>
          </div>
        </UCard>

        <UCard>
          <div class="flex flex-col items-center gap-1 py-2 text-center">
            <div class="text-3xl font-bold text-pink-600">
              {{ displaySubjects.toLocaleString() }}
            </div>

            <p class="text-sm font-medium">Unique Topics</p>

            <p class="text-muted text-xs">Distinct research subjects</p>
          </div>
        </UCard>

        <UCard>
          <div class="flex flex-col items-center gap-1 py-2 text-center">
            <div class="text-3xl font-bold text-pink-600">
              {{ displayInstitutions.toLocaleString() }}
            </div>

            <p class="text-sm font-medium">Institutions</p>

            <p class="text-muted text-xs">Unique affiliated organizations</p>
          </div>
        </UCard>

        <UCard>
          <div class="flex flex-col items-center gap-1 py-2 text-center">
            <div class="text-3xl font-bold text-pink-600">
              {{ displayLanguages.toLocaleString() }}
            </div>

            <p class="text-sm font-medium">Languages</p>

            <p class="text-muted text-xs">Languages represented</p>
          </div>
        </UCard>
      </div>
    </section>

    <!-- Research Topics -->
    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Research Topics</h2>

      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">Top Subjects and Keywords</h3>
        </template>

        <ClientOnly>
          <WordCloud
            v-if="data?.world?.subjects?.length"
            :words="
              data.world.subjects.map((s) => ({
                text: s.subject,
                value: s.count,
              }))
            "
            :height="420"
          />

          <p v-else class="text-muted py-8 text-center text-sm">
            No data available yet.
          </p>

          <template #fallback>
            <USkeleton class="h-96 w-full rounded-xl" />
          </template>
        </ClientOnly>
      </UCard>
    </section>

    <!-- Research Domains & Conferences — hidden until data is cleaned up -->
    <section v-if="false" class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Research Domains and Conferences</h2>

      <ClientOnly>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UCard>
            <template #header>
              <h3 class="text-base font-semibold">Top Research Domains</h3>
            </template>

            <div
              v-if="data?.world?.domains?.length"
              :style="`height: ${Math.max(300, (data?.world?.domains?.length ?? 0) * 36)}px`"
            >
              <VChart :option="domainsChartOption" autoresize />
            </div>

            <p v-else class="text-muted py-8 text-center text-sm">
              No data available yet.
            </p>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="text-base font-semibold">Top Conferences</h3>
            </template>

            <div
              v-if="data?.world?.conferences?.length"
              :style="`height: ${Math.max(300, (data?.world?.conferences?.length ?? 0) * 36)}px`"
            >
              <VChart :option="conferencesChartOption" autoresize />
            </div>

            <p v-else class="text-muted py-8 text-center text-sm">
              No data available yet.
            </p>
          </UCard>
        </div>

        <template #fallback>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <USkeleton class="h-80 w-full rounded-xl" />

            <USkeleton class="h-80 w-full rounded-xl" />
          </div>
        </template>
      </ClientOnly>
    </section>

    <!-- Open Science & Reach -->
    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Open Science and Reach</h2>

      <ClientOnly>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UCard>
            <div v-if="data?.world?.licenses?.length" style="height: 380px">
              <VChart :option="licenseChartOption" autoresize />
            </div>

            <p v-else class="text-muted py-8 text-center text-sm">
              No data available yet.
            </p>
          </UCard>

          <UCard>
            <div v-if="data?.world?.languages?.length" style="height: 380px">
              <VChart :option="languageChartOption" autoresize />
            </div>

            <p v-else class="text-muted py-8 text-center text-sm">
              No data available yet.
            </p>
          </UCard>
        </div>

        <template #fallback>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <USkeleton class="h-96 w-full rounded-xl" />

            <USkeleton class="h-96 w-full rounded-xl" />
          </div>
        </template>
      </ClientOnly>
    </section>

    <!-- Conference Years — hidden until data is cleaned up -->
    <section v-if="false" class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Conference Years</h2>

      <ClientOnly>
        <UCard>
          <template #header>
            <h3 class="text-base font-semibold">Posters by Conference Year</h3>
          </template>

          <div
            v-if="data?.world?.conferenceYears?.length"
            style="height: 320px"
          >
            <VChart :option="conferenceYearChartOption" autoresize />
          </div>

          <p v-else class="text-muted py-8 text-center text-sm">
            No data available yet.
          </p>
        </UCard>

        <template #fallback>
          <USkeleton class="h-80 w-full rounded-xl" />
        </template>
      </ClientOnly>
    </section>

    <!-- Where Posters Come From -->
    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Where Posters Come From</h2>

      <ClientOnly>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UCard>
            <template #header>
              <h3 class="text-base font-semibold">
                Top Publishers and Repositories
              </h3>
            </template>

            <div
              v-if="data?.world?.publishers?.length"
              :style="`height: ${Math.max(300, (data?.world?.publishers?.length ?? 0) * 36)}px`"
            >
              <VChart :option="publishersChartOption" autoresize />
            </div>

            <p v-else class="text-muted py-8 text-center text-sm">
              No data available yet.
            </p>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="text-base font-semibold">Top Institutions</h3>
            </template>

            <div
              v-if="data?.world?.institutions?.length"
              :style="`height: ${Math.max(300, (data?.world?.institutions?.length ?? 0) * 36)}px`"
            >
              <VChart :option="institutionsChartOption" autoresize />
            </div>

            <p v-else class="text-muted py-8 text-center text-sm">
              No data available yet.
            </p>
          </UCard>
        </div>

        <template #fallback>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <USkeleton class="h-80 w-full rounded-xl" />

            <USkeleton class="h-80 w-full rounded-xl" />
          </div>
        </template>
      </ClientOnly>
    </section>

  </div>
</template>
