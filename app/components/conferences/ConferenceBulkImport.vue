<script setup lang="ts">
import {
  ALLOWED_POSTER_FILE_LABEL,
  MAX_POSTER_FILE_SIZE_LABEL,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";
import { conferenceImportSpreadsheetCsvFromFileNames } from "~/utils/conferenceImportSpreadsheet";

const props = defineProps<{
  conferenceAcronym: string;
}>();

const toast = useToast();

type ImportPackagingChoice = "prepared-zip" | "upload-separately";

const importPackagingItems: {
  label: string;
  value: ImportPackagingChoice;
  description: string;
}[] = [
  {
    label: "Yes — I have a prepared import ZIP",
    value: "prepared-zip",
    description:
      "Upload one ZIP that already contains your poster files and license metadata (for example licenses.xlsx).",
  },
  {
    label: "No — I'll upload my poster files here",
    value: "upload-separately",
    description:
      "Drop your poster PDFs or images, then generate a license file from the file names.",
  },
];

const importPackagingChoice = ref<ImportPackagingChoice | undefined>(undefined);

const preparedImportZip = ref<File[]>([]);
const posterFiles = ref<File[]>([]);

const POSTER_ONLY_HINT = `${ALLOWED_POSTER_FILE_LABEL}, up to ${MAX_POSTER_FILE_SIZE_LABEL} per file`;

const validatePosterFile = (file: File) =>
  posterFileRejectionReason({
    name: file.name,
    type: file.type,
    size: file.size,
  });

function validateZipFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".zip")) {
    return "Upload a ZIP file (.zip).";
  }
  if (file.size > 500 * 1024 * 1024) {
    return "ZIP files must be 500 MB or smaller.";
  }
  return null;
}

function validatePosterOnlyFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".zip")) {
    return "Upload individual poster files here, or choose the prepared ZIP option above.";
  }
  return validatePosterFile(file);
}

watch(importPackagingChoice, () => {
  preparedImportZip.value = [];
  posterFiles.value = [];
});

const posterFileNames = computed(() =>
  posterFiles.value.map((file) => file.name),
);

const preparedZipNames = computed(() =>
  preparedImportZip.value.map((file) => file.name),
);

const canStartImport = computed(() => {
  if (importPackagingChoice.value === "prepared-zip") {
    return preparedImportZip.value.length > 0;
  }
  if (importPackagingChoice.value === "upload-separately") {
    return posterFiles.value.length > 0;
  }
  return false;
});

function downloadGeneratedLicensesCsv() {
  const fileNames = posterFiles.value.map((file) => file.name);
  const csv = conferenceImportSpreadsheetCsvFromFileNames(fileNames);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${props.conferenceAcronym}-licenses.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function startImport() {
  toast.add({
    title: "Coming soon",
    description:
      "Bulk import is not connected to the server yet. Your files were not uploaded.",
    color: "info",
  });
}
</script>

<template>
  <UCard class="flex flex-col">
    <template #header>
      <h2 class="text-lg font-semibold">Bulk import</h2>
    </template>

    <div class="flex flex-col gap-8">
      <UAlert
        color="info"
        variant="soft"
        icon="i-lucide-info"
        title="Before you upload"
        description="Import processing is not enabled yet. Tell us whether you already have a prepared ZIP, then follow the steps below."
      />

      <div class="space-y-4">
        <p class="text-sm font-medium">
          Do you already have a prepared import ZIP?
        </p>
        <p class="text-muted text-sm">
          A prepared ZIP includes poster files and license metadata (for example
          <span class="font-medium">licenses.xlsx</span>) with each poster file
          name and SPDX license.
        </p>

        <URadioGroup
          v-model="importPackagingChoice"
          :items="importPackagingItems"
          value-key="value"
          label-key="label"
          description-key="description"
          :ui="{ fieldset: 'gap-3', item: 'items-start' }"
        />
      </div>

      <template v-if="importPackagingChoice === 'prepared-zip'">
        <USeparator />

        <div class="space-y-4">
          <h3 class="text-base font-semibold">Import ZIP</h3>
          <p class="text-muted text-sm">
            Upload your ZIP with poster PDFs or images and license metadata at
            the top level (for example
            <span class="font-medium">licenses.xlsx</span>).
          </p>

          <UiFileUpload
            hide-file-list
            hide-rejections
            :accept="'.zip,application/zip'"
            :validate-file="validateZipFile"
            hint="One ZIP file, up to 500 MB"
            @on-change="preparedImportZip = $event"
          >
            <UiFileUploadGrid />
          </UiFileUpload>

          <ul
            v-if="preparedZipNames.length > 0"
            class="border-default max-h-[500px] divide-default divide-y overflow-y-auto rounded-md border"
          >
            <li
              v-for="name in preparedZipNames"
              :key="name"
              class="truncate px-3 py-1.5 text-sm"
              :title="name"
            >
              {{ name }}
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="importPackagingChoice === 'upload-separately'">
        <USeparator />

        <div class="space-y-4">
          <h3 class="text-base font-semibold">Poster files</h3>
          <p class="text-muted text-sm">
            Drop all poster PDFs or images for this conference.
          </p>

          <UiFileUpload
            hide-file-list
            hide-rejections
            multiple
            :accept="POSTER_FILE_ACCEPT"
            :validate-file="validatePosterOnlyFile"
            :hint="POSTER_ONLY_HINT"
            @on-change="posterFiles = $event"
          >
            <UiFileUploadGrid />
          </UiFileUpload>

          <ul
            v-if="posterFileNames.length > 0"
            class="border-default max-h-[500px] divide-default divide-y overflow-y-auto rounded-md border"
          >
            <li
              v-for="name in posterFileNames"
              :key="name"
              class="truncate px-3 py-1.5 text-sm"
              :title="name"
            >
              {{ name }}
            </li>
          </ul>

          <UButton
            v-if="posterFiles.length > 0"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-file-spreadsheet"
            label="Generate licenses.csv"
            @click="downloadGeneratedLicensesCsv"
          />
        </div>
      </template>

      <div
        v-if="importPackagingChoice"
        class="flex justify-end border-t border-gray-100 pt-6 dark:border-gray-800"
      >
        <UButton
          color="primary"
          icon="line-md:file-upload"
          label="Review and import"
          :disabled="!canStartImport"
          @click="startImport"
        />
      </div>
    </div>
  </UCard>
</template>
