<script setup lang="ts">
import type { BulkImportBatchItem } from "#shared/types/conferenceBulkImport";
import type { PosterResponse } from "@/utils/poster_schema";
import { sharePosterEditPath } from "~/utils/sharePaths";

const props = defineProps<{
  items: BulkImportBatchItem[];
  bulkImportJobId: string | null;
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

const selectedPosterId = ref<number | null>(null);
const posterLoading = ref(false);
const posterError = ref<string | null>(null);
const poster = ref<PosterResponse | null>(null);

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

watch(
  reviewableItems,
  (items) => {
    if (items.length === 0) {
      selectedPosterId.value = null;
      poster.value = null;
      return;
    }
    if (
      selectedPosterId.value == null ||
      !items.some((item) => item.posterId === selectedPosterId.value)
    ) {
      selectedPosterId.value = items[0]!.posterId!;
      void loadPoster(items[0]!.posterId!);
    }
  },
  { immediate: true },
);

async function loadPoster(posterId: number) {
  selectedPosterId.value = posterId;
  posterLoading.value = true;
  posterError.value = null;
  poster.value = null;

  try {
    poster.value = await $fetch<PosterResponse>(`/api/poster/${posterId}`);
  } catch {
    posterError.value = "Could not load extracted metadata for this poster.";
  } finally {
    posterLoading.value = false;
  }
}

function selectPoster(posterId: number) {
  if (posterId === selectedPosterId.value && poster.value) return;
  void loadPoster(posterId);
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

      <div class="border-default space-y-4 rounded-lg border p-4">
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

          <div v-if="creators.length > 0">
            <p class="text-muted text-xs font-medium uppercase tracking-wide">
              Contributors
            </p>
            <p class="mt-1 text-sm">{{ creators.join(", ") }}</p>
          </div>
          <p v-else class="text-muted text-sm">No contributors extracted yet.</p>

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
            <p v-else class="text-muted mt-1 text-sm">No summary extracted yet.</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
