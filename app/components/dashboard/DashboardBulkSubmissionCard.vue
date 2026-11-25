<script setup lang="ts">
import dayjs from "dayjs";
import type { DashboardBulkSubmission } from "#shared/types/dashboardFeed";
import { shareBulkCompletionPath, shareNewBulkPath } from "~/utils/sharePaths";
import {
  dashboardBatchStatus,
  DASHBOARD_BATCH_STATUS_OPTIONS,
} from "~/utils/dashboardBatchStatus";

const props = defineProps<{
  bulk: DashboardBulkSubmission;
  /** Search terms to mark in the name, as on the poster cards. */
  highlight?: string[];
  /**
   * On Published, a finished batch shows its summary and posters in a panel
   * inside the card (the default slot) instead of opening the summary page.
   * This is that panel's id, left out where there is none.
   */
  summaryPanelId?: string;
  summaryExpanded?: boolean;
}>();

const emit = defineEmits<{
  delete: [bulk: DashboardBulkSubmission];
  toggleSummary: [];
}>();

const opensSummaryInPlace = computed(
  () => props.bulk.status === "completed" && !!props.summaryPanelId,
);

const canDeleteBulk = computed(() => {
  if (props.bulk.status === "draft" || props.bulk.status === "failed") {
    return true;
  }

  return props.bulk.status === "processing" && !props.bulk.hasActiveExtraction;
});

// A finished upload can be turned into a collection, once. Where the card
// opens its summary in place, that summary offers it instead.
const collectionMenuItem = computed(() => {
  if (props.bulk.status !== "completed" || opensSummaryInPlace.value) {
    return null;
  }

  const { collection } = props.bulk;

  return collection
    ? {
        label: "View collection",
        description: "Open the collection made from this batch",
        icon: "i-lucide-library-big",
        onSelect: () => navigateTo(`/collections/${collection.id}`),
      }
    : {
        label: "Create collection",
        description: "Start one with this batch's posters",
        icon: "i-lucide-library-big",
        onSelect: () =>
          navigateTo({
            path: "/collections",
            query: { new: "1", fromBatch: props.bulk.id },
          }),
      };
});

const bulkMenuItems = computed(() => [
  ...(collectionMenuItem.value ? [[collectionMenuItem.value]] : []),
  ...(canDeleteBulk.value
    ? [
        [
          {
            label: "Delete draft",
            description: "Remove the upload and its staged files",
            icon: "i-lucide-trash-2",
            color: "error" as const,
            onSelect: () => emit("delete", props.bulk),
          },
        ],
      ]
    : []),
]);

const CARD_TITLE_MAX_LENGTH = 80;

const displayTitle = computed(() => {
  const title = props.bulk.name;

  return title.length > CARD_TITLE_MAX_LENGTH
    ? `${title.slice(0, CARD_TITLE_MAX_LENGTH).trimEnd()}…`
    : title;
});

const previewSeed = computed(() => `bulk-${props.bulk.id}`);

function statusPresentation() {
  if (props.bulk.status === "completed") {
    return {
      label: "Complete",
      color: "success" as const,
      icon: "i-lucide-circle-check",
    };
  }
  if (props.bulk.status === "failed") {
    return {
      label: "Needs attention",
      color: "error" as const,
      icon: "i-lucide-circle-alert",
    };
  }
  if (props.bulk.status === "processing" && props.bulk.hasActiveExtraction) {
    return {
      label: "Extracting metadata",
      color: "info" as const,
      icon: "i-lucide-loader-circle",
    };
  }

  const phase = dashboardBatchStatus(props.bulk);

  return {
    label:
      DASHBOARD_BATCH_STATUS_OPTIONS.find((option) => option.value === phase)
        ?.label ?? "Draft",
    color: "warning" as const,
    icon: "i-lucide-file-pen-line",
  };
}

const status = computed(() => statusPresentation());

const description = computed(() => {
  const count = props.bulk.posterCount ?? 0;
  const staged = count === 1 ? "1 poster staged" : `${count} posters staged`;

  if (props.bulk.status === "completed") {
    return count === 1
      ? "1 poster published on Zenodo"
      : `${count} posters published on Zenodo`;
  }

  return staged;
});

function actionLabel() {
  if (opensSummaryInPlace.value) {
    return props.summaryExpanded
      ? "Hide posters"
      : `Show posters (${props.bulk.posterCount ?? 0})`;
  }
  if (props.bulk.status === "completed") return "View batch summary";
  if (props.bulk.status === "failed") return "Resolve issue";
  if (props.bulk.status === "processing" && props.bulk.hasActiveExtraction) {
    return "View progress";
  }

  return "Continue editing";
}

function continueImport() {
  if (opensSummaryInPlace.value) {
    emit("toggleSummary");

    return;
  }

  if (props.bulk.status === "completed") {
    void navigateTo(shareBulkCompletionPath(props.bulk.id));

    return;
  }

  void navigateTo(shareNewBulkPath({ jobId: props.bulk.id }));
}
</script>

