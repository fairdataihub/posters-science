<script setup lang="ts">
import dayjs from "dayjs";
import { LICENSE_OPTIONS } from "~/utils/poster_schema";
import { normalizeDoi, validateDoi } from "~/utils/doi";

definePageMeta({
  middleware: ["auth"],
});

const ogImage = `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent("Posters.science")}&description=${encodeURIComponent("Manage and track your scientific posters")}&app=posters-science&org=fairdataihub`;

useSeoMeta({
  title: "Dashboard - Posters.science",
  description: "Manage and track your scientific posters.",
  ogTitle: "Dashboard - Posters.science",
  ogDescription: "Manage and track your scientific posters.",
  ogImage,
});

type Poster = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  automated: boolean;
  status: "draft" | "downloaded" | "published";
  tombstone: boolean;
  tombedReason: string;
  versionSequence: number;
  publishedAt: Date | null;
  created: Date;
  updated: Date;
  posterMetadata: {
    publisher: string | null;
    publicationYear: number | null;
    doi: string | null;
    license: string | null;
    version: string | null;
  };
  extractionJob?: {
    id?: string;
    status: string;
    completed?: boolean;
    error?: string | null;
  } | null;
  rootPosterId: number;
  versionCount: number;
  activeVersionDraft?: {
    id: number;
    versionSequence: number;
    imageUrl: string;
    title: string;
    description: string;
    extractionJob?: {
      id?: string;
      status: string;
      completed?: boolean;
      error?: string | null;
    } | null;
  } | null;
};

type VersionJobStatusResponse = {
  completed: boolean;
  status: string;
  posterId?: number;
  error?: string | null;
  imageUrl?: string;
  title?: string;
  description?: string;
};

