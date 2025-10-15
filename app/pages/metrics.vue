<script setup lang="ts">
useSeoMeta({
  title: "Metrics",
  description: "Metrics for the Posters.science platform",
});

// Generate fake poster registration data for the last 12 months
const generatePosterRegistrationData = () => {
  const months = [];
  const registrations = [];
  const currentDate = new Date();

  // Generate data for the last 12 months
  for (let i = 11; i >= 0; i--) {
    const date = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - i,
      1,
    );
    const monthName = date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    months.push(monthName);

    // Generate realistic registration numbers with some variation
    // Base number around 150-300 with seasonal variations
    const baseRegistrations = 200;
    const seasonalVariation = Math.sin((i / 12) * 2 * Math.PI) * 50; // Seasonal pattern
    const randomVariation = (Math.random() - 0.5) * 100; // Random variation
    const registrationsCount = Math.max(
      50,
      Math.round(baseRegistrations + seasonalVariation + randomVariation),
    );

    registrations.push(registrationsCount);
  }

  return { months, registrations };
};

const { months, registrations } = generatePosterRegistrationData();

// Calculate trend line data using linear regression
const calculateTrendLine = (data: number[]) => {
  const n = data.length;
  const x = Array.from({ length: n }, (_, i) => i);

  // Calculate means
  const xMean = x.reduce((sum, val) => sum + val, 0) / n;
  const yMean = data.reduce((sum, val) => sum + val, 0) / n;

  // Calculate slope and intercept
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i]! - xMean) * (data[i]! - yMean);
    denominator += (x[i]! - xMean) * (x[i]! - xMean);
  }

  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;

  // Generate trend line points
  return x.map((xVal) => Math.round(slope * xVal + intercept));
};

const trendLineData = calculateTrendLine(registrations);

const barChartOption = ref<ECOption>({
  title: {
    text: "Poster Registrations (Last 12 Months)",
    left: "center",
    textStyle: {
      fontSize: 18,
      fontWeight: "bold",
    },
  },
  tooltip: {
    trigger: "axis",
    axisPointer: {
      type: "shadow",
    },
    formatter: (params: unknown) => {
      const data = params as Array<{
        name: string;
        value: number;
        seriesName: string;
      }>;
      if (!data || data.length === 0) return "";

      let tooltip = `${data[0]?.name}<br/>`;

      data.forEach((item) => {
        if (item.seriesName === "Poster Registrations") {
          tooltip += `Registrations: ${item.value}<br/>`;
        } else if (item.seriesName === "Trend Line") {
          tooltip += `Trend: ${item.value}<br/>`;
        }
      });

      return tooltip;
    },
  },
  grid: {
    left: "3%",
    right: "4%",
    bottom: "3%",
    containLabel: true,
  },
  xAxis: {
    type: "category",
    data: months,
    axisLabel: {
      rotate: 45,
      fontSize: 12,
    },
  },
  yAxis: {
    type: "value",
    name: "Number of Registrations",
    nameLocation: "middle",
    nameGap: 50,
    axisLabel: {
      formatter: "{value}",
    },
  },
  series: [
    {
      name: "Poster Registrations",
      type: "bar",
      data: registrations,
      itemStyle: {
        color: "#ec4899",
        borderRadius: [4, 4, 0, 0],
      },
      emphasis: {
        itemStyle: {
          color: "#be185d",
        },
      },
      animationDelay: (idx: number) => idx * 100,
    },
    {
      name: "Trend Line",
      type: "line",
      data: trendLineData,
      smooth: true,
      lineStyle: {
        color: "#f9a8d4",
        width: 3,
        type: "solid",
      },
      itemStyle: {
        color: "#f9a8d4",
        borderWidth: 2,
        borderColor: "#fff",
      },
      symbol: "circle",
      symbolSize: 6,
      z: 10,
    },
  ],
  animationEasing: "elasticOut",
  animationDelayUpdate: (idx: number) => idx * 5,
});

// Generate fake data for posters by institution
const generateInstitutionData = () => {
  const institutions = [
    { name: "MIT", value: 245 },
    { name: "Stanford University", value: 198 },
    { name: "Harvard University", value: 187 },
    { name: "UC Berkeley", value: 156 },
    { name: "Carnegie Mellon", value: 134 },
    { name: "Oxford University", value: 123 },
    { name: "Cambridge University", value: 112 },
    { name: "ETH Zurich", value: 98 },
    { name: "University of Toronto", value: 87 },
    { name: "Other Institutions", value: 234 },
  ];

  return institutions;
};

