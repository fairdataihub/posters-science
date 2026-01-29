<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script setup lang="ts">
definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Share a Poster",
  description: "Upload and share your poster with the community",
});

const status = ref(0);
const isUploading = ref(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const selectedFiles = ref<any>(null);
const apiResponse = ref<unknown>(null);
const error = ref<string | null>(null);
const currentJobId = ref<string | null>(null);

// Poll interval in milliseconds
const POLL_INTERVAL = 3000;

interface JobStatusResponse {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  posterId: number | null;
  error: string | null;
}

const pollJobStatus = async (jobId: string): Promise<void> => {
  try {
    const response = await $fetch<JobStatusResponse>(
      `/api/poster/job/${jobId}`,
    );

    if (response.status === "completed" && response.posterId) {
      status.value = 4; // Complete
      navigateTo(`/share/${response.posterId}`);

      return;
    }

    if (response.status === "failed") {
      error.value = response.error || "Extraction failed";
      status.value = 0;
      isUploading.value = false;
      currentJobId.value = null;

      return;
    }

    // Update status based on job status
    if (response.status === "processing") {
      status.value = 2; // Processing
    }

    // Continue polling if still pending or processing
    if (response.status === "pending" || response.status === "processing") {
      setTimeout(() => {
        if (currentJobId.value === jobId) {
          pollJobStatus(jobId);
        }
      }, POLL_INTERVAL);
    }
  } catch (err: unknown) {
    console.error("Error polling job status:", err);
    error.value = "Failed to check extraction status";
    status.value = 0;
    isUploading.value = false;
    currentJobId.value = null;
  }
};

const uploadFile = async () => {
  if (!selectedFiles.value) {
    error.value = "Please select a file to upload";

    return;
  }

  const fileArray = Array.isArray(selectedFiles.value)
    ? selectedFiles.value
    : [selectedFiles.value];

  if (fileArray.length === 0) {
    error.value = "Please select a file to upload";

    return;
  }

  const file = fileArray[0] as File | undefined;

  if (!file || !(file instanceof File)) {
    error.value = "No file selected";

    return;
  }

  isUploading.value = true;
  status.value = 0;
  error.value = null;
  apiResponse.value = null;
  currentJobId.value = null;

  try {
    status.value = 1; // Uploading

    // Create FormData with the file
    const formData = new FormData();
    formData.append("file", file);

    // Send to API - now returns immediately with jobId
    const response = await $fetch<{ jobId: string; status: string }>(
      "/api/poster",
      {
        method: "POST",
        body: formData,
      },
    );

    status.value = 2; // Processing
    apiResponse.value = response;
    currentJobId.value = response.jobId;

    // Start polling for job completion
    pollJobStatus(response.jobId);
  } catch (err: unknown) {
    const errorObj =
      err &&
      typeof err === "object" &&
      "data" in err &&
      err.data &&
      typeof err.data === "object" &&
      "statusMessage" in err.data
        ? err.data
        : null;

    const message =
      err &&
      typeof err === "object" &&
      "message" in err &&
      typeof err.message === "string"
        ? err.message
        : "Upload failed";

    error.value =
      (errorObj && typeof errorObj.statusMessage === "string"
        ? errorObj.statusMessage
        : null) || message;
    status.value = 0;
    isUploading.value = false;
    currentJobId.value = null;
    console.error("Upload error:", err);
  }
};

// Cleanup on unmount
onUnmounted(() => {
  currentJobId.value = null;
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageHeader
      title="Share a Poster"
      description="Upload your poster and we'll handle the rest"
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Share a Poster', to: '/share/new' },
          ]"
        />
      </template>
    </UPageHeader>

    <div class="lg:col-span-2">
      <UiSpinner :loading="status === 2 || isUploading" overlay>
        <UCard>
          <div class="space-y-6">
            <UFileUpload
              v-model="selectedFiles"
              label="Drop your poster here"
              description="PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX (max. 5MB)"
              class="min-h-48 w-full"
              color="primary"
              highlight
              layout="list"
              accept="application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/vnd.ms-excel,s application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />

            <!-- Upload Progress -->
            <div v-if="isUploading" class="flex flex-col gap-1">
              <UProgress
                v-model="status"
                :max="[
                  'Waiting...',
                  'Uploading...',
                  'Processing (this may take a few minutes)...',
                  'Generating thumbnail...',
                  'Please wait while we redirect you to your poster...',
                ]"
              >
                <template #status>
                  <div class="flex justify-end text-sm font-medium">
                    <span>{{
                      [
                        "Waiting...",
                        "Uploading...",
                        "Processing (this may take a few minutes)...",
                        "Generating thumbnail...",
                        "Processing Complete!",
                      ][status]
                    }}</span>
                  </div>
                </template>
              </UProgress>

              <p v-if="status === 2" class="text-muted text-sm">
                Extracting metadata from your poster. This can take 1-5 minutes
                depending on the file size.
              </p>
            </div>

            <!-- Error Message -->
            <UAlert
              v-if="error"
              color="error"
              variant="soft"
              title="Upload Error"
              :description="error"
            />

            <!-- API Response (for debugging) -->
            <div v-if="apiResponse && !isUploading" class="space-y-2">
              <h3 class="text-lg font-semibold">API Response:</h3>

              <pre
                class="max-h-96 overflow-auto rounded-lg bg-gray-100 p-4 text-sm dark:bg-gray-800"
                >{{ JSON.stringify(apiResponse, null, 2) }}</pre
              >
            </div>
          </div>

          <template #footer>
            <UButton
              :disabled="isUploading"
              class="flex w-full justify-center"
              variant="outline"
              icon="i-heroicons-cloud-arrow-up-solid"
              @click="uploadFile"
            >
              Upload Poster
            </UButton>
          </template>
        </UCard>
      </UiSpinner>
    </div>
  </div>
</template>