const posters = ref<Poster[]>([]);
const showTombstonedPosters = useCookie<boolean>(
  "dashboard-show-tombstoned-posters",
  {
    default: () => true,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
);

const tombstonedPosterCount = computed(
  () => posters.value.filter((poster) => poster.tombstone).length,
);
const visiblePosters = computed(() =>
  showTombstonedPosters.value
    ? posters.value
    : posters.value.filter((poster) => !poster.tombstone),
);

const { data, error, refresh } = await useFetch("/api/poster");

if (data.value) {
  posters.value = data.value as unknown as Poster[];
}

if (error.value) {
  console.error(error.value);
}

// Publication info modal state
const modalOpen = ref(false);
const modalPoster = ref<Poster | null>(null);
const modalDoi = ref("");
const modalLicense = ref("");
const modalPublisher = ref("");
const isSaving = ref(false);
const doiError = ref("");
const toast = useToast();
const tombstoneModalOpen = ref(false);
const tombstonedPoster = ref<Poster | null>(null);

const versionModalOpen = ref(false);
const versionPoster = ref<Poster | null>(null);
const versionFileMode = ref<"reuse" | "upload">("reuse");
const versionMetadataMode = ref<"copy" | "extract">("copy");
const versionFiles = ref<File[]>([]);
const creatingVersion = ref(false);
const versionError = ref("");
const versionPollingError = ref("");
const retryingVersionExtraction = ref(false);
const deleteVersionModalOpen = ref(false);
const deletingVersionDraft = ref(false);
const pollingVersionJobId = ref<string | null>(null);
let versionPollTimer: ReturnType<typeof setTimeout> | undefined;
let versionPollGeneration = 0;
const pollingVersionThumbnailJobId = ref<string | null>(null);
let versionThumbnailPollTimer: ReturnType<typeof setTimeout> | undefined;
let versionThumbnailPollGeneration = 0;

const versionFileOptions = [
  {
    label: "Keep the current poster file",
    description:
      "Choose this when the poster is unchanged but its supplemental metadata need to be updated.",
    value: "reuse",
  },
  {
    label: "Replace the poster file",
    description:
      "Upload a revised PDF or image when the poster itself has changed.",
    value: "upload",
  },
];
const versionMetadataOptions = [
  {
    label: "Keep and edit the current metadata",
    description:
      "Best for smaller poster revisions. Copies the published metadata so you can make targeted edits without waiting for another extraction.",
    value: "copy",
  },
  {
    label: "Extract metadata from the replacement file",
    description:
      "Best when the poster content changed enough. Use the new poster to extract new metadata for your review.",
    value: "extract",
  },
];

function isVersionExtracting(draft: Poster["activeVersionDraft"]): boolean {
  return (
    draft?.extractionJob?.status === "pending-extraction" ||
    draft?.extractionJob?.status === "processing"
  );
}

function isVersionExtractionFailed(
  draft: Poster["activeVersionDraft"],
): boolean {
  return draft?.extractionJob?.status === "failed";
}

function isVersionReviewReady(draft: Poster["activeVersionDraft"]): boolean {
  return Boolean(
    draft &&
    (!draft.extractionJob ||
      draft.extractionJob.completed ||
      draft.extractionJob.status === "completed"),
  );
}

const currentVersionDraft = computed(
  () => versionPoster.value?.activeVersionDraft ?? null,
);
const versionPanelState = computed<"setup" | "extracting" | "ready" | "failed">(
  () => {
    if (!currentVersionDraft.value) return "setup";
    if (isVersionExtractionFailed(currentVersionDraft.value)) return "failed";
    if (isVersionExtracting(currentVersionDraft.value)) return "extracting";

    return "ready";
  },
);
const versionExtractionStatus = computed(() => {
  const status = currentVersionDraft.value?.extractionJob?.status;
  if (status === "pending-extraction") {
    return {
      title: "Waiting for extraction to start",
      description:
        "The job is saved in the queue. The extraction service will claim it automatically.",
    };
  }
  if (status === "processing") {
    return {
      title: "Extracting poster metadata",
      description:
        "The extraction service is analyzing the poster and saving the fields you'll review and edit next.",
    };
  }

  return {
    title: "Preparing your edits",
    description: "Your editable draft is being prepared.",
  };
});

const extractingVersionPoster = computed(() =>
  posters.value.find((poster) =>
    isVersionExtracting(poster.activeVersionDraft),
  ),
);
const posterAwaitingDraftThumbnail = computed(() =>
  posters.value.find(
    (poster) =>
      poster.activeVersionDraft?.extractionJob?.id &&
      !poster.activeVersionDraft.imageUrl,
  ),
);

function versionActionDisabled(poster: Poster) {
  return Boolean(
    extractingVersionPoster.value &&
    !isVersionExtracting(poster.activeVersionDraft) &&
    extractingVersionPoster.value.rootPosterId !== poster.rootPosterId,
  );
}

function versionActionLabel(poster: Poster) {
  if (isVersionExtracting(poster.activeVersionDraft)) {
    return "View extraction progress";
  }
  if (isVersionExtractionFailed(poster.activeVersionDraft)) {
    return "Resolve extraction issue";
  }

  return "Edit";
}

function versionActionTooltip(poster: Poster) {
  if (isVersionExtracting(poster.activeVersionDraft)) {
    return "Open the edit panel to view metadata extraction progress.";
  }
  if (isVersionExtractionFailed(poster.activeVersionDraft)) {
    return "Open the edit panel to review the extraction issue.";
  }
  if (
    extractingVersionPoster.value &&
    extractingVersionPoster.value.rootPosterId !== poster.rootPosterId
  ) {
    return `Wait for metadata extraction on “${extractingVersionPoster.value.title}” to finish.`;
  }

  return poster.activeVersionDraft
    ? "Continue editing this published poster."
    : "Edit this published poster. Publishing your changes creates a new version.";
}

function displayedVersion(poster: Poster) {
  if (poster.status !== "published") return null;
  if (poster.automated) return poster.posterMetadata.version?.trim() || null;

  return (
    poster.posterMetadata.version?.trim() || String(poster.versionSequence)
  );
}

watch(versionFileMode, (mode) => {
  versionError.value = "";
  if (mode === "reuse") {
    versionMetadataMode.value = "copy";
    versionFiles.value = [];
  }
});

function openVersionModal(poster: Poster) {
  versionPoster.value = poster;
  if (!poster.activeVersionDraft) {
    versionFileMode.value = "reuse";
    versionMetadataMode.value = "copy";
    versionFiles.value = [];
  }
  versionError.value = "";
  versionPollingError.value = "";
  versionModalOpen.value = true;

  const activeJob = poster.activeVersionDraft?.extractionJob?.id;
  if (activeJob && isVersionExtracting(poster.activeVersionDraft)) {
    startVersionExtractionPolling(activeJob);
  }
}

function updateLocalVersionJob(
  posterId: number | undefined,
  status: string,
  completed: boolean,
  error?: string | null,
) {
  if (!posterId) return;

  for (const poster of posters.value) {
    if (poster.activeVersionDraft?.id === posterId) {
      poster.activeVersionDraft.extractionJob = {
        ...poster.activeVersionDraft.extractionJob,
        status,
        completed,
        error,
      };

      return;
    }
  }
}

function updateLocalVersionThumbnail(
  posterId: number | undefined,
  imageUrl: string | undefined,
) {
  if (!posterId || !imageUrl) return;

  const poster = posters.value.find(
    (candidate) => candidate.activeVersionDraft?.id === posterId,
  );
  if (poster?.activeVersionDraft) {
    poster.activeVersionDraft.imageUrl = imageUrl;
  }
}

function updateLocalVersionDetails(
  posterId: number | undefined,
  title: string | undefined,
  description: string | undefined,
) {
  if (!posterId) return;

  const draft = posters.value.find(
    (poster) => poster.activeVersionDraft?.id === posterId,
  )?.activeVersionDraft;
  if (!draft) return;

  if (title !== undefined) draft.title = title;
  if (description !== undefined) draft.description = description;
}

async function refreshPosterList() {
  const openRootId = versionPoster.value?.rootPosterId;
  await refresh();
  posters.value = (data.value ?? []) as unknown as Poster[];
  if (openRootId) {
    versionPoster.value =
      posters.value.find((poster) => poster.rootPosterId === openRootId) ??
      null;
  }
}

function stopVersionExtractionPolling() {
  versionPollGeneration += 1;
  pollingVersionJobId.value = null;
  if (versionPollTimer) {
    clearTimeout(versionPollTimer);
    versionPollTimer = undefined;
  }
}

function stopVersionThumbnailPolling() {
  versionThumbnailPollGeneration += 1;
  pollingVersionThumbnailJobId.value = null;
  if (versionThumbnailPollTimer) {
    clearTimeout(versionThumbnailPollTimer);
    versionThumbnailPollTimer = undefined;
  }
}

function startVersionThumbnailPolling(jobId: string) {
  if (pollingVersionThumbnailJobId.value === jobId) return;

  stopVersionThumbnailPolling();
  pollingVersionThumbnailJobId.value = jobId;
  const generation = versionThumbnailPollGeneration;
  let attempts = 0;

  const checkThumbnail = async () => {
    if (generation !== versionThumbnailPollGeneration) return;

    try {
      const response = await $fetch<VersionJobStatusResponse>(
        `/api/poster/job/${jobId}`,
      );

      if (generation !== versionThumbnailPollGeneration) return;
      if (response.imageUrl) {
        updateLocalVersionThumbnail(response.posterId, response.imageUrl);
        pollingVersionThumbnailJobId.value = null;

        return;
      }
    } catch {
      // Keep the published thumbnail visible and retry while the draft
      // thumbnail is being generated.
    }

    attempts += 1;
    if (attempts >= 40) {
      pollingVersionThumbnailJobId.value = null;

      return;
    }

    if (generation === versionThumbnailPollGeneration) {
      versionThumbnailPollTimer = setTimeout(checkThumbnail, 3000);
    }
  };

  void checkThumbnail();
}

function startVersionExtractionPolling(jobId: string) {
  if (pollingVersionJobId.value === jobId) return;

  stopVersionExtractionPolling();
  pollingVersionJobId.value = jobId;
  const generation = versionPollGeneration;

  const checkStatus = async () => {
    if (generation !== versionPollGeneration) return;

    try {
      const response = await $fetch<VersionJobStatusResponse>(
        `/api/poster/job/${jobId}`,
      );

      if (generation !== versionPollGeneration) return;

      versionPollingError.value = "";
      updateLocalVersionJob(
        response.posterId,
        response.status,
        response.completed,
        response.error,
      );
      updateLocalVersionThumbnail(response.posterId, response.imageUrl);
      updateLocalVersionDetails(
        response.posterId,
        response.title,
        response.description,
      );

      if (response.completed && response.status === "completed") {
        const keepPanelOpen =
          versionModalOpen.value &&
          currentVersionDraft.value?.extractionJob?.id === jobId;
        pollingVersionJobId.value = null;
        await refreshPosterList();
        if (!keepPanelOpen && response.posterId) {
          const completedPoster = posters.value.find(
            (poster) => poster.activeVersionDraft?.id === response.posterId,
          );
          const completedDraft = completedPoster?.activeVersionDraft;

          toast.add({
            title: completedDraft
              ? `Your edits for version ${completedDraft.versionSequence} are ready to review`
              : "Your edits are ready to review",
            description: completedPoster
              ? `Metadata extraction finished for ${completedPoster.title}. Select the poster to continue reviewing it.`
              : "Metadata extraction finished. Select the poster to continue reviewing it.",
            color: "success",
            icon: "i-lucide-circle-check",
          });
        }

        return;
      }

      if (response.status === "failed") {
        pollingVersionJobId.value = null;
        await refreshPosterList();
        toast.add({
          title: "Metadata extraction failed",
          description: response.error || "Open the edit panel for details.",
          color: "error",
        });

        return;
      }
    } catch (error) {
      if (generation !== versionPollGeneration) return;

      versionPollingError.value =
        error instanceof Error
          ? `Could not refresh the extraction status: ${error.message}`
          : "Could not refresh the extraction status. Retrying…";
    }

    if (generation === versionPollGeneration) {
      versionPollTimer = setTimeout(checkStatus, 3000);
    }
  };

  void checkStatus();
}

async function reviewVersionDraft() {
  const draftId = currentVersionDraft.value?.id;
  if (draftId) {
    versionModalOpen.value = false;
    await navigateTo(`/share/${draftId}`);
  }
}

async function retryVersionExtraction() {
  const jobId = currentVersionDraft.value?.extractionJob?.id;
  const posterId = currentVersionDraft.value?.id;
  if (!jobId || !posterId) return;

  retryingVersionExtraction.value = true;
  versionPollingError.value = "";

  try {
    const response = await $fetch<{
      status: string;
      completed: boolean;
      error?: string | null;
    }>(`/api/poster/job/${jobId}/retry`, { method: "POST" });

    updateLocalVersionJob(
      posterId,
      response.status,
      response.completed,
      response.error,
    );
    startVersionExtractionPolling(jobId);
  } catch (error) {
    versionPollingError.value =
      error instanceof Error
        ? error.message
        : "Could not restart metadata extraction.";
  } finally {
    retryingVersionExtraction.value = false;
  }
}

async function deleteVersionDraft() {
  const draft = currentVersionDraft.value;
  if (!draft) return;

  const jobId = draft.extractionJob?.id;
  const rootPosterId = versionPoster.value?.rootPosterId;
  const wasExtracting = isVersionExtracting(draft);
  const wasPollingThumbnail =
    pollingVersionThumbnailJobId.value === draft.extractionJob?.id;
  deletingVersionDraft.value = true;
  versionPollingError.value = "";
  stopVersionExtractionPolling();
  stopVersionThumbnailPolling();

  try {
    await $fetch(`/api/poster/${draft.id}`, { method: "DELETE" });

    const dashboardPoster = posters.value.find(
      (poster) => poster.rootPosterId === rootPosterId,
    );
    if (dashboardPoster) dashboardPoster.activeVersionDraft = null;

    deleteVersionModalOpen.value = false;
    versionModalOpen.value = false;
    versionPoster.value = null;
    await refreshPosterList();
    toast.add({
      title: "Edits discarded",
      description: `The draft for version ${draft.versionSequence} was deleted. Your published poster was not changed.`,
      color: "success",
    });
  } catch (error) {
    const message =
      (error as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ||
      (error as { statusMessage?: string })?.statusMessage ||
      "There was a problem discarding your edits.";

    toast.add({
      title: "Could not discard edits",
      description: message,
      color: "error",
    });

    if (wasExtracting && jobId) startVersionExtractionPolling(jobId);
    if (wasPollingThumbnail && jobId) startVersionThumbnailPolling(jobId);
  } finally {
    deletingVersionDraft.value = false;
  }
}

async function createVersion() {
  if (!versionPoster.value) return;
  if (versionFileMode.value === "upload" && !versionFiles.value[0]) {
    versionError.value = "Choose a replacement PDF or image.";

    return;
  }

  const file = versionFiles.value[0];
  if (file && file.size > 10 * 1024 * 1024) {
    versionError.value = "File must be 10MB or smaller.";

    return;
  }

  creatingVersion.value = true;
  versionError.value = "";
  try {
    const rootPosterId = versionPoster.value.rootPosterId;
    const body = new FormData();
    body.append("fileMode", versionFileMode.value);
    body.append("metadataMode", versionMetadataMode.value);
    if (file) body.append("file", file);

    const response = await $fetch<{
      posterId: number;
      versionSequence: number;
      imageUrl: string;
      title: string;
      description: string;
      extractionJobId?: string;
      extractionStatus?: string;
      reviewReady: boolean;
    }>(`/api/poster/${rootPosterId}/versions`, {
      method: "POST",
      body,
    });

    const activeVersionDraft: NonNullable<Poster["activeVersionDraft"]> = {
      id: response.posterId,
      versionSequence: response.versionSequence,
      imageUrl: response.imageUrl,
      title: response.title,
      description: response.description,
      extractionJob: response.extractionJobId
        ? {
            id: response.extractionJobId,
            status: response.extractionStatus ?? "pending-extraction",
            completed: response.reviewReady,
          }
        : null,
    };

    const dashboardPoster = posters.value.find(
      (poster) => poster.rootPosterId === rootPosterId,
    );
    if (dashboardPoster) {
      dashboardPoster.activeVersionDraft = activeVersionDraft;
      versionPoster.value = dashboardPoster;
    } else if (versionPoster.value?.rootPosterId === rootPosterId) {
      versionPoster.value.activeVersionDraft = activeVersionDraft;
    }

    if (!response.reviewReady && response.extractionJobId) {
      startVersionExtractionPolling(response.extractionJobId);
    }
    if (!response.imageUrl && response.extractionJobId) {
      startVersionThumbnailPolling(response.extractionJobId);
    }
  } catch (error) {
    versionError.value =
      error instanceof Error ? error.message : "Could not prepare your edits.";
  } finally {
    creatingVersion.value = false;
  }
}

onMounted(() => {
  const activeJob =
    extractingVersionPoster.value?.activeVersionDraft?.extractionJob?.id;

  if (activeJob) {
    startVersionExtractionPolling(activeJob);
  }

  const thumbnailJob =
    posterAwaitingDraftThumbnail.value?.activeVersionDraft?.extractionJob?.id;
  if (thumbnailJob) {
    startVersionThumbnailPolling(thumbnailJob);
  }
});

onBeforeUnmount(() => {
  stopVersionExtractionPolling();
  stopVersionThumbnailPolling();
});

function openPoster(poster: Poster) {
  if (poster.tombstone) {
    tombstonedPoster.value = poster;
    tombstoneModalOpen.value = true;

    return;
  }

  if (poster.activeVersionDraft) {
    openVersionWorkflow(poster);
  } else if (poster.status === "published") {
    void navigateTo(`/discover/${poster.rootPosterId}`);
  } else {
    void navigateTo(`/share/${poster.id}`);
  }
}

function openVersionWorkflow(poster: Poster) {
  const draft = poster.activeVersionDraft;

  if (isVersionReviewReady(draft) && draft) {
    void navigateTo(`/share/${draft.id}`);

    return;
  }

  openVersionModal(poster);
}

function openDeleteVersionModal(poster: Poster) {
  if (!isVersionReviewReady(poster.activeVersionDraft)) return;

  versionPoster.value = poster;
  deleteVersionModalOpen.value = true;
}

const regeneratingThumbnailIds = ref<number[]>([]);
const thumbnailCacheBust = reactive<Record<number, number>>({});

const expandedDescriptions = ref(new Set<number>());

function toggleDescription(posterId: number) {
  const updated = new Set(expandedDescriptions.value);
  if (updated.has(posterId)) {
    updated.delete(posterId);
  } else {
    updated.add(posterId);
  }
  expandedDescriptions.value = updated;
}

async function regenerateThumbnail(poster: Poster) {
  regeneratingThumbnailIds.value = [
    ...regeneratingThumbnailIds.value,
    poster.id,
  ];

  try {
    await $fetch<{ success: boolean }>(`/api/poster/${poster.id}/thumbnail`, {
      method: "POST",
    });

    thumbnailCacheBust[poster.id] = Date.now();

    toast.add({
      title: "Thumbnail regenerated",
      description:
        "The poster thumbnail has been updated. It may take a few minutes to reflect the changes.",
      color: "success",
    });
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem regenerating the thumbnail.",
      color: "error",
    });
  } finally {
    regeneratingThumbnailIds.value = regeneratingThumbnailIds.value.filter(
      (id) => id !== poster.id,
    );
  }
}

