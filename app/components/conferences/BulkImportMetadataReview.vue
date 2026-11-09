<script setup lang="ts">
import { strictIssueMessage } from "~/utils/strictIssueLabel";
import type { BulkImportBatchItem } from "#shared/types/conferenceBulkImport";
import type { PosterResponse } from "@/utils/poster_schema";
import { sharePosterEditPath } from "~/utils/sharePaths";
import type { PosterStrictValidationResult } from "~/utils/posterResponseToStrictForm";
import {
  getBulkPosterPreviewSummaries,
  type BulkPosterPreviewSummary,
} from "~/utils/bulkPosterSubmissionJobClient";

const props = defineProps<{
  items: BulkImportBatchItem[];
  bulkImportJobId: string | null;
  metadataRefreshKey?: number;
  retryingJobIds?: Set<string>;
}>();

const emit = defineEmits<{
  retry: [item: BulkImportBatchItem];
  "validation-change": [
    payload: {
      allValid: boolean;
      invalidCount: number;
      pending: boolean;
    },
  ];
}>();

function isRetrying(item: BulkImportBatchItem) {
  return (
    item.extractionJobId != null &&
    props.retryingJobIds?.has(item.extractionJobId) === true
  );
}

type ReviewPoster = PosterResponse & {
  imageUrl?: string;
  status?: string;
};

const toast = useToast();

const reviewableItems = computed(() =>
  props.items.filter(
    (item) => item.posterId != null && item.status === "completed",
  ),
);

const pendingItems = computed(() =>
  props.items.filter(
    (item) => item.status !== "completed" && item.status !== "failed",
  ),
);

const failedItems = computed(() =>
  props.items.filter((item) => item.status === "failed"),
);

// ---------------------------------------------------------------------------
// Batch summary: one request for every poster's thumbnail / extraction status
// and required-field validation (the list, checkmarks and issue alerts).
// Full metadata is only loaded for the poster you open (see below).
// ---------------------------------------------------------------------------

const summaryById = ref<Record<number, BulkPosterPreviewSummary>>({});
const summaryLoading = ref(false);
const summaryLoaded = ref(false);
const summaryError = ref(false);
let summaryRequest: Promise<void> | null = null;

async function loadSummaries() {
  if (!props.bulkImportJobId) return;
  if (summaryRequest) return summaryRequest;

  summaryLoading.value = true;
  summaryRequest = (async () => {
    try {
      const { posters } = await getBulkPosterPreviewSummaries(
        props.bulkImportJobId!,
      );
      const previous = summaryById.value;
      const next: Record<number, BulkPosterPreviewSummary> = {};
      const bust = { ...thumbnailCacheBustById.value };
      for (const summary of posters) {
        next[summary.posterId] = summary;
        const hadImage = Boolean(previous[summary.posterId]?.imageUrl?.trim());
        if (!hadImage && summary.imageUrl.trim()) {
          bust[summary.posterId] = Date.now();
          thumbnailPending.value.delete(summary.posterId);
        }
      }
      summaryById.value = next;
      thumbnailCacheBustById.value = bust;
      summaryLoaded.value = true;
      summaryError.value = false;
      queueMissingThumbnails();
    } catch {
      summaryError.value = true;
    } finally {
      summaryLoading.value = false;
      summaryRequest = null;
    }
  })();

  return summaryRequest;
}

function validationForPosterId(
  posterId: number,
): PosterStrictValidationResult | null {
  const summary = summaryById.value[posterId];
  if (!summary) return null;
  return { valid: summary.issues.length === 0, issues: summary.issues };
}

const validationByPosterId = computed(() => {
  const map: Record<number, PosterStrictValidationResult> = {};
  for (const item of reviewableItems.value) {
    if (item.posterId == null) continue;
    const result = validationForPosterId(item.posterId);
    if (result) map[item.posterId] = result;
  }
  return map;
});

const metadataValidationPending = computed(
  () =>
    reviewableItems.value.length > 0 &&
    !summaryError.value &&
    (!summaryLoaded.value ||
      reviewableItems.value.some(
        (item) =>
          item.posterId != null && summaryById.value[item.posterId] == null,
      )),
);

