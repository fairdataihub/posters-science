<script setup lang="ts">
import type { BulkImportBatchItem } from "#shared/types/conferenceBulkImport";
import type { PosterResponse } from "@/utils/poster_schema";

const props = defineProps<{
  items: BulkImportBatchItem[];
}>();

const toast = useToast();

const completedItems = computed(() =>
  props.items.filter(
    (item) => item.posterId != null && item.status === "completed",
  ),
);

const posterTitles = ref<Record<number, string>>({});

watch(
  completedItems,
  (items) => {
    for (const item of items) {
      const posterId = item.posterId;
      if (posterId == null || posterTitles.value[posterId]) continue;
      void loadPosterTitle(posterId, item.fileName);
    }
  },
  { immediate: true },
);

async function loadPosterTitle(posterId: number, fallbackFileName: string) {
  try {
    const poster = await $fetch<PosterResponse>(`/api/poster/${posterId}`);
    const metaTitle = poster.posterMetadata?.titles?.[0] as
      | { title?: string }
      | undefined;
    const title =
      metaTitle?.title?.trim() ||
      poster.title?.trim() ||
      fallbackFileName.replace(/\.[^.]+$/, "");
    posterTitles.value = { ...posterTitles.value, [posterId]: title };
  } catch {
    posterTitles.value = {
      ...posterTitles.value,
      [posterId]: fallbackFileName.replace(/\.[^.]+$/, "") || fallbackFileName,
    };
  }
}

function displayName(item: BulkImportBatchItem) {
  const posterId = item.posterId;
  if (posterId != null && posterTitles.value[posterId]) {
    return posterTitles.value[posterId];
  }
  return item.fileName.replace(/\.[^.]+$/, "") || item.fileName;
}

function posterFileIcon(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf") return "i-vscode-icons-file-type-pdf2";
  if (extension === "png") return "i-vscode-icons-file-type-image";
  if (extension === "jpg" || extension === "jpeg") {
    return "i-vscode-icons-file-type-image";
  }
  return "i-lucide-file";
}

const posterJsonDrawerOpen = ref(false);
const posterJsonLoading = ref(false);
const posterJsonData = ref<Record<string, unknown> | null>(null);
const posterJsonPreviewTitle = ref("");

async function openPosterJsonPreview(item: BulkImportBatchItem) {
  const posterId = item.posterId;
  if (posterId == null) return;

  posterJsonPreviewTitle.value = displayName(item);
  posterJsonDrawerOpen.value = true;
  posterJsonLoading.value = true;
  posterJsonData.value = null;

  try {
    posterJsonData.value = await $fetch<Record<string, unknown>>(
      `/api/poster/${posterId}/poster-json`,
      { credentials: "include" },
    );
  } catch (err) {
    toast.add({
      title: "Preview failed",
      description:
        err instanceof Error ? err.message : "Could not load poster.json",
      color: "error",
    });
    posterJsonDrawerOpen.value = false;
  } finally {
    posterJsonLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="completedItems.length === 0"
      class="text-muted rounded-lg border border-dashed px-4 py-8 text-center text-sm"
    >
      No completed extractions yet. Finish extraction on the AI metadata extraction step, then
      return here to preview poster.json for each poster.
    </div>

    <div v-else class="space-y-3">
      <article
        v-for="item in completedItems"
        :key="item.id"
        class="border-default rounded-xl border px-3 py-3"
      >
        <h4
          class="mb-2 line-clamp-2 text-sm font-semibold"
          :title="displayName(item)"
        >
          {{ displayName(item) }}
        </h4>

        <div class="flex flex-col">
          <div
            class="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-900/50"
          >
            <div class="flex min-w-0 items-center gap-2">
              <UIcon
                name="i-vscode-icons-file-type-json"
                class="size-4 shrink-0"
              />
              <span class="text-sm">poster.json</span>
            </div>

            <UButton
              variant="subtle"
              size="xs"
              icon="i-lucide-eye"
              label="Preview file"
              @click="openPosterJsonPreview(item)"
            />
          </div>

          <div
            class="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-900/50"
          >
            <UIcon
              :name="posterFileIcon(item.fileName)"
              class="size-4 shrink-0"
            />
            <span class="text-sm" :title="item.fileName">
              {{ item.fileName }}
            </span>
          </div>
        </div>
      </article>
    </div>

    <UDrawer
      v-model:open="posterJsonDrawerOpen"
      direction="right"
      :ui="{ content: 'w-[600px] max-w-full' }"
    >
      <template #content>
        <div class="flex h-full flex-col gap-4 p-6">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <UIcon name="i-vscode-icons-file-type-json" class="size-5" />
              <h3 class="text-lg font-semibold">poster.json preview</h3>
            </div>
            <p
              v-if="posterJsonPreviewTitle"
              class="text-muted line-clamp-2 text-sm"
            >
              {{ posterJsonPreviewTitle }}
            </p>
          </div>

          <UiSpinner v-if="posterJsonLoading" />

          <pre
            v-else-if="posterJsonData"
            class="bg-muted min-h-0 flex-1 overflow-auto rounded-lg p-4 text-xs"
            >{{ JSON.stringify(posterJsonData, null, 2) }}</pre
          >
        </div>
      </template>
    </UDrawer>
  </div>
</template>