// Delete draft state
const deleteModalOpen = ref(false);
const posterToDelete = ref<Poster | null>(null);
const isDeleting = ref(false);

function openDeleteModal(poster: Poster) {
  posterToDelete.value = poster;
  deleteModalOpen.value = true;
}

async function deletePoster() {
  if (!posterToDelete.value) return;

  isDeleting.value = true;

  try {
    await $fetch(`/api/poster/${posterToDelete.value.id}`, {
      method: "DELETE",
    });

    toast.add({
      title: "Poster deleted",
      description: "Your draft poster has been deleted.",
      color: "success",
    });

    deleteModalOpen.value = false;
    await refresh();
    posters.value = data.value as unknown as Poster[];
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem deleting the poster.",
      color: "error",
    });
  } finally {
    isDeleting.value = false;
  }
}

function openPublicationModal(poster: Poster) {
  modalPoster.value = poster;
  modalDoi.value = poster.posterMetadata.doi ?? "";
  modalLicense.value = poster.posterMetadata.license ?? "";
  modalPublisher.value = poster.posterMetadata.publisher ?? "";
  doiError.value = "";
  modalOpen.value = true;
}

async function savePublicationInfo() {
  if (!modalPoster.value) return;

  doiError.value = validateDoi(modalDoi.value);
  if (doiError.value) return;

  isSaving.value = true;

  try {
    await $fetch(`/api/poster/${modalPoster.value.id}/publication`, {
      method: "PATCH",
      body: {
        doi: modalDoi.value ? normalizeDoi(modalDoi.value) : undefined,
        license: modalLicense.value || undefined,
        publisher: modalPublisher.value || undefined,
      },
    });

    toast.add({
      title: "Publication Info Saved",
      description: "Your poster record has been updated.",
      color: "success",
    });

    modalOpen.value = false;
    await refresh();
    posters.value = data.value as unknown as Poster[];
  } catch (err) {
    console.error(err);
    toast.add({
      title: "Error",
      description: "There was a problem saving your publication info.",
      color: "error",
    });
  } finally {
    isSaving.value = false;
  }
}

