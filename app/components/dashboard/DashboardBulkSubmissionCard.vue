<script setup lang="ts">
import dayjs from "dayjs";
import {
  BULK_IMPORT_WIZARD_STEPS,
  normalizeBulkImportWizardStep,
} from "#shared/types/bulkImportWizard";
import type { DashboardBulkSubmission } from "#shared/types/dashboardFeed";
import { shareNewBulkPath } from "~/utils/sharePaths";

const props = defineProps<{
  bulk: DashboardBulkSubmission;
}>();

const stepLabel = computed(() => {
  const step = normalizeBulkImportWizardStep(props.bulk.wizardStep);
  return (
    BULK_IMPORT_WIZARD_STEPS.find((item) => item.id === step)?.label ??
    "Bulk import"
  );
});

const statusPresentation = computed(() => {
  switch (props.bulk.status) {
    case "processing":
      return {
        label: "Processing",
        color: "info" as const,
        icon: "i-lucide-loader-circle",
      };
    case "failed":
      return {
        label: "Needs attention",
        color: "error" as const,
        icon: "i-lucide-alert-circle",
      };
    default:
      return {
        label: "Bulk import",
        color: "primary" as const,
        icon: "i-lucide-layers",
      };
  }
});

const summaryLine = computed(() => {
  const count = props.bulk.posterCount ?? 0;
  const posters =
    count === 1 ? "1 poster file" : `${count} poster files`;
  return `${posters} · ${stepLabel.value}`;
});

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
      class="flex h-full flex-row max-md:flex-col max-md:gap-0 md:items-stretch"
    >
      <div
        class="bg-muted/30 flex w-48 shrink-0 items-center justify-center max-md:w-full max-md:py-8"
      >
        <Icon
          name="i-lucide-files"
          class="text-primary size-16 opacity-80"
        />
      </div>

      <div
        class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
      >
        <div class="flex flex-col gap-2">
          <UBadge
            :color="statusPresentation.color"
            variant="solid"
            size="sm"
            :icon="statusPresentation.icon"
          >
            {{ statusPresentation.label }}
          </UBadge>

          <h3
            class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
            :title="bulk.name"
          >
            {{ bulk.name }}
          </h3>

          <p class="text-muted line-clamp-2 text-sm">
            {{ summaryLine }}
          </p>
        </div>

        <div
          class="flex items-center justify-between border-t border-gray-100 pt-2 text-xs max-md:flex-wrap max-md:gap-y-2 dark:border-gray-800"
        >
          <span class="text-muted flex items-center gap-1">
            <Icon name="heroicons:calendar-days" class="h-3 w-3" />
            Updated {{ dayjs(bulk.updatedAt).format("MMMM D, YYYY") }}
          </span>

          <UButton
            color="primary"
            variant="subtle"
            label="Continue"
            icon="i-lucide-arrow-right"
            trailing
            size="xs"
            @click.stop="continueImport"
          />
        </div>
      </div>
    </div>
  </UPageCard>
</template>
