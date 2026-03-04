<script setup lang="ts">
import { LICENSE_OPTIONS } from "~/utils/poster_schema";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const toast = useToast();
const { id } = route.params as { id: string };

// Shared license selection (used by Zenodo and simulated flows)
const selectedLicense = ref("");

// Download completion state
const downloadComplete = ref(false);

useSeoMeta({
  title: "Submit Poster",
  description: "Archive your poster on a trusted repository.",
});

const zenodoLoginUrl = ref("");
const zenodoTokenExists = ref(false);

// Repository selection state
type Repository =
  | "zenodo"
  | "zenodo-simulated"
  | "figshare"
  | "download"
  | null;

// Check for repository query param (e.g., after Zenodo OAuth redirect)
const queryRepo = useRoute().query.repository;
const selectedRepository = ref<Repository>(
  queryRepo === "zenodo" ||
    queryRepo === "zenodo-simulated" ||
    queryRepo === "figshare" ||
    queryRepo === "download"
    ? queryRepo
    : null,
);

const repositories = [
  {
    id: "zenodo" as const,
    name: "Zenodo",
    icon: "i-simple-icons-zenodo",
    description: "General-purpose open repository",
    enabled: true,
  },
  {
    id: "zenodo-simulated" as const,
    name: "Zenodo (Simulated)",
    icon: "i-simple-icons-zenodo",
    description: "Preview-only flow for beta testing",
    enabled: true,
    hidden: true,
  },
  {
    id: "figshare" as const,
    name: "Figshare",
    icon: "i-simple-icons-figshare",
    description: "Research data repository",
    enabled: false,
  },
  {
    id: "download" as const,
    name: "Download Locally",
    icon: "i-lucide-download",
    description: "Download files to your computer to share on another platform",
    enabled: true,
  },
];

const visibleRepositories = computed(() =>
  repositories.filter((repo) => !repo.hidden),
);

// Download state
const isDownloading = ref(false);
const downloadAcknowledged = ref(false);
const isSimulatedPublishing = ref(false);
const simulatedPublished = ref(false);