const getImage = (poster: Poster) => {
  if (poster.activeVersionDraft?.imageUrl) {
    return `/api/poster/${poster.activeVersionDraft.id}/thumbnail`;
  }
  if (poster.status === "published") {
    return poster.imageUrl;
  }
  const bust = thumbnailCacheBust[poster.id];

  return `/api/poster/${poster.id}/thumbnail${bust ? `?t=${bust}` : ""}`;
};

const getCardTitle = (poster: Poster) =>
  poster.activeVersionDraft?.title || poster.title;

const CARD_TITLE_MAX_LENGTH = 80;
const getCardDisplayTitle = (poster: Poster) => {
  const title = getCardTitle(poster);

  return title.length > CARD_TITLE_MAX_LENGTH
    ? `${title.slice(0, CARD_TITLE_MAX_LENGTH).trimEnd()}…`
    : title;
};

const getCardDescription = (poster: Poster) =>
  poster.activeVersionDraft?.description ?? poster.description;
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageHeader
      title="Dashboard"
      :links="[
        {
          label: 'Share a Poster',
          to: '/share/new',
          icon: 'heroicons:plus',
          color: 'primary' as const,
        },
      ]"
    >
      <template #description>
        <div class="flex w-full items-center justify-between gap-4">
          <span>Keep track of all your submitted posters.</span>

          <USwitch
            v-if="tombstonedPosterCount > 0"
            v-model="showTombstonedPosters"
            :label="`Show tombstoned posters (${tombstonedPosterCount})`"
            size="sm"
          />
        </div>
      </template>
    </UPageHeader>

    <UPageList class="max-md:flex max-md:flex-col max-md:gap-4">
      <UPageCard
        v-for="(poster, index) in visiblePosters"
        :key="poster.rootPosterId ?? index + 1"
        variant="ghost"
        class="group h-50 overflow-hidden rounded-none border-t border-b border-gray-100 transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm dark:max-md:border-gray-800 dark:max-md:bg-gray-950"
        :class="
          poster.tombstone
            ? 'cursor-pointer opacity-70 hover:opacity-100'
            : 'cursor-pointer max-md:hover:shadow-md'
        "
        :aria-haspopup="poster.tombstone ? 'dialog' : undefined"
        :tabindex="poster.tombstone ? 0 : undefined"
        @click="openPoster(poster)"
        @keydown.enter="poster.tombstone && openPoster(poster)"
        @keydown.space.prevent="poster.tombstone && openPoster(poster)"
      >
        <div
          class="flex h-full gap-8 max-md:h-auto max-md:flex-col max-md:gap-0"
        >
          <div
            class="h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b max-md:border-gray-100 dark:max-md:border-gray-800"
          >
            <img
              :src="
                getImage(poster) ||
                `https://api.dicebear.com/9.x/shapes/svg?seed=${poster.id}`
              "
              :alt="getCardTitle(poster)"
              class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 max-md:h-full max-md:max-h-none max-md:p-3"
              :class="{ 'group-hover:scale-105': !poster.tombstone }"
            />
          </div>

          <div
            class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
          >
            <div class="flex flex-col gap-2">
              <h3
                class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
                :title="getCardTitle(poster)"
              >
                {{ getCardDisplayTitle(poster) || "No title available" }}
              </h3>

              <p v-if="poster.versionCount > 1" class="text-muted text-xs">
                {{ poster.versionCount }} published versions
              </p>

              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  v-if="displayedVersion(poster)"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  class="w-fit"
                >
                  Version {{ displayedVersion(poster) }}
                </UBadge>

                <UBadge
                  v-if="isVersionExtracting(poster.activeVersionDraft)"
                  color="info"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-loader-circle"
                  class="w-fit"
                >
                  Preparing edits
                </UBadge>

                <UBadge
                  v-else-if="
                    isVersionExtractionFailed(poster.activeVersionDraft)
                  "
                  color="error"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-circle-alert"
                  class="w-fit"
                >
                  Could not prepare edits
                </UBadge>

                <UBadge
                  v-else-if="isVersionReviewReady(poster.activeVersionDraft)"
                  color="success"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-circle-check"
                  class="w-fit"
                >
                  Edits ready to review
                </UBadge>
              </div>

              <div class="flex flex-col gap-1">
                <p
                  :class="[
                    'text-sm',
                    expandedDescriptions.has(poster.id) ? '' : 'line-clamp-2',
                  ]"
                >
                  {{ getCardDescription(poster) || "No description available" }}
                </p>

                <button
                  v-if="getCardDescription(poster).length > 100"
                  class="text-primary w-fit text-left text-xs font-medium md:hidden"
                  @click.stop="toggleDescription(poster.id)"
                >
                  {{
                    expandedDescriptions.has(poster.id)
                      ? "Show less"
                      : "Show more"
                  }}
                </button>
              </div>
            </div>

            <div
              class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs max-md:flex-wrap max-md:gap-y-2 dark:border-gray-800"
            >
              <div
                class="flex items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1"
              >
                <span class="flex items-center gap-1">
                  <Icon name="heroicons:calendar-days" class="h-3 w-3" />

                  Created
                  {{ dayjs(poster.created).format("MMMM D, YYYY") }}
                </span>

                <span
                  v-if="poster.publishedAt"
                  class="flex items-center gap-1 border-l border-gray-100 pl-2 max-md:border-l-0 max-md:pl-0 dark:border-gray-800"
                >
                  <Icon
                    name="heroicons:presentation-chart-bar"
                    class="h-3 w-3"
                  />
                  Published at
                  {{ dayjs(poster.publishedAt).format("MMMM D, YYYY") }}
                </span>
              </div>

              <div class="flex items-center gap-2 max-md:flex-wrap">
                <UTooltip
                  v-if="
                    poster.status === 'published' &&
                    !poster.automated &&
                    !poster.tombstone
                  "
                  :text="versionActionTooltip(poster)"
                >
                  <span class="inline-flex" @click.stop>
                    <UButton
                      color="primary"
                      variant="subtle"
                      :label="versionActionLabel(poster)"
                      :icon="
                        isVersionExtracting(poster.activeVersionDraft)
                          ? 'i-lucide-activity'
                          : isVersionExtractionFailed(poster.activeVersionDraft)
                            ? 'i-lucide-circle-alert'
                            : poster.activeVersionDraft
                              ? 'heroicons:pencil-square'
                              : 'heroicons:arrow-up-tray'
                      "
                      size="xs"
                      :disabled="versionActionDisabled(poster)"
                      @click="openVersionWorkflow(poster)"
                    />
                  </span>
                </UTooltip>

                <UTooltip
                  v-if="
                    poster.status === 'published' &&
                    poster.activeVersionDraft &&
                    isVersionReviewReady(poster.activeVersionDraft) &&
                    !poster.tombstone
                  "
                  text="Delete unpublished draft version"
                >
                  <UButton
                    color="error"
                    variant="ghost"
                    icon="heroicons:trash"
                    size="xs"
                    aria-label="Delete unpublished draft version"
                    @click.stop="openDeleteVersionModal(poster)"
                  />
                </UTooltip>

                <UButton
                  v-if="poster.status === 'downloaded'"
                  color="secondary"
                  variant="subtle"
                  label="Add publication metadata"
                  icon="heroicons:plus"
                  size="xs"
                  @click.stop="openPublicationModal(poster)"
                />

                <UTooltip text="Regenerate the thumbnail for this poster">
                  <UButton
                    v-if="
                      poster.status === 'draft' ||
                      poster.status === 'downloaded'
                    "
                    color="neutral"
                    variant="ghost"
                    label=""
                    :disabled="regeneratingThumbnailIds.includes(poster.id)"
                    icon="heroicons:arrow-path"
                    size="xs"
                    :loading="regeneratingThumbnailIds.includes(poster.id)"
                    @click.stop="regenerateThumbnail(poster)"
                  />
                </UTooltip>

                <UButton
                  v-if="
                    poster.status === 'draft' || poster.status === 'downloaded'
                  "
                  color="error"
                  variant="ghost"
                  label=""
                  icon="heroicons:trash"
                  size="xs"
                  @click.stop="openDeleteModal(poster)"
                />

                <UTooltip
                  v-if="poster.tombstone"
                  :text="
                    poster.tombedReason
                      ? `Reason: ${poster.tombedReason}`
                      : 'This poster has been removed from public discovery.'
                  "
                >
                  <UBadge
                    color="error"
                    variant="solid"
                    size="sm"
                    icon="i-lucide-archive-x"
                  >
                    Tombstoned
                  </UBadge>
                </UTooltip>

                <UBadge
                  v-else
                  :color="
                    poster.status === 'published'
                      ? 'success'
                      : poster.status === 'downloaded'
                        ? 'primary'
                        : poster.extractionJob?.status ===
                              'pending-extraction' ||
                            poster.extractionJob?.status === 'processing'
                          ? 'secondary'
                          : 'warning'
                  "
                  variant="solid"
                  size="sm"
                >
                  {{
                    poster.status === "published"
                      ? "Published"
                      : poster.status === "downloaded"
                        ? "Downloaded"
                        : poster.extractionJob?.status ===
                              "pending-extraction" ||
                            poster.extractionJob?.status === "processing"
                          ? "Pending"
                          : "Draft"
                  }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>
      </UPageCard>
    </UPageList>

    <div v-if="visiblePosters.length === 0" class="py-12 text-center">
      <div
        v-if="posters.length > 0"
        class="mx-auto flex max-w-md flex-col items-center gap-3"
      >
        <Icon name="i-lucide-archive-x" class="text-muted h-12 w-12" />

        <h3 class="text-lg font-medium">Tombstoned posters are hidden</h3>

        <p class="text-muted text-sm">
          Turn on “Show tombstoned posters” to include them in your dashboard.
        </p>

        <UButton
          label="Show tombstoned posters"
          color="neutral"
          variant="subtle"
          @click="showTombstonedPosters = true"
        />
      </div>

      <NuxtLink
        v-else
        to="/share/new"
        class="group inline-block rounded-2xl px-8 py-6 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800/50"
      >
        <div
          class="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-gray-200"
        >
          <Icon
            name="heroicons:document-text"
            class="h-12 w-12 text-gray-400 transition-colors group-hover:text-gray-500"
          />
        </div>

        <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
          No posters yet
        </h3>

        <p
          class="mb-6 text-gray-500 underline-offset-2 group-hover:underline dark:text-gray-400"
        >
          Get started by sharing your first poster.
        </p>
      </NuxtLink>
    </div>

    <!-- Delete draft modal -->
    <USlideover
      v-model:open="versionModalOpen"
      title="Edit Published Poster"
      :description="
        versionPanelState === 'setup'
          ? 'Select what you would like to change.'
          : `Editing ${versionPoster?.title ?? 'your poster'}`
      "
      side="right"
      class="w-full max-w-2xl"
      :dismissible="!creatingVersion && !deletingVersionDraft"
      :close="!creatingVersion && !deletingVersionDraft"
    >
      <template #body>
        <div
          v-if="versionPanelState === 'setup'"
          class="flex min-h-full flex-col"
        >
          <div class="space-y-5">
            <p class="text-muted text-sm">
              Select what you would like to change for
              <span class="text-highlighted font-medium">{{
                versionPoster?.title
              }}</span
              >. You will review your changes before publishing.
            </p>

            <UFormField label="Poster file">
              <URadioGroup
                v-model="versionFileMode"
                :items="versionFileOptions"
              />
            </UFormField>

            <UiFileUpload
              v-if="versionFileMode === 'upload'"
              @on-change="versionFiles = $event"
            >
              <UiFileUploadGrid />
            </UiFileUpload>

            <UFormField v-if="versionFileMode === 'upload'" label="Metadata">
              <URadioGroup
                v-model="versionMetadataMode"
                :items="versionMetadataOptions"
              />
            </UFormField>

            <UAlert
              v-if="versionError"
              color="error"
              variant="soft"
              title="Could not prepare edits"
              :description="versionError"
            />
          </div>

          <div class="bg-default sticky bottom-0 z-10 mt-auto pt-5">
            <UAlert
              color="primary"
              variant="soft"
              icon="i-lucide-info"
              title="How editing a published poster works"
              description="Published records cannot be modified after publication. Editing a published poster creates a new publication on top of the existing one, which appears as a new version. Only create a new version when the poster file has changed or its metadata needs to be corrected or updated."
            />
          </div>
        </div>

        <div v-else-if="versionPanelState === 'extracting'" class="space-y-6">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-medium">
                {{ versionExtractionStatus.title }}
              </h3>

              <UBadge color="info" variant="soft">
                Version {{ currentVersionDraft?.versionSequence }}
              </UBadge>
            </div>

            <p class="text-muted text-sm">
              {{ versionExtractionStatus.description }}
            </p>
          </div>

          <UProgress color="primary" size="md" animation="carousel" />

          <p class="text-muted text-sm">
            {{
              currentVersionDraft?.extractionJob?.status ===
              "pending-extraction"
                ? "This status will change automatically when the extraction service claims the job."
                : "This status will change to ready for review after the extracted fields have been saved."
            }}
          </p>

          <UAlert
            v-if="versionPollingError"
            color="warning"
            variant="soft"
            title="Status temporarily unavailable"
            :description="`${versionPollingError} We'll keep trying automatically.`"
          />

          <p class="text-muted text-sm">
            You can close this panel, refresh the dashboard, or leave this page.
            Extraction will continue, and this panel will show the latest status
            when you return.
          </p>
        </div>

        <div v-else-if="versionPanelState === 'ready'" class="space-y-5">
          <UAlert
            color="success"
            variant="soft"
            icon="i-lucide-circle-check"
            title="Your edits are ready to review"
            description="Your metadata is ready. Continue to review and edit it before publishing your changes."
          />

          <p class="text-muted text-sm">
            Your published poster remains unchanged until you finish reviewing
            and publish your edits.
          </p>
        </div>

        <div v-else class="space-y-5">
          <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Metadata extraction failed"
            :description="
              currentVersionDraft?.extractionJob?.error ||
              'The extraction service could not process this poster file.'
            "
          />

          <p class="text-muted text-sm">
            The published poster has not been changed. Retrying uses the same
            editable draft and stored poster file.
          </p>

          <UAlert
            v-if="versionPollingError"
            color="warning"
            variant="soft"
            title="Could not retry extraction"
            :description="versionPollingError"
          />
        </div>
      </template>

      <template #footer>
        <div
          v-if="versionPanelState === 'setup'"
          class="flex w-full justify-end gap-3"
        >
          <UButton
            variant="outline"
            :disabled="creatingVersion"
            @click="versionModalOpen = false"
          >
            Cancel
          </UButton>

          <UButton
            color="primary"
            :loading="creatingVersion"
            @click="createVersion"
          >
            Continue
          </UButton>
        </div>

        <div
          v-else-if="
            versionPanelState === 'ready' || versionPanelState === 'failed'
          "
          class="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <UButton
            v-if="
              versionPanelState === 'ready' || versionPanelState === 'failed'
            "
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :disabled="retryingVersionExtraction"
            @click="deleteVersionModalOpen = true"
          >
            Discard Edits
          </UButton>

          <div class="flex flex-wrap justify-end gap-3">
            <UButton
              v-if="versionPanelState === 'ready'"
              color="primary"
              icon="i-lucide-arrow-right"
              trailing
              @click="reviewVersionDraft"
            >
              Review Metadata
            </UButton>

            <UButton
              v-else-if="versionPanelState === 'failed'"
              color="primary"
              icon="i-lucide-refresh-cw"
              :loading="retryingVersionExtraction"
              @click="retryVersionExtraction"
            >
              Retry Extraction
            </UButton>
          </div>
        </div>
      </template>
    </USlideover>

    <UModal
      v-model:open="tombstoneModalOpen"
      title="Why this poster was tombstoned"
      :description="tombstonedPoster?.title || 'Tombstoned poster'"
    >
      <template #body>
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-archive-x"
          title="Reason"
          :description="
            tombstonedPoster?.tombedReason?.trim() || 'No reason was provided.'
          "
        />
      </template>
    </UModal>

    <UModal
      v-model:open="deleteVersionModalOpen"
      title="Discard Edits?"
      :dismissible="!deletingVersionDraft"
      :close="!deletingVersionDraft"
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            Discard the draft changes for version
            <span class="font-medium">{{
              currentVersionDraft?.versionSequence
            }}</span>
            of
            <span class="font-medium">{{
              versionPoster?.title || "this poster"
            }}</span
            >?
          </p>

          <p class="text-muted">
            This removes the editable draft, its stored poster file and
            metadata. The published poster and its earlier versions will not be
            changed. This cannot be undone.
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton
            variant="outline"
            :disabled="deletingVersionDraft"
            @click="deleteVersionModalOpen = false"
          >
            Cancel
          </UButton>

          <UButton
            color="error"
            :loading="deletingVersionDraft"
            @click="deleteVersionDraft"
          >
            Discard Edits
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteModalOpen" title="Delete Draft Poster">
      <template #body>
        <p class="text-sm">
          Are you sure you want to delete
          <span class="font-medium">{{
            posterToDelete?.title || "this poster"
          }}</span
          >? This cannot be undone.
        </p>
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" @click="deleteModalOpen = false">
            Cancel
          </UButton>

          <UButton color="error" :loading="isDeleting" @click="deletePoster">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Publication info modal -->
    <UModal v-model:open="modalOpen" title="Update Publication Information">
      <template #body>
        <p class="text-muted mb-4 text-sm">
          Now that your poster has been shared, add the details below to keep
          your record up to date.
        </p>

        <div class="space-y-4">
          <UFormField label="DOI" name="doi" :error="doiError">
            <UInput
              v-model="modalDoi"
              placeholder="e.g. 10.5281/zenodo.1234567 or https://doi.org/..."
              class="w-full"
              @input="doiError = ''"
            />
          </UFormField>

          <UFormField label="License" name="license">
            <USelect
              v-model="modalLicense"
              :items="LICENSE_OPTIONS"
              placeholder="Select a license"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Publisher" name="publisher">
            <UInput
              v-model="modalPublisher"
              placeholder="e.g. Zenodo, Figshare"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="outline" @click="modalOpen = false">
            Cancel
          </UButton>

          <UButton
            color="primary"
            :loading="isSaving"
            @click="savePublicationInfo"
          >
            Save
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
