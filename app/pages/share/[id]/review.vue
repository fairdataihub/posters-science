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
const selectedDeposition = ref<number | undefined>(undefined);
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
  selectedDeposition.value = undefined;
});

const readyToArchive = computed(
  () =>
    depositionMode.value === "new" ||
    (depositionMode.value === "existing" &&
      selectedDeposition.value !== undefined),
);

// Archive progress state
interface ArchiveStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "error";
}

const isArchiving = ref(false);
const archiveError = ref("");
const archiveComplete = ref(false);
const archiveResult = ref<Record<string, unknown> | null>(null);

const defaultSteps = (): ArchiveStep[] => [
  { id: "deposition", label: "Preparing deposition", status: "pending" },
  { id: "metadata", label: "Loading poster data", status: "pending" },
  { id: "upload_metadata", label: "Updating metadata", status: "pending" },
  { id: "upload_files", label: "Uploading poster files", status: "pending" },
  { id: "publish", label: "Publishing to Zenodo", status: "pending" },
];

const archiveSteps = ref<ArchiveStep[]>(defaultSteps());

const zenodoRecordUrl = computed(() => {
  const links = archiveResult.value?.links as
    | Record<string, string>
    | undefined;

  return links?.latest_html ?? "";
});

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
  console.log("Zenodo fetch data:", zenodoData.value);
  zenodoLoginUrl.value = zenodoData.value.zenodoLoginURL;
  zenodoTokenExists.value = zenodoData.value.zenodoToken || false;
  existingDepositions.value = (zenodoData.value.existingDepositions ||
    []) as typeof existingDepositions.value;
}

if (zenodoError.value) {
  console.error("Zenodo fetch error:", zenodoError.value);
}

// Zenodo sign-in handler
function handleZenodoSignIn() {
  window.location.href = zenodoLoginUrl.value;
}

async function handleZenodoDisconnect() {
  try {
    await $fetch("/api/zenodo/disconnect", { method: "POST" });
    zenodoTokenExists.value = false;
  } catch (error) {
    toast.add({
      title: "Error disconnecting from Zenodo",
      description: (error as Error).message,
    });
  }
}

function resetArchive() {
  isArchiving.value = false;
  archiveError.value = "";
  archiveComplete.value = false;
  archiveResult.value = null;
  archiveSteps.value = defaultSteps();
}

function handleProgressEvent(event: {
  step: string;
  status: string;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
}) {
  if (event.step === "complete") {
    archiveComplete.value = true;
    archiveResult.value = event.data ?? null;
    archiveSteps.value.forEach((s) => {
      if (s.status !== "error") s.status = "completed";
    });

    return;
  }

  if (event.step === "error") {
    archiveError.value = event.message || "An error occurred";
    const activeStep = archiveSteps.value.find(
      (s) => s.status === "in_progress",
    );

    if (activeStep) activeStep.status = "error";

    return;
  }

  const step = archiveSteps.value.find((s) => s.id === event.step);

  if (step) {
    step.status = event.status as ArchiveStep["status"];
  }
}

async function handleArchive() {
  resetArchive();
  isArchiving.value = true;

  try {
    const response = await fetch("/api/release/zenodo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posterId: id,
        mode: depositionMode.value,
        existingDepositionId: selectedDeposition.value,
      }),
    });

    if (!response.ok || !response.body) {
      archiveError.value = "Failed to connect to the server.";

      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;

        try {
          const event = JSON.parse(dataLine.slice(6));
          handleProgressEvent(event);
        } catch {
          // skip malformed events
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const dataLine = buffer.split("\n").find((l) => l.startsWith("data: "));
      if (dataLine) {
        try {
          const event = JSON.parse(dataLine.slice(6));
          handleProgressEvent(event);
        } catch {
          // skip malformed events
        }
      }
    }
  } catch (error) {
    archiveError.value =
      (error as Error).message || "An unexpected error occurred";
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
              label: 'poster.json',
              icon: 'i-vscode-icons-file-type-vue',
            },
            {
              label: 'poster.pdf',
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
          <!-- Archive progress -->
          <template v-if="isArchiving">
            <div class="mb-4 flex items-center gap-2">
              <UIcon name="i-simple-icons-zenodo" class="text-muted size-5" />

              <h3 class="text-lg font-semibold">
                <template v-if="archiveComplete">
                  Published to Zenodo
                </template>

                <template v-else-if="archiveError">
                  Publication Failed
                </template>

                <template v-else> Publishing to Zenodo... </template>
              </h3>
            </div>

            <!-- Step list -->
            <div class="space-y-3">
              <div
                v-for="step in archiveSteps"
                :key="step.id"
                class="flex items-center gap-3"
              >
                <UIcon
                  v-if="step.status === 'completed'"
                  name="i-lucide-circle-check"
                  class="text-success size-5 shrink-0"
                />

                <UIcon
                  v-else-if="step.status === 'in_progress'"
                  name="i-lucide-loader"
                  class="text-primary size-5 shrink-0 animate-spin"
                />

                <UIcon
                  v-else-if="step.status === 'error'"
                  name="i-lucide-circle-x"
                  class="text-error size-5 shrink-0"
                />

                <UIcon
                  v-else
                  name="i-lucide-circle-dashed"
                  class="text-muted size-5 shrink-0"
                />

                <span
                  :class="[
                    step.status === 'completed' && 'text-success',
                    step.status === 'in_progress' &&
                      'text-highlighted font-medium',
                    step.status === 'error' && 'text-error',
                    step.status === 'pending' && 'text-muted',
                  ]"
                >
                  {{ step.label }}
                </span>
              </div>
            </div>

            <!-- Error state -->
            <div v-if="archiveError" class="mt-5">
              <p class="text-error mb-3 text-sm">{{ archiveError }}</p>

              <UButton color="primary" @click="resetArchive">
                Try Again
              </UButton>
            </div>

            <!-- Success state -->
            <div v-if="archiveComplete" class="mt-5 flex items-center gap-3">
              <UButton
                v-if="zenodoRecordUrl"
                color="primary"
                icon="i-lucide-external-link"
                :to="zenodoRecordUrl"
                target="_blank"
              >
                View on Zenodo
              </UButton>

              <UButton variant="outline" :to="`/share/${id}`">
                Back to Poster
              </UButton>
            </div>
          </template>

          <!-- Archive controls (shown when not archiving) -->
          <template v-else>
            <div class="mb-4 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-simple-icons-zenodo" class="text-muted size-5" />

                <span class="text-muted text-sm">Connected to Zenodo</span>
              </div>

              <div class="flex items-center gap-3">
                <UButton
                  variant="outline"
                  color="error"
                  size="sm"
                  @click="handleZenodoDisconnect"
                >
                  Sign out
                </UButton>
              </div>
            </div>

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

              <!-- Existing deposition selector -->
              <div
                class="flex flex-1 flex-col gap-4"
                :class="depositionMode === 'new' ? 'justify-center' : ''"
              >
                <div v-if="depositionMode === 'existing'">
                  <p class="text-muted mb-2 text-sm">
                    Select your Zenodo record
                  </p>

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
        </template>
      </div>
    </div>
  </div>
</template>
