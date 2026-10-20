<script setup lang="ts">
import type { BulkImportBatchItem } from "#shared/types/conferenceBulkImport";
import type { PosterResponse } from "@/utils/poster_schema";

const props = defineProps<{
  items: BulkImportBatchItem[];
}>();

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

const contentSections = computed(() => {
  const raw = meta.value?.posterContent as
    | { sections?: Array<{ sectionTitle?: string; sectionContent?: string }> }
    | undefined;
  const sections = raw?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.filter(
    (section) =>
      section.sectionTitle?.trim() || section.sectionContent?.trim(),
  );
});

const editMetadataPath = computed(() =>
  selectedPosterId.value != null
    ? `/share/${selectedPosterId.value}`
    : undefined,
);
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="pendingItems.length > 0"
      color="info"
      variant="soft"
      icon="i-lucide-loader-circle"
      title="Extraction still running"
      :description="`${pendingItems.length} poster(s) are not ready to review yet. Completed posters appear below as they finish.`"
    />

    <UAlert
      v-if="failedItems.length > 0"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Some extractions failed"
      :description="`${failedItems.length} poster(s) failed. Open the dashboard or retry from the poster draft when available.`"
    />

    <p class="text-muted text-sm">
      This is the same extracted metadata you would see after uploading a single
      poster. Use “Edit metadata” for the
      full form (creators, sections, license, and more).
    </p>

    <div
      v-if="reviewableItems.length === 0"
      class="text-muted rounded-lg border border-dashed px-4 py-10 text-center text-sm"
    >
      No completed extractions yet. Stay on this page or return from the submit
      step once jobs finish.
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(12rem,16rem)_1fr]">
      <nav aria-label="Posters in batch" class="space-y-1">
        <button
          v-for="item in reviewableItems"
          :key="item.posterId"
          type="button"
          class="flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition-colors"
          :class="
            item.posterId === selectedPosterId
              ? 'border-primary bg-primary/5'
              : 'border-default hover:bg-elevated/50'
          "
          @click="item.posterId != null && selectPoster(item.posterId)"
        >
          <span class="line-clamp-2 font-medium">{{ item.fileName }}</span>
          <span class="text-muted text-xs">Poster #{{ item.posterId }}</span>
        </button>
      </nav>

      <div class="border-default min-h-[20rem] space-y-4 rounded-lg border p-4">
        <div
          v-if="posterLoading"
          class="flex flex-col items-center justify-center gap-2 py-16"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="text-primary size-8 animate-spin"
          />
          <span class="text-muted text-sm">Loading metadata…</span>
        </div>

        <UAlert
          v-else-if="posterError"
          color="error"
          variant="soft"
          :title="posterError"
        />

        <template v-else-if="poster && meta">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold">{{ displayTitle }}</h4>
              <p v-if="creators.length" class="text-muted mt-1 text-sm">
                {{ creators.join(" · ") }}
              </p>
            </div>
            <UButton
              v-if="editMetadataPath"
              color="primary"
              icon="i-lucide-pencil-line"
              label="Edit metadata"
              :to="editMetadataPath"
            />
          </div>

          <img
            v-if="poster.imageUrl"
            :src="poster.imageUrl"
            alt="Poster preview"
            class="max-h-48 w-auto rounded-md border object-contain"
          />

          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div v-if="meta.license">
              <dt class="text-muted">License</dt>
              <dd class="font-medium">{{ meta.license }}</dd>
            </div>
            <div v-if="meta.conferenceName">
              <dt class="text-muted">Conference</dt>
              <dd class="font-medium">
                {{ meta.conferenceName }}
                <span v-if="meta.conferenceYear">
                  ({{ meta.conferenceYear }})
                </span>
              </dd>
            </div>
            <div v-if="meta.language">
              <dt class="text-muted">Language</dt>
              <dd class="font-medium">{{ meta.language }}</dd>
            </div>
            <div v-if="meta.domain">
              <dt class="text-muted">Domain</dt>
              <dd class="font-medium">{{ meta.domain }}</dd>
            </div>
          </dl>

          <div v-if="contentSections.length > 0" class="space-y-3">
            <h5 class="text-sm font-semibold">Poster content</h5>
            <div
              v-for="(section, index) in contentSections.slice(0, 6)"
              :key="`${section.sectionTitle}-${index}`"
              class="rounded-md bg-elevated/40 px-3 py-2"
            >
              <p class="text-sm font-medium">
                {{ section.sectionTitle || "Section" }}
              </p>
              <p class="text-muted mt-1 line-clamp-4 text-sm whitespace-pre-wrap">
                {{ section.sectionContent }}
              </p>
            </div>
            <p
              v-if="contentSections.length > 6"
              class="text-muted text-xs"
            >
              {{ contentSections.length - 6 }} more section(s) — open the full
              editor to review all content.
            </p>
          </div>

          <p v-else class="text-muted text-sm">
            No structured sections were extracted yet. Open the full metadata
            editor to add or fix content.
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
