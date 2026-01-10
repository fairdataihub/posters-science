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

// Computed property to handle v-model type compatibility

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

  try {
    status.value = 1; // Uploading

    // Create FormData with the file
    const formData = new FormData();
    formData.append("file", file);

    // Send to API
    status.value = 2; // Processing
    const response = await $fetch("/api/poster", {
      method: "POST",
      body: formData,
    });

    status.value = 3; // Generating thumbnail
    apiResponse.value = response;
    status.value = 4; // Complete

    if (response.posterId) {
      navigateTo(`/share/${response.posterId}`);
    }
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
    console.error("Upload error:", err);
  } finally {
    isUploading.value = false;
  }
};
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
                  'Processing...',
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
                        "Processing...",
                        "Generating thumbnail...",
                        "Processing Complete!",
                      ][status]
                    }}</span>
                  </div>
                </template>
              </UProgress>
            </div>

            <!-- Error Message -->
            <UAlert
              v-if="error"
              color="error"
              variant="soft"
              title="Upload Error"
              :description="error"
            />

            <!-- API Response -->
            <div v-if="apiResponse" class="space-y-2">
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
