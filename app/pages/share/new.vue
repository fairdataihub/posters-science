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
const selectedFiles = ref<File[]>([]);
const apiResponse = ref<unknown>(null);
const error = ref<string | null>(null);
const currentJobId = ref<string | null>(null);

// Poll interval in milliseconds
const POLL_INTERVAL = 3000;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE_LABEL = "10MB";

interface JobStatusResponse {
  jobId: string;
  status: "pending-extraction" | "processing" | "completed" | "failed";
  completed: boolean;
  posterId: number;
  error: string | null;
}

const pollJobStatus = async (jobId: string): Promise<void> => {
  try {
    const response = await $fetch<JobStatusResponse>(
      `/api/poster/job/${jobId}`,
    );

    console.log("[pollJobStatus] response:", response);

    if (
      response.completed &&
      response.status === "completed" &&
      response.posterId
    ) {
      status.value = 4; // Complete
      window.umami?.track("upload_completed", { posterId: response.posterId });
      navigateTo(`/share/${response.posterId}`);

      return;
    }

    if (response.status === "failed") {
      error.value = response.error || "Extraction failed";
      window.umami?.track("upload_failed");
      apiResponse.value = response; // Update to show failed status
      status.value = 0;
      isUploading.value = false;
      currentJobId.value = null;

      return;
    }

    // Update status and apiResponse based on job status
    apiResponse.value = response;
    if (response.status === "processing") {
      status.value = 2; // Processing
    }

    // Continue polling if still pending or processing
    if (
      response.status === "pending-extraction" ||
      response.status === "processing"
    ) {
      setTimeout(() => {
        pollJobStatus(jobId);
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
  if (!selectedFiles.value.length) {
    error.value = "Please select a file to upload";

    return;
  }

  const file = selectedFiles.value[0]!;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    error.value = `File is too large. Maximum size is ${MAX_FILE_SIZE_LABEL}.`;

    return;
  }

  isUploading.value = true;
  status.value = 0;
  error.value = null;
  apiResponse.value = null;
  currentJobId.value = null;

  try {
    status.value = 1; // Uploading
    window.umami?.track("upload_started");

    // 1. Upload file to Bunny first
    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await $fetch("/api/upload/bunny", {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.posterId) {
      error.value =
        "Upload failed. Please try again. If the problem persists, please contact support.";
      status.value = 0;
      isUploading.value = false;

      return;
    }

    // Start polling for job completion
    if (uploadResponse.extractionJobId) {
      pollJobStatus(uploadResponse.extractionJobId);
    } else {
      error.value =
        "Upload failed. Please try again. If the problem persists, please contact support.";
      status.value = 0;
      isUploading.value = false;
    }
  } catch (err: unknown) {
    // TODO: Fix this error handling to be more simple
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
      title="Upload Poster"
      description="Upload the PDF or image file of your poster. (Max size: 10MB)"
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Upload Poster', to: '/share/new' },
          ]"
        />
      </template>
    </UPageHeader>

    <div class="lg:col-span-2">
      <UiSpinner :loading="status === 2 || isUploading" overlay>
        <UCard>
          <div class="space-y-6">
            <UiFileUpload @on-change="selectedFiles = $event">
              <UiFileUploadGrid />
            </UiFileUpload>

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
