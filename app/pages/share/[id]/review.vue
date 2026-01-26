<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const toast = useToast();
const { id } = route.params as { id: string };

useSeoMeta({
  title: "Review Poster Submission",
  description:
    "Review the content that will be archived with your poster submission.",
});

const zenodoLoginUrl = ref("");
const zenodoTokenExists = ref(false);

// Deposition selection state
const depositionMode = ref<"new" | "existing">("new");
const selectedDeposition = ref<number | null>(null);
const existingDepositions = ref<
  {
    id: number;
    title: string;
    state: string;
    submitted: boolean;
    conceptrecid: string;
  }[]
>([]);

const selectableDepositions = computed(() =>
  existingDepositions.value.map((d) => ({
    label: `${d.title} (${d.id})`,
    value: d.id,
  })),
);

const depositionModeOptions = [
  { label: "New Zenodo Deposition", value: "new" },
  { label: "Existing Zenodo Deposition", value: "existing" },
];

watch(depositionMode, () => {
  selectedDeposition.value = null;
});

const readyToArchive = computed(
  () =>
    depositionMode.value === "new" ||
    (depositionMode.value === "existing" && selectedDeposition.value !== null),
);

const { data: zenodoData, error: zenodoError } = await useFetch(
  "/api/release/zenodo",
  {
    headers: useRequestHeaders(["cookie"]),
    method: "GET",
    params: {
      posterId: id,
    },
  },
);

if (zenodoData.value) {
  zenodoLoginUrl.value = zenodoData.value.zenodoLoginURL;
  zenodoTokenExists.value = zenodoData.value.zenodoToken || false;
  existingDepositions.value = zenodoData.value.existingDepositions || [];
}

if (zenodoError.value) {
  console.error("Zenodo fetch error:", zenodoError.value);
}

// Zenodo sign-in handler
function handleZenodoSignIn() {
  window.location.href = zenodoLoginUrl.value;
}

async function handleArchive() {
  // TODO: implement archive logic
  const mode = depositionMode.value;
  const depositionId = selectedDeposition.value;

  toast.add({
    title:
      mode === "new"
        ? "Creating new Zenodo deposition..."
        : `Archiving to deposition ${depositionId}...`,
  });

  try {
    const response = await $fetch("/api/release/zenodo", {
      method: "POST",
      headers: useRequestHeaders(["cookie"]),
      body: {
        posterId: id,
        mode,
        depositionId,
      },
    });

    if (!response.ok) {
      toast.add({
        title: "Successfully archived!",
        type: "success",
        description: "We have successfully archived your poster!",
      });
    }
  } catch (error) {
    toast.add({
      title: "Error during archiving",
      description: (error as Error).message,
      type: "error",
    });
  }
}
</script>

<template>
  <div
    class="flex h-[calc(100vh-var(--ui-header-height))] items-center justify-center overflow-hidden px-6"
  >
    <div class="h-full w-full max-w-screen-xl px-8">
      <!-- Header row -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-highlighted text-2xl font-bold">
            Review Poster Submission
          </h1>

          <p class="text-muted text-sm">
            Verify your information before archiving
          </p>
        </div>

        <UButton
          variant="outline"
          icon="i-lucide-arrow-left"
          :to="`/share/${id}`"
        >
          Back to Edit
        </UButton>
      </div>

      <!-- File tree -->
      <div class="border-default bg-elevated mb-6 rounded-xl border p-6">
        <h3 class="mb-3 text-lg font-semibold">Submission Contents</h3>

        <UTree
          :items="[
            {
              label: 'poster_json.schema',
              icon: 'i-vscode-icons-file-type-vue',
            },
            {
              label: 'poster',
              icon: 'i-vscode-icons-file-type-nuxt',
            },
          ]"
        />
      </div>

      <!-- Zenodo section -->
      <div class="border-default bg-elevated rounded-xl border p-6">
        <!-- Not signed in -->
        <template v-if="!zenodoTokenExists">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <UIcon name="i-simple-icons-zenodo" class="text-muted size-8" />

              <p class="text-muted text-sm">
                Ready to archive on Zenodo? Sign in to get started.
              </p>
            </div>

            <UButton color="primary" size="lg" @click="handleZenodoSignIn">
              Sign in to Zenodo
            </UButton>
          </div>
        </template>

        <!-- Signed in -->
        <template v-else>
          <div
            class="flex gap-8"
            :class="depositionMode === 'new' ? 'items-center' : 'items-start'"
          >
            <!-- Deposition mode selection -->
            <div class="flex-1">
              <h3 class="mb-1 text-lg font-semibold">Archive to Zenodo</h3>

              <p class="text-muted mb-4 text-sm">
                Publish to a new deposition or select an existing one?
              </p>

              <URadioGroup
                v-model="depositionMode"
                :items="depositionModeOptions"
              />
            </div>

            <!-- Existing deposition selector + CTA -->
            <div
              class="flex flex-1 flex-col gap-4"
              :class="depositionMode === 'new' ? 'justify-center' : ''"
            >
              <div v-if="depositionMode === 'existing'">
                <p class="text-muted mb-2 text-sm">Select your Zenodo record</p>

                <USelect
                  v-model="selectedDeposition"
                  :items="selectableDepositions"
                  placeholder="Choose a deposition..."
                  class="w-full"
                />
              </div>

              <UButton
                color="primary"
                size="lg"
                :disabled="!readyToArchive"
                @click="handleArchive"
              >
                {{
                  depositionMode === "new"
                    ? "Create New Deposition"
                    : "Archive to Selected Deposition"
                }}
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
