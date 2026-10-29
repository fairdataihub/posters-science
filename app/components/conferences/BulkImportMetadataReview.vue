<script setup lang="ts">
import type { BulkImportBatchItem } from "#shared/types/conferenceBulkImport";
import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import type { PosterResponse } from "@/utils/poster_schema";
import { sharePosterEditPath } from "~/utils/sharePaths";

const props = defineProps<{
  items: BulkImportBatchItem[];
  bulkImportJobId: string | null;
  extractionMethod: BulkSubmissionExtractionMethod;
  metadataRefreshKey?: number;
  retryingJobIds?: Set<string>;
}>();

const emit = defineEmits<{
  retry: [item: BulkImportBatchItem];
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

const selectedPosterId = ref<number | null>(null);
const posterCache = ref<Record<number, ReviewPoster>>({});
const posterErrors = ref<Record<number, string>>({});
const fetchingPosterIds = ref<Set<number>>(new Set());
const thumbnailCacheBustById = ref<Record<number, number>>({});
const regeneratingPreview = ref(false);

const posterInFlight = new Map<number, Promise<void>>();

const poster = computed(() => {
  const id = selectedPosterId.value;
  if (id == null) return null;
  return posterCache.value[id] ?? null;
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

function patchPosterCache(posterId: number, data: ReviewPoster) {
  posterCache.value = { ...posterCache.value, [posterId]: data };
}

function preloadPosterPreview(data: ReviewPoster) {
  if (!data.imageUrl?.trim()) return;

  const url =
    data.status === "published"
      ? data.imageUrl
      : `/api/poster/${data.id}/thumbnail`;

  const img = new Image();
  img.decoding = "async";
  img.src = url;
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
      preloadPosterPreview(data);
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

watch(
  () => props.metadataRefreshKey,
  () => {
    posterCache.value = {};
    posterErrors.value = {};
    for (const item of reviewableItems.value) {
      if (item.posterId != null) {
        void ensurePosterInCache(item.posterId);
      }
    }
  },
);

watch(
  reviewableItems,
  (items) => {
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
    for (const item of items) {
      if (item.posterId != null) {
        void ensurePosterInCache(item.posterId);
      }
    }
  },
  { immediate: true },
);

function selectPoster(posterId: number) {
  if (posterId === selectedPosterId.value) return;
  selectedPosterId.value = posterId;
  void ensurePosterInCache(posterId);
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

const displaySummary = computed(() => {
  const descriptions = meta.value?.descriptions;
  if (Array.isArray(descriptions)) {
    for (const entry of descriptions) {
      if (!entry || typeof entry !== "object") continue;
      const typed = entry as { description?: string; descriptionType?: string };
      const text = typed.description?.trim();
      if (!text) continue;
      if ((typed.descriptionType ?? "").trim() === "Abstract") return text;
    }
    for (const entry of descriptions) {
      if (!entry || typeof entry !== "object") continue;
      const text = (entry as { description?: string }).description?.trim();
      if (text) return text;
    }
  }

  const posterContent = meta.value?.posterContent as
    | {
        submissionAbstract?: string;
        sections?: Array<{ sectionTitle?: string; sectionContent?: string }>;
      }
    | undefined;

  const submissionAbstract = posterContent?.submissionAbstract?.trim();
  if (submissionAbstract) return submissionAbstract;

  const sections = posterContent?.sections;
  if (Array.isArray(sections)) {
    for (const section of sections) {
      const title = section.sectionTitle?.trim() ?? "";
      if (title && /abstract/i.test(title)) {
        const content = section.sectionContent?.trim();
        if (content) return content;
      }
    }
  }

  return poster.value?.description?.trim() ?? "";
});

const editMetadataPath = computed(() => {
  if (selectedPosterId.value == null) return undefined;
  if (!props.bulkImportJobId) {
    return `/share/${selectedPosterId.value}`;
  }
  return sharePosterEditPath(selectedPosterId.value, {
    bulkImportJobId: props.bulkImportJobId,
    bulkWizardStep: "review",
  });
});

const posterPreviewSrc = computed(() => {
  if (!poster.value?.imageUrl?.trim()) return "";

  const bustMs = thumbnailCacheBustById.value[poster.value.id];
  const bust = bustMs ? `?t=${bustMs}` : "";

  if (poster.value.status === "published") {
    return `${poster.value.imageUrl}${bust}`;
  }

  return `/api/poster/${poster.value.id}/thumbnail${bust}`;
});

const posterPreviewMissing = computed(() => {
  if (!poster.value?.imageUrl?.trim()) {
    const job = poster.value?.extractionJob;
    return Boolean(
      !job ||
        job.completed ||
        job.status === "completed" ||
        job.status === "failed",
    );
  }
  return false;
});

async function regeneratePreview() {
  if (!poster.value) return;

  regeneratingPreview.value = true;
  try {
    const response = await $fetch<{
      success: boolean;
      queued?: boolean;
      imageUrl?: string | null;
    }>(`/api/poster/${poster.value.id}/thumbnail`, { method: "POST" });

    const posterId = poster.value.id;

    if (response.imageUrl) {
      patchPosterCache(posterId, {
        ...poster.value,
        imageUrl: response.imageUrl,
      });
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

    if (response.queued) {
      toast.add({
        title: "Generating preview",
        description: "The thumbnail will appear here when it is ready.",
        color: "info",
      });
      return;
    }

    await ensurePosterInCache(posterId);
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
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="props.extractionMethod === 'minimal'"
      color="neutral"
      variant="soft"
      icon="i-lucide-filter"
      title="High-confidence auto-fill only"
      description="Only high-confidence extracted fields are stored for this batch (title, authors, figure/table captions, plus batch conference and license). Lower-confidence fields were omitted. You can add them in the editor if needed."
    />

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

    <div
      v-if="reviewableItems.length === 0"
      class="text-muted rounded-lg border border-dashed px-4 py-8 text-center text-sm"
    >
      No completed extractions yet.
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[minmax(11rem,14rem)_1fr]">
      <nav aria-label="Posters in batch" class="space-y-1">
        <button
          v-for="item in reviewableItems"
          :key="item.posterId"
          type="button"
          class="flex w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors"
          :class="
            item.posterId === selectedPosterId
              ? 'border-primary bg-primary/5 font-medium'
              : 'border-default hover:bg-elevated/50'
          "
          @click="item.posterId != null && selectPoster(item.posterId)"
        >
          <span class="line-clamp-2">{{ item.fileName }}</span>
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
            <div class="flex flex-wrap items-start justify-between gap-2">
              <h4 class="text-base font-semibold leading-snug">
                {{ displayTitle }}
              </h4>
              <UButton
                v-if="editMetadataPath"
                color="primary"
                variant="soft"
                size="sm"
                icon="i-lucide-pencil-line"
                label="Edit metadata"
                :to="editMetadataPath"
              />
            </div>

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
                Contributors
              </p>
              <p class="mt-1 text-sm">{{ creators.join(", ") }}</p>
            </div>
            <p v-else class="text-muted text-sm">
              No contributors were able to be extracted.
            </p>

            <div>
              <p class="text-muted text-xs font-medium uppercase tracking-wide">
                Summary
              </p>
              <p
                v-if="displaySummary"
                class="mt-1 line-clamp-6 text-sm whitespace-pre-wrap"
              >
                {{ displaySummary }}
              </p>
              <p v-else class="text-muted mt-1 text-sm">
                No summary extracted yet.
              </p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