// ---------------------------------------------------------------------------
// Thumbnails: queue missing previews once, then re-read the batch summary
// (one request) until they appear, instead of polling each poster.
// ---------------------------------------------------------------------------

const thumbnailCacheBustById = ref<Record<number, number>>({});
const thumbnailQueueAttempted = new Set<number>();
/** Posters whose preview is being generated (shown as "Generating preview…"). */
const thumbnailPending = ref(new Set<number>());
const regeneratingPreview = ref(false);

const THUMBNAIL_POLL_MS = 3_000;
const THUMBNAIL_POLL_MAX_MS = 120_000;
let thumbnailPollTimer: ReturnType<typeof setTimeout> | undefined;
let thumbnailPollStartedAt = 0;

function stopThumbnailPolling() {
  if (thumbnailPollTimer) clearTimeout(thumbnailPollTimer);
  thumbnailPollTimer = undefined;
}

function scheduleThumbnailPoll() {
  if (thumbnailPollTimer || thumbnailPending.value.size === 0) return;
  if (!thumbnailPollStartedAt) thumbnailPollStartedAt = Date.now();

  thumbnailPollTimer = setTimeout(async () => {
    thumbnailPollTimer = undefined;
    if (Date.now() - thumbnailPollStartedAt > THUMBNAIL_POLL_MAX_MS) {
      // Give up; the poster shows "Preview unavailable" with Generate.
      thumbnailPending.value = new Set();
      thumbnailPollStartedAt = 0;
      return;
    }
    await loadSummaries();
    if (thumbnailPending.value.size > 0) scheduleThumbnailPoll();
    else thumbnailPollStartedAt = 0;
  }, THUMBNAIL_POLL_MS);
}

function markThumbnailPending(posterId: number) {
  thumbnailPending.value = new Set([...thumbnailPending.value, posterId]);
  scheduleThumbnailPoll();
}

function extractionDone(summary: BulkPosterPreviewSummary | undefined) {
  const job = summary?.extractionJob;
  return job?.completed === true || job?.status === "completed";
}

