<script setup lang="ts">
import { downloadFilenameFromDisposition } from "~/utils/downloadFilename";
import type { BulkImportBatchItem } from "#shared/types/conferenceBulkImport";
import type { PosterResponse } from "@/utils/poster_schema";
import { normalizeZenodoRecordWebUrl } from "#shared/utils/zenodoRecordWebUrl";
import { publishPosterViaZenodoStream } from "~/utils/zenodoPublishStream";
import {
  zenodoPublicationDoiForPoster,
  zenodoPublicationUrlForPoster,
} from "~/utils/zenodoPublicationUrl";
import ZenodoConnectPanel from "~/components/share/ZenodoConnectPanel.vue";
import { useZenodoReleaseConnection } from "~/composables/useZenodoReleaseConnection";
import {
  formatZenodoFileEmbargoTimeRemaining,
  formatZenodoFileEmbargoUntilLabel,
  isZenodoFileEmbargoActive,
  zenodoFileEmbargoUntilDate,
} from "#shared/utils/zenodoFileEmbargoAccess";
import type {
  BulkReleaseFileEmbargoResponse,
  BulkSubmissionCompletionResponse,
} from "#shared/types/bulkSubmissionCompletion";
import { shareBulkCompletionPath } from "~/utils/sharePaths";
import type { BulkImportSubmissionSummary } from "#shared/types/bulkImportLicenses";
import {
  DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS,
  isBulkImportReviewEmbargoDaysValid,
  MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS,
  MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS,
  normalizeBulkImportReviewEmbargoDays,
  type BulkImportReviewEmbargoChoice,
} from "#shared/types/bulkImportReviewEmbargo";
import {
  getBulkPosterSubmissionJob,
  updateBulkPosterSubmissionJob,
} from "~/utils/bulkPosterSubmissionJobClient";

const props = defineProps<{
  items: BulkImportBatchItem[];
  bulkJobId: string | null;
  uniformLicense: string;
}>();

const toast = useToast();
const route = useRoute();

const reviewEmbargoChoice = ref<BulkImportReviewEmbargoChoice | undefined>(
  undefined,
);
const reviewEmbargoDays = ref(DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS);
const zenodoEmbargoLoaded = ref(false);

const reviewEmbargoDayOptions = computed(() =>
  Array.from(
    {
      length:
        MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS -
        MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS +
        1,
    },
    (_, index) => {
      const value = index + MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS;
      return {
        label: value === 1 ? "1 day" : `${value} days`,
        value,
      };
    },
  ),
);