<template>
  <UPageCard
    variant="ghost"
    :ui="{ container: 'min-w-0' }"
    class="group border-default cursor-pointer overflow-hidden rounded-none border-t border-b transition-all duration-300 max-md:h-auto max-md:rounded-xl max-md:border max-md:bg-white max-md:shadow-sm max-md:hover:shadow-md dark:max-md:bg-gray-950"
    @click="continueImport"
  >
    <!-- The container's min-w-0 lets the card hold the batch's posters,
         whose one-line titles would otherwise widen it past a phone's
         screen. -->
    <div
      class="flex h-37.5 gap-8 max-md:h-auto max-md:flex-col max-md:gap-0 md:items-stretch"
    >
      <div
        class="max-md:border-default h-full w-[150px] shrink-0 overflow-hidden max-md:h-44 max-md:w-full max-md:border-b"
      >
        <img
          :src="`https://api.dicebear.com/9.x/shapes/svg?seed=${previewSeed}`"
          :alt="bulk.name"
          class="max-h-[150px] w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 max-md:h-full max-md:max-h-none max-md:p-3"
        />
      </div>

      <div
        class="flex h-full w-full min-w-0 flex-col justify-between py-1 max-md:h-auto max-md:gap-3 max-md:p-4 max-md:py-4"
      >
        <div class="flex flex-col gap-2">
          <!-- The badges, with the batch's "..." menu at the end of the same
               line, as on poster cards. -->
          <div class="flex items-start justify-between gap-2">
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
                Bulk submission
              </UBadge>
            </div>

            <div
              v-if="bulkMenuItems.length"
              class="-my-0.5 shrink-0"
              @click.stop
              @keydown.enter.stop
              @keydown.space.stop
            >
              <UDropdownMenu
                :items="bulkMenuItems"
                :content="{ align: 'end' }"
                :ui="{ itemLeadingIcon: 'self-center' }"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-ellipsis-vertical"
                  size="xs"
                  aria-label="More bulk import actions"
                />
              </UDropdownMenu>
            </div>
          </div>

          <h3
            class="line-clamp-2 max-h-14 overflow-hidden text-lg font-semibold break-words"
            :title="bulk.name"
          >
            <SearchHighlight
              :text="displayTitle || 'Untitled bulk submission'"
              :term="highlight"
            />
          </h3>

          <div class="flex flex-col gap-1">
            <p class="text-muted line-clamp-2 text-sm">
              {{ description }}
            </p>
          </div>
        </div>

        <div
          class="border-default flex items-center justify-between border-t pt-2 text-xs max-md:flex-wrap max-md:gap-y-2"
        >
          <div
            class="text-muted flex items-center gap-2 max-md:flex-col max-md:items-start max-md:gap-1"
          >
            <span class="flex items-center gap-1">
              <Icon name="heroicons:calendar-days" class="h-3 w-3" />
              Created {{ dayjs(bulk.createdAt).format("MMMM D, YYYY") }}
            </span>

            <span
              v-if="bulk.status === 'completed' && bulk.completedAt"
              class="border-default flex items-center gap-1 border-l pl-2 max-md:border-l-0 max-md:pl-0"
            >
              <Icon name="i-lucide-circle-check" class="h-3 w-3" />
              Completed {{ dayjs(bulk.completedAt).format("MMMM D, YYYY") }}
            </span>

            <span
              v-else-if="
                dayjs(bulk.updatedAt).isAfter(dayjs(bulk.createdAt), 'day')
              "
              class="border-default flex items-center gap-1 border-l pl-2 max-md:border-l-0 max-md:pl-0"
            >
              <Icon name="i-lucide-pencil-line" class="h-3 w-3" />
              Updated {{ dayjs(bulk.updatedAt).format("MMMM D, YYYY") }}
            </span>
          </div>

          <div class="flex items-center gap-2 max-md:flex-wrap" @click.stop>
            <UButton
              v-if="opensSummaryInPlace"
              :id="`batch-toggle-${bulk.id}`"
              color="primary"
              variant="subtle"
              :label="actionLabel()"
              trailing-icon="i-lucide-chevron-down"
              size="xs"
              :aria-expanded="summaryExpanded"
              :aria-controls="summaryPanelId"
              :ui="{
                trailingIcon: summaryExpanded
                  ? 'rotate-180 transition-transform'
                  : 'transition-transform',
              }"
              @click="continueImport"
            />

            <UButton
              v-else
              color="primary"
              variant="subtle"
              :label="actionLabel()"
              :icon="
                bulk.status === 'processing' && bulk.hasActiveExtraction
                  ? 'i-lucide-activity'
                  : 'line-md:arrow-right'
              "
              trailing
              size="xs"
              @click="continueImport"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- The batch's summary panel, under the card's text. -->
    <slot />
  </UPageCard>
</template>