async function downloadMetadata() {
  isDownloading.value = true;
  try {
    const response = await fetch(`/api/poster/${id}/download`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      const text = await response.text();
      let message = `Request failed (${response.status})`;
      try {
        const json = JSON.parse(text) as {
          message?: string;
          statusMessage?: string;
        };
        message = json.statusMessage ?? json.message ?? message;
      } catch {
        if (text) message = text.slice(0, 120);
      }
      toast.add({
        title: "Download Failed",
        description: message,
        color: "error",
      });

      return;
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
    const filename = filenameMatch?.[1] ?? `poster-${id}.zip`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    downloadComplete.value = true;
  } catch (err) {
    console.error("[download]", err);
    toast.add({
      title: "Download Failed",
      description:
        err instanceof Error
          ? err.message
          : "Could not download the poster package.",
      color: "error",
    });
  } finally {
    isDownloading.value = false;
  }
}

async function handleSimulatedArchive() {
  isSimulatedPublishing.value = true;

  try {
    const response = await $fetch("/api/release/zenodo/simulated", {
      method: "POST",
      body: {
        posterId: id,
        license: selectedLicense.value || undefined,
      },
    });

    if (!response?.success) {
      throw new Error("Failed to simulate publication");
    }

    simulatedPublished.value = true;
  } catch (error) {
    toast.add({
      title: "Simulation Failed",
      description:
        error instanceof Error
          ? error.message
          : "Could not complete simulated publication.",
      color: "error",
    });
  } finally {
    isSimulatedPublishing.value = false;
  }
}

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
  {
    label: "Create a new Zenodo deposition",
    value: "new",
  },
  {
    label: "Create a new version of an existing Zenodo deposition",
    value: "existing",
  },
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

const { data: posterData, error: posterError } = await useFetch(
  `/api/poster/${id}`,
  {
    headers: useRequestHeaders(["cookie"]),
    method: "GET",
  },
);

if (posterError.value) {
  console.error("Poster fetch error:", posterError.value);
  toast.add({
    title: "Error fetching poster",
    description: posterError.value.message,
    color: "error",
  });
}

useFetch("/api/release/zenodo", {
  headers: useRequestHeaders(["cookie"]),
  method: "GET",
  params: {
    posterId: id,
  },
  server: false,
})
  .then((response) => {
    const data = response.data?.value;
    console.log("Zenodo fetch data:", data);
    zenodoLoginUrl.value = data?.zenodoLoginURL ?? "";
    zenodoTokenExists.value = data?.zenodoToken ?? false;
    existingDepositions.value = (data?.existingDepositions ??
      []) as typeof existingDepositions.value;
  })
  .catch((error) => {
    console.error("Zenodo fetch error:", error);
  });

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
        license: selectedLicense.value || undefined,
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
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6 pb-10">
    <UPageHeader
      title="Review Poster Submission"
      description="Verify your information before archiving"
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Upload Poster', to: '/share/new' },
            { label: 'Review Metadata', to: `/share/${id}` },
            { label: 'Submit Poster' },
          ]"
        />
      </template>

      <template #actions>
        <UButton
          variant="outline"
          icon="i-lucide-arrow-left"
          :to="`/share/${id}`"
        >
          Back to Edit
        </UButton>
      </template>
    </UPageHeader>

    <!-- File tree -->
    <div class="border-default mb-6 rounded-xl border p-6">
      <h3 class="mb-3 text-lg font-semibold">Submission Files</h3>

      <UTree
        :items="[
          {
            label: 'poster.json',
            icon: 'i-vscode-icons-file-type-json',
          },
          {
            label: posterData?.extractionJob?.fileName || 'poster.pdf',
            icon: 'i-vscode-icons-file-type-pdf2',
          },
        ]"
      />
    </div>

    <!-- Repository selection -->
    <div class="border-default mb-6 rounded-xl border p-6">
      <h3 class="mb-2 text-lg font-semibold">Select a Repository</h3>

      <p class="text-muted mb-6 text-sm">
        Choose where you would like to archive your poster. Click one of the
        following options:
      </p>

      <div class="grid grid-cols-3 gap-4 md:grid-cols-3">
        <UButton
          v-for="repo in visibleRepositories"
          :key="repo.id"
          :disabled="!repo.enabled"
          class="border-default hover:border-primary flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all"
          :class="[
            selectedRepository === repo.id ? 'border-primary bg-primary/5' : '',
            !repo.enabled && 'cursor-not-allowed opacity-50',
          ]"
          color="primary"
          variant="outline"
          @click="repo.enabled && (selectedRepository = repo.id)"
        >
          <UIcon :name="repo.icon" class="size-12" />

          <span class="font-medium">{{ repo.name }}</span>

          <span class="text-muted text-xs">{{ repo.description }}</span>

          <UBadge
            v-if="repo.id === 'zenodo-simulated'"
            color="warning"
            variant="solid"
          >
            Beta
          </UBadge>

          <UBadge v-if="!repo.enabled" color="neutral" variant="subtle">
            Coming Soon
          </UBadge>
        </UButton>
      </div>
    </div>

    <!-- Zenodo section -->
    <div
      v-if="selectedRepository === 'zenodo'"
      class="border-default rounded-xl border p-6"
    >
      <div class="mb-4 flex items-center gap-2">
        <UIcon name="i-simple-icons-zenodo" class="size-6" />

        <h3 class="text-lg font-semibold">Archive to Zenodo</h3>
      </div>

      <!-- Not signed in -->
      <template v-if="!zenodoTokenExists">
        <div class="flex items-center justify-between">
          <p class="text-muted text-sm">
            Ready to archive on Zenodo? Sign in to get started.
          </p>

          <UButton color="primary" size="lg" @click="handleZenodoSignIn">
            Sign in to Zenodo
          </UButton>
        </div>
      </template>

      <!-- Signed in -->
      <template v-else>
        <!-- Archive progress -->
        <template v-if="isArchiving">
          <p class="text-muted mb-4 text-sm">
            <template v-if="archiveComplete">
              Your poster has been published to Zenodo.
            </template>

            <template v-else-if="archiveError">
              There was an error publishing to Zenodo.
            </template>

            <template v-else> Publishing your poster to Zenodo... </template>
          </p>

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

            <UButton color="primary" @click="resetArchive"> Try Again </UButton>
          </div>

          <!-- Success state -->
          <div v-if="archiveComplete" class="mt-5 flex flex-col gap-4">
            <UAlert
              color="success"
              variant="subtle"
              icon="i-lucide-circle-check"
              title="Your poster has been published to Zenodo!"
            />

            <p class="text-sm">
              Your poster is also registered in Posters.science and is
              discoverable under
              <NuxtLink to="/discover" class="text-primary font-medium"
                >Find Posters</NuxtLink
              >.
            </p>

            <div class="flex items-center gap-3">
              <UButton
                v-if="zenodoRecordUrl"
                color="primary"
                icon="i-lucide-external-link"
                :to="zenodoRecordUrl"
                target="_blank"
              >
                View on Zenodo
              </UButton>

              <UButton variant="outline" to="/discover"> Find Posters </UButton>

              <UButton variant="outline" :to="`/share/${id}`">
                View Poster Details
              </UButton>
            </div>
          </div>
        </template>

        <!-- Archive controls (shown when not archiving) -->
        <template v-else>
          <div class="mb-4 flex items-center justify-between">
            <span class="text-success flex items-center gap-2 text-sm">
              <UIcon name="i-lucide-check-circle" class="size-4" />
              Connected to Zenodo
            </span>

            <UButton
              variant="outline"
              color="error"
              size="sm"
              @click="handleZenodoDisconnect"
            >
              Sign out
            </UButton>
          </div>

          <div>
            <p class="text-muted mb-4 text-sm">
              Is your poster already published on Zenodo or would you like to
              create a new Zenodo publication?
            </p>

            <div class="flex items-start gap-8">
              <!-- Deposition mode selection -->
              <div class="flex-1">
                <URadioGroup
                  v-model="depositionMode"
                  :items="depositionModeOptions"
                />

                <!-- Existing deposition selector -->
                <div v-if="depositionMode === 'existing'" class="mt-4">
                  <p class="text-muted mb-2 text-sm">
                    Select your Zenodo record
                  </p>

                  <USelect
                    v-model="selectedDeposition"
                    :items="selectableDepositions"
                    placeholder="Choose a deposition..."
                    class="w-full max-w-md"
                  />
                </div>

                <!-- License selection -->
                <div class="mt-4">
                  <p class="text-muted mb-2 text-sm">License</p>

                  <USelect
                    v-model="selectedLicense"
                    :items="LICENSE_OPTIONS"
                    placeholder="Select a license"
                    class="w-full max-w-md"
                  />
                </div>
              </div>

              <!-- Archive button -->
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

    <!-- Simulated Zenodo section -->
    <div
      v-if="selectedRepository === 'zenodo-simulated'"
      class="border-default rounded-xl border p-6"
    >
      <div class="mb-4 flex items-center gap-2">
        <UIcon name="i-simple-icons-zenodo" class="size-6" />

        <h3 class="text-lg font-semibold">Zenodo (Simulated)</h3>
      </div>

      <p class="text-muted text-sm">
        This is a temporary beta placeholder. The live Zenodo workflow remains
        implemented but hidden from the repository card list.
      </p>

      <!-- Success state -->
      <template v-if="simulatedPublished">
        <div class="mt-5 flex flex-col gap-4">
          <UAlert
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            title="Your poster has been registered in Posters.science!"
            description="Other users can now search and find your poster via our discovery portal."
          />

          <div class="flex gap-3">
            <UButton color="primary" to="/dashboard"> Go to Dashboard </UButton>

            <UButton variant="outline" to="/discover"> Find Posters </UButton>
          </div>
        </div>
      </template>

      <!-- Publish controls -->
      <template v-else>
        <div class="mt-5 flex flex-col gap-4">
          <div>
            <p class="text-muted mb-2 text-sm">License</p>

            <USelect
              v-model="selectedLicense"
              :items="LICENSE_OPTIONS"
              placeholder="Select a license"
              class="w-full max-w-md"
            />
          </div>

          <div>
            <UButton
              color="primary"
              size="lg"
              :loading="isSimulatedPublishing"
              @click="handleSimulatedArchive"
            >
              Mark as Published (Simulated)
            </UButton>
          </div>
        </div>
      </template>
    </div>

    <!-- Download section -->
    <div
      v-if="selectedRepository === 'download'"
      class="border-default flex flex-col gap-6 rounded-xl border p-6"
    >
      <div class="mb-4 flex items-center gap-2">
        <UIcon name="i-lucide-download" class="size-6" />

        <h3 class="text-lg font-semibold">Download Files</h3>
      </div>

      <!-- Success state -->
      <template v-if="downloadComplete">
        <UAlert
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          title="Files Downloaded"
          description="Your poster files have been downloaded successfully."
        />

        <p class="text-sm">
          Your poster is now registered in Posters.science and is discoverable
          under
          <NuxtLink to="/discover" class="text-primary font-medium"
            >Find Posters</NuxtLink
          >.
        </p>

        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-pencil"
          title="Your poster.json is incomplete"
          description="Before sharing your poster anywhere, open poster.json and manually add your identifier (e.g. DOI), license, and publishing platform. Then return to your dashboard to update this information on Posters.science."
        />

        <div class="flex gap-3">
          <UButton color="primary" to="/dashboard"> Go to Dashboard </UButton>

          <UButton variant="outline" to="/discover"> Find Posters </UButton>
        </div>
      </template>

      <!-- Pre-download state -->
      <template v-else>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          title="Heads up: poster.json will be incomplete"
          description="The downloaded poster.json will have blank identifier, license, and publisher fields. You will need to edit the file manually before sharing, or return to your dashboard to update this information via Posters.science."
        />

        <UCheckbox
          v-model="downloadAcknowledged"
          label="I understand that my poster.json will be incomplete"
        />

        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-download"
          :loading="isDownloading"
          :disabled="!downloadAcknowledged"
          @click="downloadMetadata"
        >
          Download my files and register my poster on Posters.science
        </UButton>
      </template>
    </div>
  </div>
</template>
