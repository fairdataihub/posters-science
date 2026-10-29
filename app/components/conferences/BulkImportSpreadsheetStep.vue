<script setup lang="ts">
import type { BulkSubmissionExtractionMethod } from "#shared/types/bulkSubmission";
import { importBulkReviewMetadataWorkbook } from "~/utils/bulkPosterSubmissionJobClient";

const WORKBOOK_ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const props = defineProps<{
  bulkJobId: string | null;
  completedPosterCount: number;
  extractionMethod: BulkSubmissionExtractionMethod;
}>();

const emit = defineEmits<{
  imported: [posterIds: number[]];
}>();

const prefillDescription = computed(() => {
  if (props.extractionMethod === "minimal") {
    return "Download one Excel workbook for this batch. Sheets match the poster editor; only high-confidence extracted fields and batch conference/license values are prefilled. Other columns stay blank for optional edits.";
  }
  return "Download one Excel workbook for this batch. Each sheet matches a section of the poster editor. All extracted metadata tiers are prefilled where available.";
});

const uploadDisabled = computed(
  () => !props.bulkJobId || props.completedPosterCount === 0,
);

const toast = useToast();
const downloading = ref(false);
const importing = ref(false);
const workbookUploadRef = ref<{ clearFiles: () => void } | null>(null);

function fetchErrorDescription(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("data" in error && error.data && typeof error.data === "object") {
    const data = error.data as {
      message?: string;
      statusMessage?: string;
      issues?: Array<{ message?: string }>;
    };
    const issueMessage = data.issues?.find((issue) => issue.message)?.message;
    return issueMessage ?? data.message ?? data.statusMessage;
  }
  if ("statusMessage" in error && typeof error.statusMessage === "string") {
    return error.statusMessage;
  }
  return undefined;
}

function validateWorkbookFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx")) {
    return "Upload the metadata review workbook (.xlsx) from this batch.";
  }
  if (file.size > 12 * 1024 * 1024) {
    return "Workbook must be 12 MB or smaller.";
  }
  return null;
}

function onWorkbookFilesRejected(rejections: { file: File; reason: string }[]) {
  const first = rejections[0];
  if (!first) return;

  toast.add({
    title: "File not accepted",
    description: `${first.file.name}: ${first.reason}`,
    color: "error",
  });
}

async function importWorkbookFile(file: File) {
  if (!props.bulkJobId || importing.value) return;

  importing.value = true;

  try {
    const result = await importBulkReviewMetadataWorkbook(
      props.bulkJobId,
      file,
    );
    const count = result.updatedPosterIds.length;
    toast.add({
      title: "Spreadsheet imported",
      description: `Applied metadata from the workbook to ${count} poster(s).`,
      color: "success",
    });
    workbookUploadRef.value?.clearFiles();
    emit("imported", result.updatedPosterIds);
  } catch (error) {
    toast.add({
      title: "Import failed",
      description:
        fetchErrorDescription(error) ??
        (error instanceof Error ? error.message : "Could not import workbook."),
      color: "error",
    });
  } finally {
    importing.value = false;
  }
}

async function onWorkbookFilesSelected(files: File[]) {
  const file = files[0];
  if (!file || uploadDisabled.value) return;
  await importWorkbookFile(file);
}

async function downloadWorkbook() {
  if (!props.bulkJobId || downloading.value) return;

  downloading.value = true;

  try {
    const response = await fetch(
      `/api/bulk-poster-submissions/${props.bulkJobId}/metadata-workbook`,
      { method: "GET", credentials: "include" },
    );

    if (!response.ok) {
      const text = await response.text();
      let message = `Request failed (${response.status})`;
      try {
        const json = JSON.parse(text) as {
          statusMessage?: string;
          message?: string;
        };
        message = json.statusMessage ?? json.message ?? message;
      } catch {
        if (text) message = text.slice(0, 160);
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
    const filename = filenameMatch?.[1] ?? "poster-metadata.xlsx";

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    toast.add({
      title: "Spreadsheet downloaded",
      description: "Open the workbook to review or edit metadata offline.",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Download failed",
      description:
        error instanceof Error ? error.message : "Could not download workbook.",
      color: "error",
    });
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <p class="text-muted text-sm">
      {{ completedPosterCount }} poster(s) with completed extraction are included.
      Download the workbook, edit metadata offline, then upload it here to apply
      changes (matched by Poster ID).
    </p>

    <ol class="space-y-8">
      <li class="space-y-4">
        <div class="flex items-start gap-3">
          <span
            class="bg-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            aria-hidden="true"
          >
            1
          </span>
          <div class="min-w-0 space-y-1">
            <h4 class="text-base font-semibold">Download the metadata spreadsheet</h4>
            <p class="text-muted text-sm">
              {{ prefillDescription }}
            </p>
          </div>
        </div>

        <div class="border-default ml-11 rounded-lg border p-4">
          <UButton
            color="primary"
            size="lg"
            icon="i-lucide-download"
            label="Download workbook"
            :loading="downloading"
            :disabled="uploadDisabled"
            @click="downloadWorkbook"
          />
        </div>
      </li>

      <li class="space-y-4">
        <div class="flex items-start gap-3">
          <span
            class="bg-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            aria-hidden="true"
          >
            2
          </span>
          <div class="min-w-0 space-y-1">
            <h4 class="text-base font-semibold">Upload your edited spreadsheet</h4>
            <p class="text-muted text-sm">
              When you are done editing in Excel, upload the same workbook to apply
              metadata to every poster in this batch.
            </p>
          </div>
        </div>

        <div
          class="border-default ml-11 space-y-4 rounded-lg border p-4"
          :class="{
            'pointer-events-none opacity-50': uploadDisabled || importing,
          }"
        >
          <UiFileUpload
            ref="workbookUploadRef"
            :accept="WORKBOOK_ACCEPT"
            :validate-file="validateWorkbookFile"
            title="Drop your workbook here"
            description="Drag and drop the file from step 1, or click to browse."
            hint="Excel (.xlsx) only."
            @on-change="onWorkbookFilesSelected"
            @on-reject="onWorkbookFilesRejected"
          >
            <UiFileUploadGrid />
          </UiFileUpload>

          <div
            v-if="importing"
            class="flex items-center justify-center gap-2 py-2"
            aria-live="polite"
            aria-busy="true"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="text-primary size-5 animate-spin"
            />
            <span class="text-muted text-sm">Applying workbook to posters…</span>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>
