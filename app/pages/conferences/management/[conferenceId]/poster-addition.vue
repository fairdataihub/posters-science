<script setup lang="ts">
import type { ManagedConference } from "#shared/types/managedConference";
import ConferenceBulkImport from "~/components/conferences/ConferenceBulkImport.vue";
import { conferenceManagementDetailPath } from "~/utils/conferenceManagementPaths";

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const conferenceId = computed(() => route.params.conferenceId as string);

const {
  data: conference,
  error: conferenceError,
  status: conferenceStatus,
} = await useFetch<ManagedConference>(
  () => `/api/conferences/management/${conferenceId.value}`,
  { watch: [conferenceId] },
);

if (conferenceError.value) {
  throw createError({
    statusCode: conferenceError.value.statusCode ?? 404,
    statusMessage:
      conferenceError.value.statusMessage ?? "Conference not found",
  });
}

if (conference.value && conference.value.status !== "approved") {
  await navigateTo(conferenceManagementDetailPath(conferenceId.value), {
    replace: true,
  });
}

const reg = computed(() => conference.value);

useSeoMeta({
  title: () =>
    reg.value
      ? `Bulk poster import — ${reg.value.acronym}`
      : "Bulk poster import",
  description: () =>
    reg.value
      ? `Import posters for ${reg.value.name} on Posters.science.`
      : "Import posters for your conference on Posters.science.",
});
</script>

<template>
  <div
    v-if="conferenceStatus === 'pending'"
    class="text-muted mx-auto max-w-screen-xl px-6 py-12 text-center text-sm"
  >
    Loading…
  </div>

  <div
    v-else-if="reg && reg.status === 'approved'"
    class="mx-auto flex w-full max-w-screen-xl flex-col gap-8 px-6 pb-12"
  >
    <UPageHeader
      :title="`Bulk add posters — ${reg.acronym}`"
      :description="`${reg.name} · ${reg.location} · ${reg.dateRange}`"
      :links="[
        {
          label: 'Back to conference',
          to: conferenceManagementDetailPath(reg.id),
          icon: 'i-lucide-arrow-left',
          color: 'neutral' as const,
          variant: 'ghost' as const,
        },
      ]"
    />

    <ConferenceBulkImport :conference-acronym="reg.acronym" />
  </div>
</template>