const reviewEmbargoItems: {
  label: string;
  value: BulkImportReviewEmbargoChoice;
}[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

const zenodoEmbargoReady = computed(
  () =>
    reviewEmbargoChoice.value !== undefined &&
    (reviewEmbargoChoice.value === "no" ||
      isBulkImportReviewEmbargoDaysValid(reviewEmbargoDays.value)),
);

async function loadZenodoEmbargoFromJob() {
  if (!props.bulkJobId) {
    zenodoEmbargoLoaded.value = true;
    return;
  }

  try {
    const job = await getBulkPosterSubmissionJob(props.bulkJobId);
    const summary = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;

    if (summary.reviewEmbargoEnabled === true) {
      reviewEmbargoChoice.value = "yes";
      reviewEmbargoDays.value = normalizeBulkImportReviewEmbargoDays(
        summary.reviewEmbargoDays,
      );
    } else if (summary.reviewEmbargoEnabled === false) {
      reviewEmbargoChoice.value = "no";
    }
  } catch {
    // User can still choose before publishing.
  } finally {
    zenodoEmbargoLoaded.value = true;
  }
}

async function persistZenodoEmbargoSettings(): Promise<boolean> {
  if (!props.bulkJobId || !zenodoEmbargoReady.value) return false;

  const job = await getBulkPosterSubmissionJob(props.bulkJobId);
  const existing = (job.submissionSummary ?? {}) as BulkImportSubmissionSummary;
  const embargoEnabled = reviewEmbargoChoice.value === "yes";

  await updateBulkPosterSubmissionJob(props.bulkJobId, {
    submissionSummary: {
      ...existing,
      reviewEmbargoEnabled: embargoEnabled,
      reviewEmbargoDays: embargoEnabled
        ? normalizeBulkImportReviewEmbargoDays(reviewEmbargoDays.value)
        : undefined,
    },
  });

  return true;
}

function ensureZenodoEmbargoChosen(): boolean {
  if (zenodoEmbargoReady.value) return true;

  toast.add({
    title: "Zenodo file embargo required",
    description:
      "Choose whether to apply a file embargo on Zenodo before publishing.",
    color: "warning",
  });
  return false;
}

watch(
  () => props.bulkJobId,
  () => {
    zenodoEmbargoLoaded.value = false;
    reviewEmbargoChoice.value = undefined;
    reviewEmbargoDays.value = DEFAULT_BULK_IMPORT_REVIEW_EMBARGO_DAYS;
    void loadZenodoEmbargoFromJob();
  },
);

type Repository = "zenodo" | "figshare" | "download" | null;

const { zenodo: zenodoMaintenance } = useMaintenance();
const zenodoPaused = computed(() => zenodoMaintenance.value.off !== null);

const queryRepo = route.query.repository;
const requestedRepository: Repository =
  queryRepo === "zenodo" || queryRepo === "figshare" || queryRepo === "download"
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

function selectRepository(repo: (typeof repositories.value)[number]) {
  if (!repo.enabled) return;
  selectedRepository.value = repo.id;
}

const batchDownloadAcknowledged = ref(false);
const batchDownloadingAll = ref(false);
const rowDownloadingIds = ref<Set<string>>(new Set());

function isRowDownloading(row: PublishRow) {
  return rowDownloadingIds.value.has(row.item.id);
}

async function downloadPosterPackage(posterId: number) {
  const response = await fetch(`/api/poster/${posterId}/download`, {
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
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const filename =
    downloadFilenameFromDisposition(disposition) ?? `poster-${posterId}.zip`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadRow(row: PublishRow) {
  const posterId = row.item.posterId;
  if (posterId == null) return;

  const next = new Set(rowDownloadingIds.value);
  next.add(row.item.id);
  rowDownloadingIds.value = next;

  try {
    await downloadPosterPackage(posterId);
    toast.add({
      title: "Download started",
      description: row.title,
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Download failed",
      description:
        error instanceof Error ? error.message : "Could not download files.",
      color: "error",
    });
  } finally {
    const done = new Set(rowDownloadingIds.value);
    done.delete(row.item.id);
    rowDownloadingIds.value = done;
  }
}

async function downloadBulkZip() {
  if (!props.bulkJobId) {
    throw new Error("Bulk import job is not available.");
  }

  const response = await fetch(
    `/api/bulk-poster-submissions/${props.bulkJobId}/download`,
    {
      method: "GET",
      credentials: "include",
    },
  );

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
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1] ?? "bulk-import-posters.zip";

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadAllLocally() {
  if (batchDownloadingAll.value) return;

  batchDownloadingAll.value = true;

  try {
    await downloadBulkZip();
    toast.add({
      title: "Download started",
      description:
        "Your batch is in one ZIP file with a folder per poster (poster.json + PDF).",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Download failed",
      description:
        error instanceof Error
          ? error.message
          : "Could not download poster packages.",
      color: "error",
    });
  } finally {
    batchDownloadingAll.value = false;
  }
}

const actionColumnLabel = computed(() => {
  if (selectedRepository.value === "download") return "Download";
  if (selectedRepository.value === "zenodo") return "Zenodo";
  return "Action";
});

type RowPublishStatus =
  | "ready"
  | "publishing"
  | "published"
  | "failed"
  | "skipped";

type PosterWithZenodo = PosterResponse & {
  zenodoRecordUrl?: string | null;
  zenodoDepositions?: {
    depositionId?: number;
    status?: string;
    lastPublishedZenodoDoi?: string | null;
    filesEmbargoUntil?: string | null;
  } | null;
};

type PublishRow = {
  item: BulkImportBatchItem;
  title: string;
  status: RowPublishStatus;
  error?: string;
  recordUrl?: string;
  doi?: string;
  /** Zenodo file embargo end for an already-published poster (from the poster record). */
  filesEmbargoUntil?: string | null;
};

const completedItems = computed(() =>
  props.items.filter(
    (item) => item.posterId != null && item.status === "completed",
  ),
);

const rows = ref<PublishRow[]>([]);
const batchPublishing = ref(false);
const batchStoppedEarly = ref(false);
const batchCompletionSyncing = ref(false);
/** Rows whose publish status is still being fetched (one request per poster). */
const rowsHydrating = ref(0);

/**
 * Publish controls (intro, embargo settings, "Publish all") only matter while
 * some poster is not on Zenodo yet; hidden once all are published (and while
 * statuses are loading, so they don't flash up for an already-published batch).
 */
const showZenodoPublishControls = computed(
  () => rowsHydrating.value === 0 && !allPublished.value,
);

/** Still show the connect panel when files are embargoed but Zenodo is not
 * connected: releasing the embargo early needs the account. */
const showZenodoConnectPanel = computed(
  () =>
    showZenodoPublishControls.value ||
    (allPublished.value &&
      awaitingEmbargoRelease.value &&
      !zenodo.zenodoTokenExists.value),
);
const batchCompletion = ref<BulkSubmissionCompletionResponse | null>(null);
const releasingEmbargo = ref(false);
const embargoClockNow = ref(Date.now());
let embargoPollInterval: ReturnType<typeof setInterval> | undefined;

/** Any poster already on Zenodo whose files are still restricted. */
const rowsHaveActiveEmbargo = computed(() =>
  rows.value.some(
    (row) =>
      Boolean(row.filesEmbargoUntil) &&
      isZenodoFileEmbargoActive(
        row.filesEmbargoUntil!,
        new Date(embargoClockNow.value),
      ),
  ),
);

const awaitingEmbargoRelease = computed(() => {
  if (batchCompletion.value?.awaitingEmbargoRelease) return true;
  if (allPublished.value && rowsHaveActiveEmbargo.value) return true;
  if (!allPublished.value || reviewEmbargoChoice.value !== "yes") return false;
  const until = batchCompletion.value?.latestActiveEmbargoUntil;
  if (until) {
    return isZenodoFileEmbargoActive(until, new Date(embargoClockNow.value));
  }
  return publishedCount.value > 0;
});

const fileEmbargoEarlyReleaseReady = computed(
  () => batchCompletion.value?.fileEmbargoEarlyReleaseReady === true,
);

const embargoWaitLabel = computed(() => {
  const until =
    batchCompletion.value?.latestActiveEmbargoUntil ??
    zenodoFileEmbargoUntil.value;
  if (!until) return null;
  if (
    batchCompletion.value &&
    !batchCompletion.value.awaitingEmbargoRelease
  ) {
    return null;
  }
  if (!isZenodoFileEmbargoActive(until, new Date(embargoClockNow.value))) {
    return null;
  }
  return formatZenodoFileEmbargoTimeRemaining(
    until,
    new Date(embargoClockNow.value),
  );
});

async function refreshBatchCompletion() {
  if (!props.bulkJobId) return null;

  try {
    const completion = await $fetch<BulkSubmissionCompletionResponse>(
      `/api/bulk-poster-submissions/${props.bulkJobId}/completion`,
    );
    batchCompletion.value = completion;
    return completion;
  } catch {
    return null;
  }
}

async function navigateToBatchCompleteIfReady(
  completion: BulkSubmissionCompletionResponse | null,
) {
  if (!props.bulkJobId || !completion?.completedAt) return;
  if (completion.awaitingEmbargoRelease) return;
  await navigateTo(shareBulkCompletionPath(props.bulkJobId));
}

function stopEmbargoPolling() {
  if (embargoPollInterval) {
    clearInterval(embargoPollInterval);
    embargoPollInterval = undefined;
  }
}

function startEmbargoPolling() {
  // Polling runs from the shared interval started in onMounted.
}

async function releaseEmbargoEarly() {
  if (!props.bulkJobId || releasingEmbargo.value) return;

  releasingEmbargo.value = true;

  try {
    const result = await $fetch<BulkReleaseFileEmbargoResponse>(
      `/api/bulk-poster-submissions/${props.bulkJobId}/release-file-embargo`,
      { method: "POST" },
    );

    if (result.released > 0) {
      toast.add({
        title: "Files released on Zenodo",
        description:
          result.failed > 0
            ? `${result.released} poster(s) are now unrestricted. ${result.failed} could not be updated. Try again or wait for the embargo date.`
            : "Downloads are now public for every poster in this batch.",
        color: result.failed > 0 ? "warning" : "success",
      });
    } else if (result.failed > 0) {
      toast.add({
        title: "Could not release files",
        description: result.failures[0]?.error ?? "Try again from Zenodo.",
        color: "error",
      });
    }

    const completion = await refreshBatchCompletion();
    await navigateToBatchCompleteIfReady(completion);
  } catch (error) {
    toast.add({
      title: "Could not release files",
      description:
        error instanceof Error ? error.message : "Try again in a moment.",
      color: "error",
    });
  } finally {
    releasingEmbargo.value = false;
  }
}

const zenodoContextPosterId = computed(() => {
  const first = completedItems.value[0]?.posterId;
  return first != null ? String(first) : null;
});

const zenodo = useZenodoReleaseConnection({
  posterId: zenodoContextPosterId,
  bulkJobId: () => props.bulkJobId,
  requirePosterId: true,
  onTokenConnected: () => {
    toast.add({
      title: "Zenodo connected",
      description: "You can publish posters in this batch.",
      color: "success",
    });
  },
  onDisconnected: () => {
    toast.add({
      title: "Signed out of Zenodo",
      description: "Sign in again when you are ready to publish.",
      color: "neutral",
    });
  },
});

const licenseForPublish = computed(() => props.uniformLicense.trim());

const zenodoFileEmbargoUntil = computed(() => {
  if (reviewEmbargoChoice.value !== "yes") return null;
  return zenodoFileEmbargoUntilDate(reviewEmbargoDays.value);
});

const zenodoFileEmbargoNotice = computed(() => {
  const until = zenodoFileEmbargoUntil.value;
  if (!until) return null;
  return `Zenodo files in this batch stay restricted until ${formatZenodoFileEmbargoUntilLabel(until)} (UTC). Record metadata and DOIs are public; downloads open when the embargo ends.`;
});

const publishedCount = computed(
  () => rows.value.filter((row) => row.status === "published").length,
);
const failedCount = computed(
  () => rows.value.filter((row) => row.status === "failed").length,
);
const allPublished = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every(
      (row) => row.status === "published" || row.status === "skipped",
    ),
);

const zenodoEmbargoLocked = computed(() => publishedCount.value > 0);

function rowIsOnZenodo(row: PublishRow) {
  return Boolean(row.recordUrl);
}

function canPublishRow(row: PublishRow) {
  return (
    !zenodoPaused.value &&
    !rowIsOnZenodo(row) &&
    row.status !== "publishing" &&
    !batchPublishing.value &&
    zenodo.zenodoTokenExists.value &&
    Boolean(licenseForPublish.value) &&
    zenodoEmbargoReady.value
  );
}

async function publishSingle(row: PublishRow) {
  if (!licenseForPublish.value) {
    toast.add({
      title: "License required",
      description:
        "Go back to the license step and choose a license for this batch.",
      color: "warning",
    });
    return;
  }

  if (zenodoPaused.value) {
    toast.add({
      title: "Zenodo is paused",
      description: "Publishing is temporarily unavailable. Try again later.",
      color: "warning",
    });
    return;
  }

  if (!zenodo.zenodoTokenExists.value) {
    toast.add({
      title: "Sign in to Zenodo",
      description: "Connect your Zenodo account before publishing.",
      color: "warning",
    });
    return;
  }

  if (!ensureZenodoEmbargoChosen()) return;

  await publishRow(row);
}

watch(
  completedItems,
  (items) => {
    rows.value = items.map((item) => ({
      item,
      title: item.fileName.replace(/\.[^.]+$/, "") || item.fileName,
      status: "ready",
    }));
    for (const row of rows.value) {
      const posterId = row.item.posterId;
      if (posterId == null) continue;
      rowsHydrating.value += 1;
      void hydrateRowTitleAndStatus(row, posterId).finally(() => {
        rowsHydrating.value = Math.max(0, rowsHydrating.value - 1);
      });
    }
  },
  { immediate: true },
);

function patchRow(itemId: string, patch: Partial<PublishRow>) {
  rows.value = rows.value.map((row) =>
    row.item.id === itemId ? { ...row, ...patch } : row,
  );
}

async function hydrateRowTitleAndStatus(row: PublishRow, posterId: number) {
  try {
    const poster = await $fetch<PosterWithZenodo>(`/api/poster/${posterId}`);
    const metaTitle = poster.posterMetadata?.titles?.[0] as
      | { title?: string }
      | undefined;
    const title = metaTitle?.title?.trim() || poster.title?.trim() || row.title;
    const recordUrl = zenodoPublicationUrlForPoster(poster);
    const doi = zenodoPublicationDoiForPoster(poster);
    const alreadyOnZenodo = poster.status === "published" && Boolean(recordUrl);

    patchRow(row.item.id, {
      title,
      ...(recordUrl && { recordUrl }),
      ...(doi && { doi }),
      status: alreadyOnZenodo ? "skipped" : row.status,
      filesEmbargoUntil: poster.zenodoDepositions?.filesEmbargoUntil ?? null,
    });
  } catch {
    // Keep file-based title and ready status.
  }
}

async function resolvePublicationVersion(
  posterId: number,
): Promise<string | undefined> {
  try {
    const poster = await $fetch<PosterResponse>(`/api/poster/${posterId}`);
    if (poster.automated) return undefined;
    const version = poster.posterMetadata?.version?.trim();
    return version || undefined;
  } catch {
    return undefined;
  }
}

async function publishRow(row: PublishRow) {
  const posterId = row.item.posterId;
  if (posterId == null) return;

  try {
    await persistZenodoEmbargoSettings();
  } catch (error) {
    const itemId = row.item.id;
    patchRow(itemId, {
      status: "failed",
      error:
        error instanceof Error
          ? error.message
          : "Could not save Zenodo embargo settings",
    });
    return;
  }

  const itemId = row.item.id;
  patchRow(itemId, {
    status: "publishing",
    error: undefined,
    recordUrl: undefined,
  });

  const version = await resolvePublicationVersion(posterId);
  const result = await publishPosterViaZenodoStream({
    posterId: String(posterId),
    mode: "new",
    license: licenseForPublish.value || undefined,
    version,
  });

  if (result.success) {
    let recordUrl: string | undefined;
    let doi: string | undefined;
    try {
      const poster = await $fetch<PosterWithZenodo>(`/api/poster/${posterId}`);
      recordUrl = zenodoPublicationUrlForPoster(poster);
      doi = zenodoPublicationDoiForPoster(poster);
    } catch {
      recordUrl = normalizeZenodoRecordWebUrl(result.recordUrl);
    }

    patchRow(itemId, {
      status: "published",
      ...(recordUrl && { recordUrl }),
      ...(doi && { doi }),
      error: undefined,
    });
    await syncBatchCompletionIfReady();
    return;
  }

  patchRow(itemId, {
    status: "failed",
    error: result.error ?? "Could not publish to Zenodo",
  });
}

async function publishAllToZenodo() {
  if (batchPublishing.value || completedItems.value.length === 0) return;

  if (!licenseForPublish.value) {
    toast.add({
      title: "License required",
      description:
        "Go back to the license step and choose a license for this batch.",
      color: "warning",
    });
    return;
  }

  if (zenodoPaused.value) {
    toast.add({
      title: "Zenodo is paused",
      description: "Publishing is temporarily unavailable. Try again later.",
      color: "warning",
    });
    return;
  }

  if (!zenodo.zenodoTokenExists.value) {
    toast.add({
      title: "Sign in to Zenodo",
      description: "Connect your Zenodo account before publishing.",
      color: "warning",
    });
    return;
  }

  if (!ensureZenodoEmbargoChosen()) return;

  batchPublishing.value = true;
  batchStoppedEarly.value = false;

  for (const row of rows.value) {
    if (row.status === "published" || row.status === "skipped") continue;

    await publishRow(row);
    const current = rows.value.find((entry) => entry.item.id === row.item.id);
    if (current?.status === "failed") {
      batchStoppedEarly.value = true;
      break;
    }
  }

  batchPublishing.value = false;

  await syncBatchCompletionIfReady();

  if (allPublished.value) {
    if (awaitingEmbargoRelease.value || reviewEmbargoChoice.value === "yes") {
      toast.add({
        title: "Batch published on Zenodo",
        description:
          reviewEmbargoChoice.value === "yes"
            ? "Files stay restricted until the embargo ends. You can release them early from this page, or we will take you to the summary when they unlock."
            : `All posters in this batch are on Zenodo.`,
        color: "success",
      });
    } else {
      toast.add({
        title: "Batch published",
        description: `All posters in this batch are on Zenodo.`,
        color: "success",
      });
    }
  } else if (publishedCount.value > 0) {
    toast.add({
      title: "Partially published",
      description: `${publishedCount.value} published, ${failedCount.value} failed. Fix issues and run again for the rest.`,
      color: "warning",
    });
  }
}

async function syncBatchCompletionIfReady() {
  if (!props.bulkJobId || batchCompletionSyncing.value) return;
  if (!allPublished.value) return;

  batchCompletionSyncing.value = true;

  try {
    const completion = await refreshBatchCompletion();
    if (!completion) return;

    if (completion.awaitingEmbargoRelease) {
      startEmbargoPolling();
      return;
    }

    stopEmbargoPolling();
    await navigateToBatchCompleteIfReady(completion);
  } finally {
    batchCompletionSyncing.value = false;
  }
}

// Fetch completion as soon as every row is known to be published (statuses
// load per poster after mount), instead of waiting for the 60s interval.
watch(
  () => allPublished.value && rowsHydrating.value === 0,
  (ready) => {
    if (ready) void syncBatchCompletionIfReady();
  },
);

onMounted(() => {
  void loadZenodoEmbargoFromJob();
  embargoPollInterval = setInterval(() => {
    embargoClockNow.value = Date.now();
    if (allPublished.value) {
      void syncBatchCompletionIfReady();
    }
  }, 60_000);
  if (allPublished.value) {
    void syncBatchCompletionIfReady();
  }
});

onBeforeUnmount(() => {
  stopEmbargoPolling();
});

const returnedFromZenodoOAuth = computed(
  () => route.query.repository === "zenodo",
);

watch(
  returnedFromZenodoOAuth,
  (fromZenodo) => {
    if (fromZenodo && !zenodoPaused.value) {
      selectedRepository.value = "zenodo";
      if (zenodo.zenodoTokenExists.value && !batchPublishing.value) {
        toast.add({
          title: "Zenodo connected",
          description: "You can publish all posters in this batch.",
          color: "success",
        });
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="completedItems.length === 0"
      class="text-muted rounded-lg border border-dashed px-4 py-8 text-center text-sm"
    >
      No completed extractions yet. Finish extraction and Review Posters before
      submitting to a repository.
    </div>

    <template v-else>
      <MaintenanceNotice maintenance-key="zenodo" />

      <UAlert
        v-if="!licenseForPublish"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Batch license missing"
        description="Return to the license step and set a license. It will be applied when publishing each poster."
      />

      <div class="border-default rounded-xl border p-6">
        <h3 class="mb-2 text-lg font-semibold">Select a Repository</h3>

        <p class="text-muted mb-6 text-sm">
          Choose where you would like to archive your posters. Click one of the
          following options:
        </p>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UButton
            v-for="repo in repositories"
            :key="repo.id"
            :disabled="!repo.enabled"
            class="border-default hover:border-primary flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all"
            :class="[
              selectedRepository === repo.id
                ? 'border-primary bg-primary/5'
                : '',
              !repo.enabled && 'cursor-not-allowed opacity-50',
            ]"
            color="primary"
            variant="outline"
            @click="selectRepository(repo)"
          >
            <UIcon :name="repo.icon" class="size-12" />

            <span class="font-medium">{{ repo.name }}</span>

            <span class="text-muted text-center text-xs">{{
              repo.description
            }}</span>

            <UBadge v-if="repo.unavailable" color="warning" variant="subtle">
              Temporarily Unavailable
            </UBadge>

            <UBadge v-else-if="!repo.enabled" color="neutral" variant="subtle">
              Coming Soon
            </UBadge>
          </UButton>
        </div>
      </div>

      <div
        v-if="selectedRepository === 'zenodo'"
        class="border-default rounded-xl border p-6"
      >
        <div class="mb-4 flex items-center gap-2">
          <UIcon name="i-simple-icons-zenodo" class="size-6" />
          <h3 class="text-lg font-semibold">Archive to Zenodo</h3>
        </div>

        <p v-if="showZenodoPublishControls" class="mb-5 text-sm">
          <ULink
            to="https://zenodo.org"
            target="_blank"
            class="text-primary underline"
            >Zenodo</ULink
          >
          is a free general-purpose repository. Each poster in this batch is
          published as its own record using your batch license ({{
            licenseForPublish || "not set"
          }}). Posters are processed one at a time.
        </p>

        <UFormField
          v-if="zenodoEmbargoLoaded && showZenodoPublishControls"
          class="mb-5"
          label="Put the poster files under a Zenodo embargo?"
          required
          description="If yes, each poster's record is published right away, but its files can't be downloaded until the embargo ends. This is helpful if you want to review your posters on Zenodo before others can download them. You can lift the embargo early from this page at any time."
        >
          <div class="space-y-3">
            <URadioGroup
              v-model="reviewEmbargoChoice"
              :items="reviewEmbargoItems"
              value-key="value"
              label-key="label"
              :disabled="zenodoEmbargoLocked"
              :ui="{ fieldset: 'gap-3', item: 'items-start' }"
            />

            <UFormField
              v-if="reviewEmbargoChoice === 'yes'"
              label="Embargo length"
              :description="`Files stay restricted on Zenodo for this many days after you publish (${MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS}–${MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS} days).`"
            >
              <USelectMenu
                v-model="reviewEmbargoDays"
                :items="reviewEmbargoDayOptions"
                value-key="value"
                label-key="label"
                class="max-w-xs"
                :disabled="zenodoEmbargoLocked"
              />
            </UFormField>

            <p
              v-if="zenodoEmbargoLocked"
              class="text-muted text-xs"
            >
              Embargo settings are locked after the first poster in this batch
              is published to Zenodo.
            </p>
          </div>
        </UFormField>

        <UAlert
          v-if="zenodoFileEmbargoNotice && showZenodoPublishControls"
          class="mb-5"
          color="info"
          variant="subtle"
          icon="i-lucide-lock"
          title="Files will be under embargo"
          :description="zenodoFileEmbargoNotice"
        />

        <ZenodoConnectPanel v-if="showZenodoConnectPanel" :zenodo="zenodo">
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              color="primary"
              size="lg"
              icon="i-lucide-upload-cloud"
              label="Publish all to Zenodo"
              :loading="batchPublishing"
              :disabled="
                zenodoPaused ||
                !licenseForPublish ||
                allPublished ||
                !zenodoEmbargoReady
              "
              @click="publishAllToZenodo"
            />
          </div>
        </ZenodoConnectPanel>

        <UAlert
          v-if="
            allPublished &&
            !awaitingEmbargoRelease &&
            rowsHydrating === 0 &&
            batchCompletion != null &&
            !batchCompletionSyncing
          "
          color="success"
          variant="soft"
          icon="i-lucide-circle-check"
          title="All posters in this batch are published on Zenodo."
        />

        <UAlert
          v-if="
            !(allPublished && awaitingEmbargoRelease) &&
            (rowsHydrating > 0 || batchCompletionSyncing)
          "
          color="neutral"
          variant="soft"
          icon="i-lucide-loader-circle"
          :ui="{ icon: 'animate-spin' }"
          title="Checking publication status…"
          description="Loading each poster's Zenodo status for this batch."
          class="mt-4"
        />

        <UAlert
          v-if="allPublished && awaitingEmbargoRelease"
          color="warning"
          variant="soft"
          icon="i-lucide-lock"
          title="Zenodo files are still under embargo"
          class="mt-4"
        >
          <template #description>
            <p class="text-sm">
              <span v-if="embargoWaitLabel" class="block font-medium">
                {{ embargoWaitLabel }}
                <template v-if="batchCompletion?.latestActiveEmbargoUntil">
                  (until
                  {{
                    formatZenodoFileEmbargoUntilLabel(
                      batchCompletion.latestActiveEmbargoUntil,
                    )
                  }}
                  UTC)
                </template>
              </span>
            </p>
            <div v-if="fileEmbargoEarlyReleaseReady" class="mt-4">
              <UButton
                color="primary"
                icon="i-lucide-lock-open"
                label="Release files now"
                :loading="releasingEmbargo"
                :disabled="!zenodo.zenodoTokenExists.value || releasingEmbargo"
                @click="releaseEmbargoEarly"
              />
            </div>
            <p
              v-else
              class="text-muted mt-4 text-sm"
            >
              Early release will appear here once Zenodo confirms file embargo
              settings for this batch. Until then, downloads unlock on the
              embargo date above.
            </p>
          </template>
        </UAlert>
      </div>

      <div
        v-if="selectedRepository === 'download'"
        class="border-default flex flex-col gap-6 rounded-xl border p-6"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-download" class="size-6" />
          <h3 class="text-lg font-semibold">Download Files</h3>
        </div>

        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          title="Heads up: poster.json will be incomplete"
          description="Each downloaded poster.json may have blank identifier and publisher fields until you publish or update metadata on Posters.science."
        />

        <UCheckbox
          v-model="batchDownloadAcknowledged"
          label="I understand that my poster.json files may be incomplete"
        />

        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-download"
          :loading="batchDownloadingAll"
          :disabled="!batchDownloadAcknowledged"
          @click="downloadAllLocally"
        >
          Download all as one ZIP
        </UButton>
      </div>

      <div class="border-default overflow-hidden rounded-xl border">
        <table class="w-full text-left text-sm">
          <thead
            class="border-default border-b bg-gray-50/80 dark:bg-gray-900/40"
          >
            <tr>
              <th class="px-4 py-3 font-medium">Poster</th>
              <th class="px-4 py-3 font-medium">{{ actionColumnLabel }}</th>
            </tr>
          </thead>
          <tbody class="divide-default divide-y">
            <tr v-for="row in rows" :key="row.item.id">
              <td class="px-4 py-3">
                <span class="line-clamp-2 font-medium" :title="row.title">
                  {{ row.title }}
                </span>
                <span class="text-muted block text-xs">{{
                  row.item.fileName
                }}</span>
              </td>
              <td class="px-4 py-3">
                <p v-if="!selectedRepository" class="text-muted text-sm">
                  Select a repository above
                </p>

                <template v-else-if="selectedRepository === 'download'">
                  <UButton
                    color="primary"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-download"
                    label="Download"
                    :disabled="!batchDownloadAcknowledged"
                    :loading="isRowDownloading(row)"
                    @click="downloadRow(row)"
                  />
                </template>

                <template v-else-if="selectedRepository === 'zenodo'">
                  <div v-if="rowIsOnZenodo(row)" class="flex flex-col gap-1">
                    <UButton
                      color="primary"
                      variant="soft"
                      size="sm"
                      icon="i-lucide-external-link"
                      label="View on Zenodo"
                      :href="row.recordUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      external
                    />
                    <span
                      v-if="row.doi"
                      class="text-muted max-w-xs truncate text-xs"
                      :title="row.doi"
                    >
                      {{ row.doi }}
                    </span>
                  </div>

                  <div
                    v-else-if="row.status === 'publishing'"
                    class="text-primary inline-flex items-center gap-2 text-sm"
                  >
                    <UIcon name="i-lucide-loader" class="size-4 animate-spin" />
                    Publishing…
                  </div>

                  <div v-else class="flex flex-col items-start gap-2">
                    <p
                      v-if="row.status === 'failed' && row.error"
                      class="text-error max-w-md text-xs"
                    >
                      {{ row.error }}
                    </p>
                    <UButton
                      color="primary"
                      variant="outline"
                      size="sm"
                      icon="i-lucide-upload-cloud"
                      :label="
                        row.status === 'failed'
                          ? 'Retry publish'
                          : 'Publish to Zenodo'
                      "
                      :disabled="!canPublishRow(row)"
                      @click="publishSingle(row)"
                    />
                  </div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UAlert
        v-if="batchStoppedEarly && selectedRepository === 'zenodo'"
        color="warning"
        variant="soft"
        icon="i-lucide-info"
        title="Publishing paused"
        description="Fix the failed poster and use Retry publish on that row, or run Publish all again for the rest."
      />
    </template>
  </div>
</template>
