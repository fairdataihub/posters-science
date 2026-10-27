<script setup lang="ts">
import { LICENSE_OPTIONS_WITH_SUGGESTED } from "~/utils/poster_schema";
import { parseApiError } from "~/utils/apiError";
import ZenodoAccountStatus, {
  type ZenodoAccountDisplay,
} from "~/components/share/ZenodoAccountStatus.vue";

const props = defineProps<{
  posterId: string;
}>();

const id = props.posterId;

const toast = useToast();
const { siteEnv } = useRuntimeConfig().public;

const isProductionEnv = siteEnv === "production";

// Shared license selection
const selectedLicense = ref("");
const publicationVersion = ref("");

// Download completion state
const downloadComplete = ref(false);

// Poster JSON preview drawer
const posterJsonDrawerOpen = ref(false);
const posterJsonData = ref<Record<string, unknown> | null>(null);
const posterJsonLoading = ref(false);

async function openPosterJsonPreview() {
  posterJsonDrawerOpen.value = true;
  if (posterJsonData.value) return;
  posterJsonLoading.value = true;
  try {
    posterJsonData.value = await $fetch<Record<string, unknown>>(
      `/api/poster/${id}/poster-json`,
      { credentials: "include" },
    );
  } catch (err) {
    toast.add({
      title: "Preview Failed",
      description:
        err instanceof Error ? err.message : "Could not load poster.json",
      color: "error",
    });
    posterJsonDrawerOpen.value = false;
  } finally {
    posterJsonLoading.value = false;
  }
}

const zenodoLoginUrl = ref("");
const zenodoTokenSignIn = ref(false);
const zenodoNewTokenUrl = ref("");
const zenodoTokenExists = ref(false);
const zenodoLoading = ref(true);
const zenodoConfigError = ref(false);
const zenodoAccount = ref<ZenodoAccountDisplay | null>(null);
const zenodoDisconnecting = ref(false);

// Personal access token form, offered unless the zenodoToken maintenance
// switch is on.
const zenodoPersonalToken = ref("");
const zenodoTokenConnecting = ref(false);
const zenodoTokenError = ref("");

// Repository selection state
type Repository = "zenodo" | "figshare" | "download" | null;

const { messageFor: maintenanceMessageFor, zenodo: zenodoMaintenance } =
  useMaintenance();
// Zenodo is off when an admin pauses both ways of connecting. That also stops
// users who are already connected from publishing.
const zenodoPaused = computed(() => zenodoMaintenance.value.off !== null);
const zenodoOAuthPausedMessage = computed(() =>
  maintenanceMessageFor("zenodoOAuth"),
);

// Check for repository query param (e.g., after Zenodo OAuth redirect).
// "zenodo" is accepted here but dropped below while Zenodo is off, so a user
// returning from OAuth mid pause lands back on the picker.
const queryRepo = useRoute().query.repository;
const requestedRepository: Repository =
  queryRepo === "zenodo" ||
  queryRepo === "figshare" ||
  queryRepo === "download"
    ? queryRepo
    : null;
const selectedRepository = ref<Repository>(
  requestedRepository === "zenodo" && zenodoPaused.value
    ? null
    : requestedRepository,
);

const repositories = computed(() => [
  {
    id: "zenodo" as const,
    name: "Zenodo",
    icon: "i-simple-icons-zenodo",
    description: "General-purpose open repository",
    enabled: !zenodoPaused.value,
    unavailable: zenodoPaused.value,
  },
  {
    id: "figshare" as const,
    name: "Figshare",
    icon: "i-simple-icons-figshare",
    description: "Research data repository",
    enabled: false,
    unavailable: false,
  },
  {
    id: "download" as const,
    name: "Download Locally",
    icon: "i-lucide-download",
    description: "Download files to your computer to share on another platform",
    enabled: true,
    unavailable: false,
  },
]);

watch(zenodoPaused, (paused) => {
  if (paused && selectedRepository.value === "zenodo") {
    selectedRepository.value = null;
  }
});

// Download state
const isDownloading = ref(false);
const downloadAcknowledged = ref(false);