// Generate fake data for posters by conference
const generateConferenceData = () => {
  const conferences = [
    { name: "NeurIPS", value: 189 },
    { name: "ICML", value: 167 },
    { name: "ICLR", value: 145 },
    { name: "AAAI", value: 134 },
    { name: "IJCAI", value: 123 },
    { name: "CVPR", value: 198 },
    { name: "ICCV", value: 156 },
    { name: "ECCV", value: 134 },
    { name: "ACL", value: 112 },
    { name: "EMNLP", value: 98 },
    { name: "Other Conferences", value: 187 },
  ];

  return conferences;
};

const institutionData = generateInstitutionData();
const conferenceData = generateConferenceData();

const institutionPieChartOption = ref({
  title: {
    text: "Posters by Institution",
    left: "center",
    textStyle: {
      fontSize: 16,
      fontWeight: "bold",
    },
  },
  backgroundColor: "transparent",
  tooltip: {
    trigger: "item",
    formatter: "{a} <br/>{b}: {c} ({d}%)",
  },
  legend: {
    top: "15%",
    left: "center",
    orient: "horizontal",
    textStyle: {
      fontSize: 10,
    },
  },
  series: [
    {
      name: "Institution",
      type: "pie",
      radius: ["30%", "70%"],
      center: ["50%", "60%"],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 8,
        borderColor: "#fff",
        borderWidth: 2,
      },
      label: {
        show: false,
        position: "center",
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: "bold",
        },
      },
      labelLine: {
        show: false,
      },
      data: institutionData,
    },
  ],
});

const conferencePieChartOption = ref({
  title: {
    text: "Posters by Conference",
    left: "center",
    textStyle: {
      fontSize: 16,
      fontWeight: "bold",
    },
  },
  backgroundColor: "transparent",
  tooltip: {
    trigger: "item",
    formatter: "{a} <br/>{b}: {c} ({d}%)",
  },
  legend: {
    top: "15%",
    left: "center",
    orient: "horizontal",
    textStyle: {
      fontSize: 10,
    },
  },
  series: [
    {
      name: "Conference",
      type: "pie",
      radius: ["30%", "70%"],
      center: ["50%", "60%"],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 8,
        borderColor: "#fff",
        borderWidth: 2,
      },
      label: {
        show: false,
        position: "center",
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: "bold",
        },
      },
      labelLine: {
        show: false,
      },
      data: conferenceData,
    },
  ],
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageCTA
      title="Statistics and metrics for the Posters.science platform"
      description="Analytics and insights for poster registrations and platform usage"
      variant="naked"
    />

    <div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Total Registrations</h3>
        </template>

        <div class="text-3xl font-bold text-pink-600">
          {{
            registrations
              .reduce((sum, count) => sum + count, 0)
              .toLocaleString()
          }}
        </div>

        <p class="mt-2 text-sm text-gray-600">Last 12 months</p>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Average Monthly</h3>
        </template>

        <div class="text-3xl font-bold text-pink-600">
          {{
            Math.round(
              registrations.reduce((sum, count) => sum + count, 0) / 12,
            ).toLocaleString()
          }}
        </div>

        <p class="mt-2 text-sm text-gray-600">Registrations per month</p>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Peak Month</h3>
        </template>

        <div class="text-3xl font-bold text-pink-500">
          {{ Math.max(...registrations).toLocaleString() }}
        </div>

        <p class="mt-2 text-sm text-gray-600">
          {{ months[registrations.indexOf(Math.max(...registrations))] }}
        </p>
      </UCard>
    </div>

    <ClientOnly>
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Monthly Registration Trends</h3>
        </template>

        <div style="height: 500px">
          <VChart :option="barChartOption" />
        </div>
      </UCard>
    </ClientOnly>

    <ClientOnly>
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UCard>
          <div style="height: 600px">
            <VChart :option="institutionPieChartOption" />
          </div>
        </UCard>

        <UCard>
          <div style="height: 600px">
            <VChart :option="conferencePieChartOption" />
          </div>
        </UCard>
      </div>
    </ClientOnly>
  </div>
</template>
