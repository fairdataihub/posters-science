<script setup lang="ts">
import { faker } from "@faker-js/faker";

definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Share a Poster",
  description: "Upload and share your poster with the community",
});

const status = ref(0);
const isUploading = ref(false);

const uploadFile = async () => {
  isUploading.value = true;
  status.value = 0;

  // create entry in database and fill with dummy data
  const id = faker.number.int();
  const title = faker.lorem.sentence();
  const description = faker.lorem.paragraph();
  const poster = await $fetch("/api/poster", {
    method: "POST",
    body: {
      title,
      description,
    },
  });

  console.log("Created poster:", poster);

  setTimeout(() => {
    status.value = 1;
  }, 1000);

  setTimeout(() => {
    status.value = 2;
  }, 2000);

  setTimeout(() => {
    status.value = 3;
  }, 4000);

  setTimeout(() => {
    status.value = 4;
  }, 5000);

  setTimeout(() => {
    navigateTo(`/share/${id}`);
  }, 6000);
};
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageHeader title="Share a Poster" description="Upload your poster and we'll handle the rest">
      <template #headline>
        <UBreadcrumb :items="[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Share a Poster', to: '/share/new' },
        ]" />
      </template>
    </UPageHeader>

    <div class="lg:col-span-2">
      <UCard>
        <div class="space-y-6">
          <UFileUpload label="Drop your poster here" description="PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX (max. 5MB)"
            class="min-h-48 w-full" color="primary" highlight layout="list"
            accept="application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-powerpoint, application/vnd.openxmlformats-officedocument.presentationml.presentation, application/vnd.ms-excel,s application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />

          <!-- Upload Progress -->
          <div v-if="isUploading" class="flex flex-col gap-1">
            <UProgress v-model="status" :max="[
              'Waiting...',
              'Uploading...',
              'Processing...',
              'Generating thumbnail...',
              'Please wait while we redirect you to your poster...',
            ]">
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
        </div>

        <template #footer>
          <UButton :disabled="isUploading" class="flex w-full justify-center" variant="outline"
            icon="i-heroicons-cloud-arrow-up-solid" @click="uploadFile">
            Upload Poster
          </UButton>
        </template>
      </UCard>
    </div>
  </div>
</template>