async function downloadMetadata() {
  isDownloading.value = true;
  window.umami?.track("download_initiated", { posterId: id });
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
    window.umami?.track("download_completed", { posterId: id });
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

// Deposition selection state
const depositionMode = ref<"new" | "existing">("new");
const selectedDeposition = ref<number | undefined>(undefined);
const manualDepositionId = ref("");
const linkedDepositionId = ref<number | undefined>(undefined);
const linkedDeposition = ref<{
  id: number;
  title: string;
  version?: string;
  doi?: string;
  url: string;
  isDraft: boolean;
} | null>(null);
const previousVersionLicense = ref("");
const isPosterVersion = ref(false);

const existingDepositions = ref<
  {
    id: number;
    title: string;
    isPublished: boolean;
    conceptDoi?: string;
    version?: string;
    versionIndex?: number;
  }[]
>([]);

// Drafts and published records behave very differently here (a draft is reused
// in place, a published record gets a new version) so label them apart.
const selectableDepositions = computed(() =>
  existingDepositions.value.map((d) => ({
    label: `${d.title} (${d.id})${d.isPublished ? "" : " (draft)"}`,
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
  if (!linkedDepositionId.value) selectedDeposition.value = undefined;
});

const effectiveDepositionId = computed(() => {
  if (linkedDepositionId.value) return linkedDepositionId.value;
  if (selectedDeposition.value) return selectedDeposition.value;
  const manual = Number.parseInt(manualDepositionId.value, 10);

  return Number.isFinite(manual) && manual > 0 ? manual : undefined;
});

const readyToArchive = computed(
  () =>
    !zenodoPaused.value &&
    !!selectedLicense.value &&
    (posterData.value?.automated || !!publicationVersion.value.trim()) &&
    (depositionMode.value === "new" ||
      (depositionMode.value === "existing" &&
        effectiveDepositionId.value !== undefined)),
);

// Archive progress state
interface ArchiveStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "error";
}

const feedbackOpen = useState("feedbackOpen", () => false);

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

const zenodoRecordUrl = computed(
  () => (archiveResult.value?.recordUrl as string | undefined) ?? "",
);

const { data: posterData, error: posterError } = useFetch(
  () => `/api/poster/${props.posterId}`,
  {
    headers: useRequestHeaders(["cookie"]),
    method: "GET",
  },
);
const posterDetailsUrl = computed(
  () => `/discover/${posterData.value?.rootPosterId ?? id}`,
);

const selectedDepositionDetails = computed(() =>
  existingDepositions.value.find(
    (deposition) => deposition.id === effectiveDepositionId.value,
  ),
);

function nextVersionLabel(version?: string, versionIndex?: number) {
  const normalized = version?.trim();

  if (normalized && /^\d+$/.test(normalized)) {
    return String(Number.parseInt(normalized, 10) + 1);
  }

  if (versionIndex && Number.isInteger(versionIndex)) {
    return String(versionIndex + 1);
  }

  return "";
}

const expectedPublicationVersion = computed(() => {
  if (posterData.value?.automated) return "";

  const localVersion = posterData.value?.posterMetadata?.version?.trim() ?? "";

  if (depositionMode.value === "existing") {
    const selected = selectedDepositionDetails.value;

    if (selected) {
      if (!selected.isPublished) {
        return selected.version?.trim() || localVersion || "1";
      }

      return (
        nextVersionLabel(selected.version, selected.versionIndex) ||
        localVersion ||
        "1"
      );
    }

    if (
      linkedDeposition.value &&
      linkedDeposition.value.id === effectiveDepositionId.value
    ) {
      if (linkedDeposition.value.isDraft) {
        return linkedDeposition.value.version?.trim() || localVersion || "1";
      }

      return nextVersionLabel(linkedDeposition.value.version) || localVersion;
    }
  }

  return localVersion || "1";
});

// Keep the suggested value in sync with the chosen deposition until the user
// deliberately replaces it with their own semantic version.
watch(
  expectedPublicationVersion,
  (expected, previousExpected) => {
    if (
      !publicationVersion.value ||
      publicationVersion.value === previousExpected
    ) {
      publicationVersion.value = expected;
    }
  },
  { immediate: true },
);

watch(posterError, (error) => {
  if (!error) return;
  console.error("Poster fetch error:", error);
  toast.add({
    title: "Error fetching poster",
    description: error.message,
    color: "error",
  });
});

const {
  data: zenodoData,
  pending: zenodoPending,
  error: zenodoFetchError,
  refresh: refreshZenodoStatus,
} = useFetch("/api/release/zenodo", {
  headers: useRequestHeaders(["cookie"]),
  method: "GET",
  params: {
    posterId: id,
  },
  server: false,
});

// Using watch instead of .then() because useFetch with server:false resolves its
// Promise immediately on the server with null data.
// watch() reacts when the client fetch completes.
watch(
  [zenodoData, zenodoPending, zenodoFetchError],
  ([data, pending, error]) => {
    if (pending) return;
    if (error) {
      console.error("Zenodo fetch error:", error);
      zenodoConfigError.value = true;
      zenodoLoading.value = false;

      return;
    }
    console.log("Zenodo fetch data:", data);
    zenodoLoginUrl.value = data?.zenodoLoginURL ?? "";
    zenodoTokenSignIn.value = data?.zenodoTokenSignIn ?? false;
    zenodoNewTokenUrl.value = data?.zenodoNewTokenUrl ?? "";
    zenodoTokenExists.value = data?.zenodoToken ?? false;
    zenodoConfigError.value = !data?.zenodoConfigured;
    zenodoAccount.value = data?.zenodoAccount ?? null;
    existingDepositions.value = (data?.existingDepositions ??
      []) as typeof existingDepositions.value;
    linkedDepositionId.value = data?.linkedDepositionId;
    linkedDeposition.value = data?.linkedDeposition ?? null;
    previousVersionLicense.value = data?.suggestedLicense ?? "";
    if (!selectedLicense.value && previousVersionLicense.value) {
      selectedLicense.value = previousVersionLicense.value;
    }
    isPosterVersion.value = Boolean(data?.isVersion);
    if (isPosterVersion.value) depositionMode.value = "existing";
    if (linkedDepositionId.value) {
      depositionMode.value = "existing";
      selectedDeposition.value = linkedDepositionId.value;
    }
    zenodoLoading.value = false;
  },
);

// Zenodo sign-in handler
function handleZenodoSignIn() {
  window.location.href = zenodoLoginUrl.value;
}

async function handleZenodoTokenConnect() {
  if (!zenodoPersonalToken.value.trim() || zenodoTokenConnecting.value) return;

  zenodoTokenConnecting.value = true;
  zenodoTokenError.value = "";

  try {
    await $fetch("/api/zenodo/token", {
      method: "POST",
      body: { token: zenodoPersonalToken.value },
    });

    zenodoPersonalToken.value = "";
    window.umami?.track("zenodo_token_connected", { posterId: id });

    zenodoLoading.value = true;
    await refreshZenodoStatus();
  } catch (error) {
    const { statusCode, statusMessage } = parseApiError(error);

    zenodoTokenError.value =
      statusMessage ?? "Could not connect to Zenodo. Please try again.";
    window.umami?.track("zenodo_token_failed", {
      posterId: id,
      status: statusCode ?? 0,
    });
  } finally {
    zenodoTokenConnecting.value = false;
  }
}

async function handleZenodoDisconnect() {
  zenodoDisconnecting.value = true;
  try {
    await $fetch("/api/zenodo/disconnect", { method: "POST" });
    zenodoTokenExists.value = false;
    zenodoAccount.value = null;
  } catch (error) {
    toast.add({
      title: "Error disconnecting from Zenodo",
      description: (error as Error).message,
    });
  } finally {
    zenodoDisconnecting.value = false;
  }
}

function selectRepository(repo: (typeof repositories.value)[number]) {
  if (!repo.enabled) return;
  selectedRepository.value = repo.id;
  window.umami?.track("zenodo_repository_selected", { repository: repo.id });
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
    window.umami?.track("zenodo_publish_completed", { posterId: id });
    archiveSteps.value.forEach((s) => {
      if (s.status !== "error") s.status = "completed";
    });
    setTimeout(() => {
      feedbackOpen.value = true;
    }, 3000);

    return;
  }

  if (event.step === "error") {
    archiveError.value = event.message || "An error occurred";
    window.umami?.track("zenodo_publish_error", { posterId: id });
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
  window.umami?.track("zenodo_publish_started", { posterId: id });

  try {
    const response = await fetch("/api/release/zenodo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posterId: id,
        mode: depositionMode.value,
        existingDepositionId: effectiveDepositionId.value,
        license: selectedLicense.value || undefined,
        version: posterData.value?.automated
          ? undefined
          : publicationVersion.value.trim(),
      }),
    });

    if (!response.ok || !response.body) {
      // Surface what the server actually said - this branch also catches the
      // "Invalid Zenodo token, please sign in again" 400, which is otherwise
      // indistinguishable from the server being unreachable.
      const detail = (await response.json().catch(() => null)) as {
        statusMessage?: string;
        message?: string;
      } | null;

      archiveError.value =
        detail?.statusMessage ||
        detail?.message ||
        `Request failed (${response.status} ${response.statusText})`;

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
  <div class="flex w-full flex-col gap-6">
    <MaintenanceNotice maintenance-key="zenodo" />

    <UAlert
      v-if="posterError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Could not load poster"
      :description="posterError.message"
    />

    <!-- File tree -->
    <div class="border-default mb-6 rounded-xl border p-6">
      <h3 class="mb-3 text-lg font-semibold">Submission Files</h3>

      <div class="flex flex-col">
        <div
          class="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-gray-50"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-vscode-icons-file-type-json" class="size-4" />

            <span class="text-sm">poster.json</span>
          </div>

          <UButton
            v-if="!isProductionEnv"
            variant="subtle"
            size="xs"
            icon="i-lucide-eye"
            @click="openPosterJsonPreview"
          >
            Preview file
          </UButton>
        </div>

        <div
          class="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50"
        >
          <UIcon name="i-vscode-icons-file-type-pdf2" class="size-4" />

          <span class="text-sm">{{
            posterData?.extractionJob?.fileName || "poster.pdf"
          }}</span>
        </div>
      </div>
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
          v-for="repo in repositories"
          :key="repo.id"
          :disabled="!repo.enabled"
          class="border-default hover:border-primary flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all"
          :class="[
            selectedRepository === repo.id ? 'border-primary bg-primary/5' : '',
            !repo.enabled && 'cursor-not-allowed opacity-50',
          ]"
          color="primary"
          variant="outline"
          @click="selectRepository(repo)"
        >
          <UIcon :name="repo.icon" class="size-12" />

          <span class="font-medium">{{ repo.name }}</span>

          <span class="text-muted text-xs">{{ repo.description }}</span>

          <UBadge v-if="repo.unavailable" color="warning" variant="subtle">
            Temporarily Unavailable
          </UBadge>

          <UBadge v-else-if="!repo.enabled" color="neutral" variant="subtle">
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

      <p class="mb-5 text-sm">
        <ULink
          to="https://zenodo.org"
          target="_blank"
          class="text-primary underline"
          >Zenodo</ULink
        >
        is a free and open-source general-purpose repository developed and
        maintained by the European Organization for Nuclear Research (CERN) in
        partnership with OpenAIRE. It is one of the most popular repositories
        for sharing posters.
      </p>

      <!-- Loading state while fetching Zenodo token status -->
      <UiSpinner v-if="zenodoLoading" class="py-8" />

      <!-- Zenodo is not set up on this server -->
      <UAlert
        v-else-if="zenodoConfigError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        title="Zenodo publishing isn't available right now"
        description="Please try again later, or download your files instead."
      />

      <!-- Not connected. OAuth sign-in and personal access tokens each have a
           maintenance switch (zenodoOAuth, zenodoToken), so either one can be
           offered on its own. -->
      <template v-else-if="!zenodoTokenExists">
        <!-- OAuth sign-in -->
        <template v-if="zenodoLoginUrl">
          <p class="mb-4 text-sm">
            If you don't have a Zenodo account already, please create one first
            at
            <ULink
              to="https://zenodo.org"
              target="_blank"
              class="text-primary underline"
            >
              zenodo.org</ULink
            >
            before continuing.
          </p>

          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            class="mb-4"
            title="Zenodo sign-in may require more than one attempt"
            description="There is a known issue where Zenodo authentication can occasionally fail on the first try. We are currently working with the Zenodo team to resolve this. If you are redirected to an error page, use your browser's Back button to return to the Zenodo authorization page and approve access again. It typically resolves after one or two attempts."
          />

          <div class="flex items-center justify-between">
            <p class="text-muted text-sm">
              Ready to archive on Zenodo? Sign in to get started.
            </p>

            <UButton color="primary" size="lg" @click="handleZenodoSignIn">
              Sign in to Zenodo
            </UButton>
          </div>
        </template>

        <!-- Personal access token -->
        <div
          v-if="zenodoTokenSignIn"
          :class="zenodoLoginUrl ? 'border-default mt-6 border-t pt-6' : ''"
        >
          <p v-if="zenodoLoginUrl" class="mb-4 text-sm font-medium">
            Or connect with a personal access token
          </p>

          <p v-else class="mb-4 text-sm">
            {{ zenodoOAuthPausedMessage }}
            Connect your Zenodo account with a personal access token.
          </p>

          <ol class="mb-5 list-inside list-decimal space-y-2 text-sm">
            <li>
              Sign in to Zenodo, or create a free account first if you don't
              have one.
            </li>

            <li>
              Open the
              <ULink
                :to="zenodoNewTokenUrl"
                target="_blank"
                class="text-primary underline"
                >new personal access token page</ULink
              >
              (Account settings, then Applications, then New token).
            </li>

            <li>
              Give it a name like <strong>Posters.science</strong>
              and tick both
              <strong>deposit:write</strong>
              and
              <strong>deposit:actions</strong>. You can leave user:email
              unticked.
            </li>

            <li>
              Click <strong>Create</strong>, then copy the token and paste it
              below. Zenodo only shows it once.
            </li>
          </ol>

          <form @submit.prevent="handleZenodoTokenConnect">
            <UFormField
              label="Personal access token"
              name="zenodoPersonalToken"
              :error="zenodoTokenError || false"
            >
              <div class="flex flex-col gap-3 sm:flex-row">
                <UInput
                  v-model="zenodoPersonalToken"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="Paste your token"
                  class="w-full sm:max-w-md"
                  :disabled="zenodoTokenConnecting"
                />

                <UButton
                  type="submit"
                  color="primary"
                  :loading="zenodoTokenConnecting"
                  :disabled="!zenodoPersonalToken.trim()"
                >
                  Connect to Zenodo
                </UButton>
              </div>
            </UFormField>
          </form>

          <p class="text-muted mt-4 text-xs">
            We check the token with Zenodo, store it encrypted, and only use it
            to publish the posters you choose. You can disconnect at any time,
            and deleting the token on Zenodo revokes our access completely.
          </p>
        </div>

        <!-- Neither way of connecting is available. Pausing both switches
             turns Zenodo off and disables it in the picker, so this shows
             when tokens are paused and OAuth is not configured. -->
        <UAlert
          v-if="!zenodoLoginUrl && !zenodoTokenSignIn"
          color="warning"
          variant="subtle"
          icon="material-symbols:build"
          title="Connecting to Zenodo is paused"
          :description="
            maintenanceMessageFor('zenodoToken') ||
            'Please try again later, or download your files instead.'
          "
        />
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

              <UButton variant="outline" :to="posterDetailsUrl">
                View Poster Details
              </UButton>
            </div>
          </div>
        </template>

        <!-- Archive controls (shown when not archiving) -->
        <template v-else>
          <ZenodoAccountStatus
            class="mb-4"
            :account="zenodoAccount"
            :disconnecting="zenodoDisconnecting"
            @disconnect="handleZenodoDisconnect"
          />

          <div>
            <p class="text-muted mb-4 text-sm">
              {{
                isPosterVersion
                  ? "This will be published as a new version of an existing Zenodo record."
                  : "Is your poster already published on Zenodo or would you like to create a new Zenodo publication?"
              }}
            </p>

            <div>
              <URadioGroup
                v-if="!isPosterVersion"
                v-model="depositionMode"
                :items="depositionModeOptions"
              />

              <!-- Existing deposition selector -->
              <div v-if="depositionMode === 'existing'" class="mt-4">
                <UAlert
                  v-if="linkedDepositionId"
                  color="success"
                  variant="soft"
                  icon="i-lucide-link"
                  title="Zenodo record selected automatically"
                >
                  <template #description>
                    <div class="flex flex-col items-start gap-2">
                      <p>
                        <span>
                          {{
                            linkedDeposition?.title ||
                            `Zenodo record ${linkedDepositionId}`
                          }}
                        </span>

                        <strong v-if="linkedDeposition?.version" class="ml-1">
                          (Version {{ linkedDeposition.version }})
                        </strong>
                      </p>

                      <UButton
                        v-if="linkedDeposition?.url"
                        :to="linkedDeposition.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        color="neutral"
                        variant="outline"
                        size="xs"
                        trailing-icon="i-lucide-external-link"
                      >
                        {{
                          linkedDeposition.isDraft
                            ? "Review draft on Zenodo"
                            : "View record on Zenodo"
                        }}
                      </UButton>
                    </div>
                  </template>
                </UAlert>

                <template v-else>
                  <p class="text-muted mb-2 text-sm">
                    Select your Zenodo record
                  </p>

                  <USelect
                    v-model="selectedDeposition"
                    :items="selectableDepositions"
                    placeholder="Choose a recent record..."
                    class="w-full max-w-md"
                  />

                  <div class="mt-3 max-w-md">
                    <p class="text-muted mb-2 text-sm">
                      Or enter a Zenodo record ID
                    </p>

                    <UInput
                      v-model="manualDepositionId"
                      inputmode="numeric"
                      placeholder="e.g. 12345678"
                      class="w-full"
                      :disabled="selectedDeposition !== undefined"
                    />
                  </div>
                </template>
              </div>

              <!-- Version selection -->
              <div v-if="!posterData?.automated" class="mt-4 max-w-md">
                <p class="text-muted mb-2 text-sm">
                  Version <span class="text-error">*</span>
                </p>

                <p class="text-muted mb-2 text-xs">Suggested version.</p>

                <UInput
                  v-model="publicationVersion"
                  placeholder="Enter version"
                  class="w-full"
                />
              </div>

              <!-- License selection -->
              <div class="mt-4">
                <p class="text-muted mb-2 text-sm">
                  License <span class="text-error">*</span>
                </p>

                <p
                  v-if="previousVersionLicense"
                  class="text-muted mb-2 text-xs"
                >
                  Preselected from the previous version. You can change it for
                  this version if needed.
                </p>

                <USelectMenu
                  v-model="selectedLicense"
                  :items="LICENSE_OPTIONS_WITH_SUGGESTED"
                  :value-key="`value`"
                  placeholder="Select a license"
                  class="w-full max-w-md"
                  :virtualize="true"
                />
              </div>

              <!-- Archive button -->
              <div class="mt-6">
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
          </div>
        </template>
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
          Your poster remains a draft. Once you have published it to a
          repository, return to your dashboard to add the publication details
          and make it discoverable on Posters.science.
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
          Download my files
        </UButton>
      </template>
    </div>

    <UDrawer
      v-model:open="posterJsonDrawerOpen"
      direction="right"
      :ui="{ content: 'w-[600px] max-w-full' }"
    >
      <template #content>
        <div class="flex h-full flex-col gap-4 p-6">
          <div class="flex items-center gap-2">
            <UIcon name="i-vscode-icons-file-type-json" class="size-5" />

            <h3 class="text-lg font-semibold">poster.json preview</h3>
          </div>

          <UiSpinner v-if="posterJsonLoading" />

          <pre
            v-else-if="posterJsonData"
            class="bg-muted overflow-auto rounded-lg p-4 text-xs"
            >{{ JSON.stringify(posterJsonData, null, 2) }}</pre
          >
        </div>
      </template>
    </UDrawer>
  </div>
</template>
