<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { faker } from "@faker-js/faker";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const toast = useToast();

const { id } = route.params as { id: string };

useSeoMeta({
  title: "Review poster metadata",
  description: "Review the metadata for your poster submission",
});

const loading = ref(false);

const schema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

type Schema = z.output<typeof schema>;

const state = reactive<Schema>({
  title: faker.lorem.sentence(),
  description: faker.lorem.paragraph(),
});

const { data, error } = await useFetch(`/api/poster/${id}`);

if (data.value) {
  state.title = data.value.title;
  state.description = data.value.description;
}

if (error.value) {
  console.error(error.value);
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true;

  setTimeout(() => {
    loading.value = false;

    toast.add({
      title: "Success",
      description: "The form has been submitted.",
      color: "success",
    });

    console.log(event.data);
  }, 1000);
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-6">
    <UPageHeader
      title="Edit Poster Metadata"
      description="Review and edit the extracted metadata for your poster submission"
    >
      <template #headline>
        <UBreadcrumb
          :items="[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Share a Poster', to: '/share/new' },
            { label: 'Edit Poster Metadata' },
          ]"
        />
      </template>
    </UPageHeader>

    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4"
      :disabled="loading"
      @submit="onSubmit"
    >
      <CardCollapsibleContent title="General Information" :collapse="false">
        <div class="space-y-4">
          <UFormField label="Title" name="title" size="lg">
            <UInput v-model="state.title" size="lg" />
          </UFormField>

          <UFormField label="Description" name="description" size="lg">
            <UTextarea v-model="state.description" class="w-full" size="lg" />
          </UFormField>
        </div>
      </CardCollapsibleContent>

      <CardCollapsibleContent title="Author(s)" :collapse="false">
        TBD
      </CardCollapsibleContent>

      <UButton
        :disabled="loading"
        class="flex w-full justify-center"
        variant="solid"
        icon="i-lucide-arrow-right"
        label="Continue"
        type="submit"
        size="lg"
      />
    </UForm>
  </div>
</template>
