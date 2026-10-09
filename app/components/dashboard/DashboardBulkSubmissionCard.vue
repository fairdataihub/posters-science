<script setup lang="ts">
import dayjs from "dayjs";
import { bulkExtractionLevelLabel } from "#shared/types/bulkExtractionLevel";
import type { DashboardBulkSubmission } from "#shared/types/dashboardFeed";
import { shareNewBulkPath } from "~/utils/sharePaths";

const props = defineProps<{
  bulk: DashboardBulkSubmission;
}>();

const CARD_TITLE_MAX_LENGTH = 80;

const displayTitle = computed(() => {
  const title = props.bulk.name;
  return title.length > CARD_TITLE_MAX_LENGTH
    ? `${title.slice(0, CARD_TITLE_MAX_LENGTH).trimEnd()}…`
    : title;
});

const previewSeed = computed(() => `bulk-${props.bulk.id}`);

function statusPresentation() {
  if (props.bulk.status === "failed") {
    return {
      label: "Needs attention",
      color: "error" as const,
      icon: "i-lucide-circle-alert",
    };
  }
  if (props.bulk.status === "processing") {
    return {
      label: "Extracting metadata",
      color: "info" as const,
      icon: "i-lucide-loader-circle",
    };
  }

  return {
    label: "Draft",
    color: "warning" as const,
    icon: "i-lucide-file-pen-line",
  };
}

const status = computed(() => statusPresentation());

const description = computed(() => {
  const count = props.bulk.posterCount ?? 0;
  const staged =
    count === 1 ? "1 file staged" : `${count} files staged`;

  const extraction = bulkExtractionLevelLabel(props.bulk.extractionMethod);
  if (extraction) {
    return `${staged} · ${extraction}`;
  }

  return staged;
});

function actionLabel() {
  if (props.bulk.status === "failed") return "Resolve issue";
  if (props.bulk.status === "processing") return "View progress";

  return "Continue editing";
}

function continueImport() {
  void navigateTo(shareNewBulkPath({ jobId: props.bulk.id }));
}
</script>

<template>
  <UPageCard
    variant="ghost"
    class="group h-50 cursor-pointer overflow-hidden rounded-none border-t border-b border-gray-100 transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm max-md:hover:shadow-md dark:max-md:border-gray-800 dark:max-md:bg-gray-950"
    @click="continueImport"
  >
    <div
      class="flex h-full gap-8 max-md:h-auto max-md:flex-col max-md:gap-0 md:items-stretch"
    >
      <div
        class="h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b max-md:border-gray-100 dark:max-md:border-gray-800"
      >
        <img
          :src="`https://api.dicebear.com/9.x/shapes/svg?seed=${previewSeed}`"
          :alt="bulk.name"
          class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 max-md:h-full max-md:max-h-none max-md:p-3 group-hover:scale-105"
        />
      </div>

      <div
        class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
      >
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :color="status.color"
              variant="solid"
              size="sm"
              :icon="status.icon"
            >
              {{ status.label }}
            </UBadge>

            <UBadge color="neutral" variant="soft" size="sm">
              Bulk import
            </UBadge>
          </div>

          <h3
            class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
            :title="bulk.name"
          >
            {{ displayTitle || "Untitled bulk import" }}
          </h3>

          <div class="flex flex-col gap-1">
            <p class="text-muted line-clamp-2 text-sm">
              {{ description }}
            </p>
          </div>
        </div>

        <div
          class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs max-md:flex-wrap max-md:gap-y-2 dark:border-gray-800"
        >
          <div
            class="text-muted flex items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1"
          >
            <span class="flex items-center gap-1">
              <Icon name="heroicons:calendar-days" class="h-3 w-3" />
              Created {{ dayjs(bulk.createdAt).format("MMMM D, YYYY") }}
            </span>

            <span
              v-if="
                dayjs(bulk.updatedAt).isAfter(dayjs(bulk.createdAt), 'day')
              "
              class="flex items-center gap-1 border-l border-gray-100 pl-2 max-md:border-l-0 max-md:pl-0 dark:border-gray-800"
            >
              <Icon name="i-lucide-pencil-line" class="h-3 w-3" />
              Updated {{ dayjs(bulk.updatedAt).format("MMMM D, YYYY") }}
            </span>
          </div>

          <div class="flex items-center gap-2 max-md:flex-wrap" @click.stop>
            <UButton
              color="primary"
              variant="subtle"
              :label="actionLabel()"
              :icon="
                bulk.status === 'processing'
                  ? 'i-lucide-activity'
                  : 'i-lucide-arrow-right'
              "
              trailing
              size="xs"
              @click="continueImport"
            />
          </div>
        </div>
      </div>
    </div>
  </UPageCard>
</template>
