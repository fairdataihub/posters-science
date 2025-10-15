<script setup lang="ts">
useSeoMeta({
  title: "Metrics",
  description: "Metrics for the posters.science platform",
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
      const data = (params as Array<{ name: string; value: number }>)[0];

      return data ? `${data.name}<br/>Registrations: ${data.value}` : "";
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
        color: "#3b82f6",
        borderRadius: [4, 4, 0, 0],
      },
      emphasis: {
        itemStyle: {
          color: "#1d4ed8",
        },
      },
      animationDelay: (idx: number) => idx * 100,
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
      title="Statistics and metrics for the posters.science platform"
      description="Analytics and insights for poster registrations and platform usage"
      variant="naked"
    />

    <div class="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Total Registrations</h3>
        </template>

        <div class="text-3xl font-bold text-blue-600">
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

        <div class="text-3xl font-bold text-green-600">
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

        <div class="text-3xl font-bold text-purple-600">
          {{ Math.max(...registrations).toLocaleString() }}
        </div>

        <p class="mt-2 text-sm text-gray-600">
          {{ months[registrations.indexOf(Math.max(...registrations))] }}
        </p>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">Monthly Registration Trends</h3>
      </template>

      <div style="height: 500px">
        <VChart :option="barChartOption" />
      </div>
    </UCard>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Posters by Institution</h3>
        </template>

        <div style="height: 400px">
          <VChart :option="institutionPieChartOption" />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Posters by Conference</h3>
        </template>

        <div style="height: 400px">
          <VChart :option="conferencePieChartOption" />
        </div>
      </UCard>
    </div>
  </div>
</template>