/** Ask the worker for previews of extracted posters that have none (once each). */
function queueMissingThumbnails() {
  for (const item of reviewableItems.value) {
    const posterId = item.posterId;
    if (posterId == null || thumbnailQueueAttempted.has(posterId)) continue;
    const summary = summaryById.value[posterId];
    if (!summary?.found || summary.imageUrl.trim() || !extractionDone(summary)) {
      continue;
    }

    thumbnailQueueAttempted.add(posterId);
    markThumbnailPending(posterId);
    $fetch(`/api/poster/${posterId}/thumbnail`, { method: "POST" }).catch(
      () => {
        thumbnailQueueAttempted.delete(posterId);
        const next = new Set(thumbnailPending.value);
        next.delete(posterId);
        thumbnailPending.value = next;
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Selected poster: full metadata (title, creators, description) on demand.
// ---------------------------------------------------------------------------

const selectedPosterId = ref<number | null>(null);
const posterCache = ref<Record<number, ReviewPoster>>({});
const posterErrors = ref<Record<number, string>>({});
const fetchingPosterIds = ref<Set<number>>(new Set());
const posterInFlight = new Map<number, Promise<void>>();

function patchPosterCache(posterId: number, data: ReviewPoster) {
  posterCache.value = { ...posterCache.value, [posterId]: data };
}

async function ensurePosterInCache(posterId: number) {
  if (posterCache.value[posterId]) return;

  const existing = posterInFlight.get(posterId);
  if (existing) return existing;

  const promise = (async () => {
    fetchingPosterIds.value = new Set([
      ...fetchingPosterIds.value,
      posterId,
    ]);

    try {
      const data = await $fetch<ReviewPoster>(`/api/poster/${posterId}`);
      patchPosterCache(posterId, data);
      const { [posterId]: _removed, ...rest } = posterErrors.value;
      posterErrors.value = rest;
    } catch {
      posterErrors.value = {
        ...posterErrors.value,
        [posterId]: "Could not load extracted metadata for this poster.",
      };
    } finally {
      const next = new Set(fetchingPosterIds.value);
      next.delete(posterId);
      fetchingPosterIds.value = next;
      posterInFlight.delete(posterId);
    }
  })();

  posterInFlight.set(posterId, promise);
  return promise;
}

/** Load the selected poster, then quietly prefetch the next one in the list. */
async function loadSelectedAndNext(posterId: number) {
  await ensurePosterInCache(posterId);
  const ids = reviewableItems.value.map((item) => item.posterId);
  const nextId = ids[ids.indexOf(posterId) + 1];
  if (nextId != null) void ensurePosterInCache(nextId);
}

const poster = computed(() => {
  const id = selectedPosterId.value;
  if (id == null) return null;
  return posterCache.value[id] ?? null;
});

const selectedSummary = computed(() => {
  const id = selectedPosterId.value;
  return id == null ? null : (summaryById.value[id] ?? null);
});

const posterError = computed(() => {
  const id = selectedPosterId.value;
  if (id == null) return null;
  return posterErrors.value[id] ?? null;
});

const posterLoading = computed(() => {
  const id = selectedPosterId.value;
  if (id == null) return false;
  return fetchingPosterIds.value.has(id) && posterCache.value[id] == null;
});

watch(
  () => props.metadataRefreshKey,
  () => {
    stopThumbnailPolling();
    thumbnailQueueAttempted.clear();
    thumbnailPending.value = new Set();
    thumbnailPollStartedAt = 0;
    posterCache.value = {};
    posterErrors.value = {};
    void loadSummaries();
    if (selectedPosterId.value != null) {
      void loadSelectedAndNext(selectedPosterId.value);
    }
  },
);

watch(
  () => reviewableItems.value.map((item) => item.posterId).join(","),
  (ids, previousIds) => {
    const items = reviewableItems.value;
    if (items.length === 0) {
      selectedPosterId.value = null;
      return;
    }
    if (
      selectedPosterId.value == null ||
      !items.some((item) => item.posterId === selectedPosterId.value)
    ) {
      selectedPosterId.value = items[0]!.posterId!;
    }
    void loadSelectedAndNext(selectedPosterId.value!);
    // More posters finished extracting: refresh the summary for them.
    if (ids !== previousIds) void loadSummaries();
  },
  { immediate: true },
);

function selectPoster(posterId: number) {
  if (posterId === selectedPosterId.value) return;
  selectedPosterId.value = posterId;
  void loadSelectedAndNext(posterId);
}

const meta = computed(() => poster.value?.posterMetadata ?? null);

const displayTitle = computed(() => {
  const titles = meta.value?.titles;
  if (Array.isArray(titles) && titles.length > 0) {
    const first = titles[0] as { title?: string };
    if (first?.title?.trim()) return first.title.trim();
  }
  return poster.value?.title?.trim() || "Untitled poster";
});

/** The poster's description (what is published and validated as Description). */
const displayDescription = computed(
  () => poster.value?.description?.trim() ?? "",
);

const editMetadataPath = computed(() => {
  if (selectedPosterId.value == null) return undefined;
  if (!props.bulkImportJobId) {
    return `/share/${selectedPosterId.value}`;
  }
  return sharePosterEditPath(selectedPosterId.value, {
    bulkImportJobId: props.bulkImportJobId,
    bulkWizardStep: "preview",
  });
});

const posterPreviewSrc = computed(() => {
  const summary = selectedSummary.value;
  if (!summary?.imageUrl.trim()) return "";

  const bustMs = thumbnailCacheBustById.value[summary.posterId];
  const bust = bustMs ? `?t=${bustMs}` : "";

  if (summary.status === "published") {
    return `${summary.imageUrl}${bust}`;
  }

  return `/api/poster/${summary.posterId}/thumbnail${bust}`;
});

const posterPreviewMissing = computed(() => {
  const summary = selectedSummary.value;
  if (!summary || summary.imageUrl.trim()) return false;
  if (summary.extractionJob?.status === "pending-thumbnail") return false;
  if (thumbnailPending.value.has(summary.posterId)) return false;
  const job = summary.extractionJob;
  return Boolean(
    !job || job.completed || job.status === "completed" || job.status === "failed",
  );
});

async function regeneratePreview() {
  const summary = selectedSummary.value;
  if (!summary) return;
  const posterId = summary.posterId;

  regeneratingPreview.value = true;
  try {
    const response = await $fetch<{
      success: boolean;
      queued?: boolean;
      imageUrl?: string | null;
    }>(`/api/poster/${posterId}/thumbnail`, { method: "POST" });

    if (response.imageUrl) {
      summaryById.value = {
        ...summaryById.value,
        [posterId]: { ...summary, imageUrl: response.imageUrl },
      };
      thumbnailCacheBustById.value = {
        ...thumbnailCacheBustById.value,
        [posterId]: Date.now(),
      };
      toast.add({
        title: "Preview updated",
        color: "success",
      });
      return;
    }

    markThumbnailPending(posterId);
    if (response.queued) {
      toast.add({
        title: "Generating preview",
        description: "The thumbnail will appear here when it is ready.",
        color: "info",
      });
    }
  } catch {
    toast.add({
      title: "Could not generate preview",
      description: "Try again in a moment.",
      color: "error",
    });
  } finally {
    regeneratingPreview.value = false;
  }
}

const creators = computed(() => {
  const raw = meta.value?.creators;
  if (!Array.isArray(raw)) return [] as string[];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const name = (entry as { name?: string }).name?.trim();
      return name ?? "";
    })
    .filter(Boolean);
});

const invalidMetadataItems = computed(() =>
  reviewableItems.value.filter((item) => {
    if (item.posterId == null) return false;
    const result = validationByPosterId.value[item.posterId];
    return result != null && !result.valid;
  }),
);

const allReviewableMetadataValid = computed(() => {
  if (reviewableItems.value.length === 0) return false;
  if (metadataValidationPending.value || summaryError.value) return false;
  return invalidMetadataItems.value.length === 0;
});

const selectedPosterValidation = computed(() => {
  const id = selectedPosterId.value;
  if (id == null) return null;
  return validationByPosterId.value[id] ?? null;
});

watch(
  [allReviewableMetadataValid, invalidMetadataItems, metadataValidationPending],
  () => {
    emit("validation-change", {
      allValid: allReviewableMetadataValid.value,
      invalidCount: invalidMetadataItems.value.length,
      pending: metadataValidationPending.value,
    });
  },
  { immediate: true, deep: true },
);

function previewValidationLines(): string[] {
  return invalidMetadataItems.value.map((item) => {
    const label = item.fileName?.trim() || `Poster ${item.posterId ?? ""}`;
    const validation =
      item.posterId != null
        ? validationByPosterId.value[item.posterId]
        : undefined;
    const detail =
      (validation?.issues[0] &&
        strictIssueMessage(validation.issues[0].path, validation.issues[0].message)) ??
      "Required metadata is incomplete.";
    return `${label}: ${detail}`;
  });
}

export type PreviewValidationGroup = {
  posterId: number;
  fileName: string;
  issues: string[];
  editPath: ReturnType<typeof sharePosterEditPath>;
};

/** Every invalid poster with all of its issues and a link to fix them. */
function previewValidationGroups(): PreviewValidationGroup[] {
  return invalidMetadataItems.value.flatMap((item) => {
    if (item.posterId == null) return [];
    const validation = validationByPosterId.value[item.posterId];
    const messages = [
      ...new Set(
        (validation?.issues ?? [])
          .map((issue) => strictIssueMessage(issue.path, issue.message))
          .filter(Boolean),
      ),
    ];
    return [
      {
        posterId: item.posterId,
        fileName: item.fileName?.trim() || `Poster ${item.posterId}`,
        issues: messages.length ? messages : ["Required metadata is incomplete."],
        editPath: props.bulkImportJobId
          ? sharePosterEditPath(item.posterId, {
              bulkImportJobId: props.bulkImportJobId,
              bulkWizardStep: "preview",
            })
          : `/share/${item.posterId}`,
      },
    ];
  });
}

defineExpose({
  allReviewableMetadataValid,
  metadataValidationPending,
  invalidMetadataItems,
  previewValidationLines,
  previewValidationGroups,
});

onUnmounted(() => {
  stopThumbnailPolling();
});
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="pendingItems.length > 0"
      color="info"
      variant="soft"
      icon="i-lucide-loader-circle"
      title="Extraction still running"
      :description="`${pendingItems.length} poster(s) still processing.`"
    />

    <UAlert
      v-if="failedItems.length > 0"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Some extractions failed"
    >
      <template #description>
        <p class="mb-2">
          {{ failedItems.length }} poster(s) failed. Retry extraction or edit
          metadata after a successful run.
        </p>
        <ul class="space-y-2">
          <li
            v-for="item in failedItems"
            :key="item.id"
            class="flex flex-wrap items-center justify-between gap-2"
          >
            <span class="line-clamp-1 text-sm">{{ item.fileName }}</span>
            <UButton
              v-if="item.extractionJobId"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-rotate-ccw"
              label="Retry"
              :loading="isRetrying(item)"
              @click="emit('retry', item)"
            />
          </li>
        </ul>
      </template>
    </UAlert>

    <UAlert
      v-if="reviewableItems.length > 0 && summaryError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Could not check required metadata"
      description="The posters' required fields could not be checked."
      :actions="[{ label: 'Retry', onClick: () => loadSummaries() }]"
    />

    <UAlert
      v-else-if="reviewableItems.length > 0 && metadataValidationPending"
      color="neutral"
      variant="soft"
      icon="i-lucide-loader-circle"
      title="Checking required metadata"
      description="Checking every poster's mandatory fields against the single-poster editor."
    />

    <UAlert
      v-else-if="invalidMetadataItems.length > 0"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Required metadata is incomplete"
    >
      <template #description>
        <p class="text-sm">
          {{ invalidMetadataItems.length }} of
          {{ reviewableItems.length }} poster(s) still need fixes before you can
          continue. Use Edit poster on each poster. The same required fields
          as a single poster upload apply here.
        </p>
        <ul class="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
          <li
            v-for="item in invalidMetadataItems"
            :key="item.id"
            class="flex flex-wrap items-baseline gap-x-2"
          >
            <span class="font-medium">{{ item.fileName }}</span>
            <span
              v-if="item.posterId != null && validationByPosterId[item.posterId]"
              class="text-muted text-xs"
            >
              {{
                (validationByPosterId[item.posterId]!.issues[0] &&
                  strictIssueMessage(
                    validationByPosterId[item.posterId]!.issues[0]!.path,
                    validationByPosterId[item.posterId]!.issues[0]!.message,
                  )) ??
                  "Missing required fields"
              }}
            </span>
          </li>
        </ul>
      </template>
    </UAlert>

    <div
      v-if="reviewableItems.length === 0"
      class="text-muted rounded-lg border border-dashed px-4 py-8 text-center text-sm"
    >
      No completed extractions yet.
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[minmax(11rem,14rem)_1fr]">
      <nav
        aria-label="Posters in batch"
        class="max-h-80 space-y-1 self-start overflow-y-auto overscroll-contain pr-1 lg:max-h-[min(48rem,80vh)]"
        tabindex="0"
      >
        <button
          v-for="item in reviewableItems"
          :key="item.posterId"
          type="button"
          class="flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
          :class="
            item.posterId === selectedPosterId
              ? 'border-primary bg-primary/5 font-medium'
              : 'border-default hover:bg-elevated/50'
          "
          @click="item.posterId != null && selectPoster(item.posterId)"
        >
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{{
            item.fileName
          }}</span>
          <UIcon
            v-if="
              item.posterId != null &&
              validationByPosterId[item.posterId] &&
              !validationByPosterId[item.posterId]!.valid
            "
            name="i-lucide-circle-alert"
            class="text-error mt-0.5 size-4 shrink-0"
            aria-label="Required metadata incomplete"
          />
          <UIcon
            v-else-if="
              item.posterId != null &&
              validationByPosterId[item.posterId]?.valid
            "
            name="i-lucide-circle-check"
            class="text-success mt-0.5 size-4 shrink-0"
            aria-label="Required metadata complete"
          />
        </button>
      </nav>

      <div class="border-default relative min-h-[12rem] space-y-4 rounded-lg border p-4">
        <div
          v-if="posterLoading"
          class="flex items-center justify-center gap-2 py-8"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="text-primary size-6 animate-spin"
          />
          <span class="text-muted text-sm">Loading…</span>
        </div>

        <UAlert
          v-else-if="posterError"
          color="error"
          variant="soft"
          :title="posterError"
        />

        <template v-else-if="poster">
          <div class="min-w-0 space-y-4">
            <!-- Title wraps on the left; the button stays pinned top-right. -->
            <div class="flex items-start gap-3">
              <h4
                class="min-w-0 flex-1 text-base leading-snug font-semibold [overflow-wrap:anywhere]"
              >
                {{ displayTitle }}
              </h4>
              <UButton
                v-if="editMetadataPath"
                class="shrink-0"
                color="primary"
                variant="soft"
                size="sm"
                icon="i-lucide-pencil-line"
                label="Edit poster"
                :to="editMetadataPath"
              />
            </div>

            <UAlert
              v-if="
                selectedPosterValidation &&
                !selectedPosterValidation.valid
              "
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              title="Required fields missing"
            >
              <template #description>
                <ul class="mt-1 list-inside list-disc text-sm">
                  <li
                    v-for="(issue, index) in selectedPosterValidation.issues.slice(
                      0,
                      6,
                    )"
                    :key="`${issue.path}-${index}`"
                  >
                    {{ strictIssueMessage(issue.path, issue.message) }}
                  </li>
                  <li
                    v-if="selectedPosterValidation.issues.length > 6"
                    class="text-muted list-none text-xs"
                  >
                    …and
                    {{ selectedPosterValidation.issues.length - 6 }} more
                  </li>
                </ul>
              </template>
            </UAlert>

            <div
              class="border-default flex aspect-video max-h-[min(55vh,22rem)] w-full items-center justify-center overflow-hidden rounded-lg border bg-gray-50 dark:bg-gray-900/50"
            >
              <img
                v-if="posterPreviewSrc"
                :src="posterPreviewSrc"
                :alt="displayTitle"
                decoding="async"
                class="max-h-full max-w-full object-contain"
              />
              <div
                v-else-if="posterPreviewMissing"
                class="flex flex-col items-center gap-2 p-4 text-center"
              >
                <UIcon
                  name="i-lucide-image-off"
                  class="size-8 text-gray-400 dark:text-gray-500"
                />
                <span class="text-muted text-xs">Preview unavailable</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-refresh-cw"
                  label="Generate"
                  :loading="regeneratingPreview"
                  @click="regeneratePreview"
                />
              </div>
              <div
                v-else
                class="flex flex-col items-center gap-2 p-4 text-center"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-8 animate-spin text-primary"
                />
                <span class="text-muted text-xs">Generating preview…</span>
              </div>
            </div>

            <div v-if="creators.length > 0">
              <p class="text-muted text-xs font-medium uppercase tracking-wide">
                Creators
              </p>
              <p class="mt-1 text-sm">{{ creators.join(", ") }}</p>
            </div>
            <p v-else class="text-muted text-sm">
              No contributors were extracted. Add them on the Creators tab of
              the batch metadata step.
            </p>

            <div>
              <p class="text-muted text-xs font-medium uppercase tracking-wide">
                Description
              </p>
              <p
                v-if="displayDescription"
                class="mt-1 line-clamp-6 text-sm whitespace-pre-wrap"
              >
                {{ displayDescription }}
              </p>
              <p v-else class="text-muted mt-1 text-sm">
                No description yet.
              </p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
