<script setup lang="ts">
import type { BulkImportBatchItem } from "#shared/types/conferenceBulkImport";
import type { PosterResponse } from "@/utils/poster_schema";
import { publishPosterViaZenodoStream } from "~/utils/zenodoPublishStream";
import {
  zenodoPublicationDoiForPoster,
  zenodoPublicationUrlForPoster,
} from "~/utils/zenodoPublicationUrl";
import ZenodoAccountStatus, {
  type ZenodoAccountDisplay,
} from "~/components/share/ZenodoAccountStatus.vue";

const props = defineProps<{
  items: BulkImportBatchItem[];
  bulkJobId: string | null;
  uniformLicense: string;
}>();

const toast = useToast();
const route = useRoute();

const ZENODO_DISABLED = false;

type Repository =
  | "zenodo"
  | "zenodo-simulated"
  | "figshare"
  | "download"
  | null;

const queryRepo = route.query.repository;
const requestedRepository: Repository =
  queryRepo === "zenodo" ||
  queryRepo === "zenodo-simulated" ||
  queryRepo === "figshare" ||
  queryRepo === "download"
    ? queryRepo
    : null;

const selectedRepository = ref<Repository>(
  requestedRepository === "zenodo" && ZENODO_DISABLED
    ? null
    : requestedRepository,
);

const repositories = [
  {
    id: "zenodo" as const,
    name: "Zenodo",
    icon: "i-simple-icons-zenodo",
    description: "General-purpose open repository",
    enabled: !ZENODO_DISABLED,
    unavailable: ZENODO_DISABLED,
  },
  {
    id: "zenodo-simulated" as const,
    name: "Zenodo (Simulated)",
    icon: "i-simple-icons-zenodo",
    description: "Preview-only flow for beta testing",
    enabled: true,
    hidden: true,
  },
  {
    id: "figshare" as const,
    name: "Figshare",
    icon: "i-simple-icons-figshare",
    description: "Research data repository",
    enabled: false,
  },
  {
    id: "download" as const,
    name: "Download Locally",
    icon: "i-lucide-download",
    description: "Download files to your computer to share on another platform",
    enabled: true,
  },
];

const visibleRepositories = computed(() =>
  repositories.filter((repo) => !repo.hidden),
);

function selectRepository(repo: (typeof repositories)[number]) {
  if (!repo.enabled) return;
  selectedRepository.value = repo.id;
}

const batchDownloadAcknowledged = ref(false);
const batchDownloadingAll = ref(false);
const rowDownloadingIds = ref<Set<string>>(new Set());

function isRowDownloading(row: PublishRow) {
  return rowDownloadingIds.value.has(row.item.id);
}

async function downloadPosterPackage(posterId: number) {
  const response = await fetch(`/api/poster/${posterId}/download`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed (${response.status})`;
    try {
      const json = JSON.parse(text) as {
        message?: string;
        statusMessage?: string;
      };
      message = json.statusMessage ?? json.message ?? message;
    } catch {
      if (text) message = text.slice(0, 120);
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1] ?? `poster-${posterId}.zip`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadRow(row: PublishRow) {
  const posterId = row.item.posterId;
  if (posterId == null) return;

  const next = new Set(rowDownloadingIds.value);
  next.add(row.item.id);
  rowDownloadingIds.value = next;

  try {
    await downloadPosterPackage(posterId);
    toast.add({
      title: "Download started",
      description: row.title,
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Download failed",
      description:
        error instanceof Error ? error.message : "Could not download files.",
      color: "error",
    });
  } finally {
    const done = new Set(rowDownloadingIds.value);
    done.delete(row.item.id);
    rowDownloadingIds.value = done;
  }
}

async function downloadBulkZip() {
  if (!props.bulkJobId) {
    throw new Error("Bulk import job is not available.");
  }

  const response = await fetch(
    `/api/bulk-poster-submissions/${props.bulkJobId}/download`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed (${response.status})`;
    try {
      const json = JSON.parse(text) as {
        message?: string;
        statusMessage?: string;
      };
      message = json.statusMessage ?? json.message ?? message;
    } catch {
      if (text) message = text.slice(0, 120);
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1] ?? "bulk-import-posters.zip";

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadAllLocally() {
  if (batchDownloadingAll.value) return;

  batchDownloadingAll.value = true;

  try {
    await downloadBulkZip();
    toast.add({
      title: "Download started",
      description:
        "Your batch is in one ZIP file with a folder per poster (poster.json + PDF).",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Download failed",
      description:
        error instanceof Error
          ? error.message
          : "Could not download poster packages.",
      color: "error",
    });
  } finally {
    batchDownloadingAll.value = false;
  }
}

const actionColumnLabel = computed(() => {
  if (selectedRepository.value === "download") return "Download";
  if (selectedRepository.value === "zenodo") return "Zenodo";
  return "Action";
});

type RowPublishStatus =
  | "ready"
  | "publishing"
  | "published"
  | "failed"
  | "skipped";

type PosterWithZenodo = PosterResponse & {
  zenodoDepositions?: {
    depositionId?: number;
    status?: string;
    lastPublishedZenodoDoi?: string | null;
  } | null;
};

type PublishRow = {
  item: BulkImportBatchItem;
  title: string;
  status: RowPublishStatus;
  error?: string;
  recordUrl?: string;
  doi?: string;
};

const completedItems = computed(() =>
  props.items.filter(
    (item) => item.posterId != null && item.status === "completed",
  ),
);

const rows = ref<PublishRow[]>([]);
const batchPublishing = ref(false);
const batchStoppedEarly = ref(false);

const zenodoLoginUrl = ref("");
const zenodoTokenExists = ref(false);
const zenodoLoading = ref(true);
const zenodoConfigError = ref(false);
const zenodoAccount = ref<ZenodoAccountDisplay | null>(null);
const zenodoDisconnecting = ref(false);

const zenodoContextPosterId = computed(() => {
  const first = completedItems.value[0]?.posterId;
  return first != null ? String(first) : null;
});

const licenseForPublish = computed(() => props.uniformLicense.trim());

const publishedCount = computed(
  () => rows.value.filter((row) => row.status === "published").length,
);
const failedCount = computed(
  () => rows.value.filter((row) => row.status === "failed").length,
);
const allPublished = computed(
  () =>
    rows.value.length > 0 &&
    rows.value.every(
      (row) => row.status === "published" || row.status === "skipped",
    ),
);

function rowIsOnZenodo(row: PublishRow) {
  return Boolean(row.recordUrl);
}

function canPublishRow(row: PublishRow) {
  return (
    !rowIsOnZenodo(row) &&
    row.status !== "publishing" &&
    !batchPublishing.value &&
    zenodoTokenExists.value &&
    Boolean(licenseForPublish.value)
  );
}

async function publishSingle(row: PublishRow) {
  if (!licenseForPublish.value) {
    toast.add({
      title: "License required",
      description:
        "Go back to the license step and choose a license for this batch.",
      color: "warning",
    });
    return;
  }

  if (!zenodoTokenExists.value) {
    toast.add({
      title: "Sign in to Zenodo",
      description: "Connect your Zenodo account before publishing.",
      color: "warning",
    });
    return;
  }

  await publishRow(row);
}

watch(
  completedItems,
  (items) => {
    rows.value = items.map((item) => ({
      item,
      title: item.fileName.replace(/\.[^.]+$/, "") || item.fileName,
      status: "ready",
    }));
    for (const row of rows.value) {
      const posterId = row.item.posterId;
      if (posterId == null) continue;
      void hydrateRowTitleAndStatus(row, posterId);
    }
  },
  { immediate: true },
);

function patchRow(itemId: string, patch: Partial<PublishRow>) {
  rows.value = rows.value.map((row) =>
    row.item.id === itemId ? { ...row, ...patch } : row,
  );
}

async function hydrateRowTitleAndStatus(row: PublishRow, posterId: number) {
  try {
    const poster = await $fetch<PosterWithZenodo>(`/api/poster/${posterId}`);
    const metaTitle = poster.posterMetadata?.titles?.[0] as
      | { title?: string }
      | undefined;
    const title =
      metaTitle?.title?.trim() ||
      poster.title?.trim() ||
      row.title;
    const recordUrl = zenodoPublicationUrlForPoster(poster);
    const doi = zenodoPublicationDoiForPoster(poster);
    const alreadyOnZenodo =
      poster.status === "published" && Boolean(recordUrl);

    patchRow(row.item.id, {
      title,
      ...(recordUrl && { recordUrl }),
      ...(doi && { doi }),
      status: alreadyOnZenodo ? "skipped" : row.status,
    });
  } catch {
    // Keep file-based title and ready status.
  }
}

const {
  data: zenodoData,
  pending: zenodoPending,
  error: zenodoFetchError,
  refresh: refreshZenodoStatus,
} = useFetch("/api/release/zenodo", {
  headers: useRequestHeaders(["cookie"]),
  method: "GET",
  params: computed(() => {
    const posterId = zenodoContextPosterId.value;
    if (!posterId) return undefined;
    const query: Record<string, string> = { posterId };
    if (props.bulkJobId) {
      query.bulkJobId = props.bulkJobId;
    }
    return query;
  }),
  server: false,
});

watch(
  [zenodoData, zenodoPending, zenodoFetchError, zenodoContextPosterId],
  ([data, pending, error, posterId]) => {
    if (!posterId) {
      zenodoLoading.value = false;
      return;
    }
    if (pending) return;
    if (error) {
      zenodoConfigError.value = true;
      zenodoLoading.value = false;
      return;
    }
    zenodoLoginUrl.value = data?.zenodoLoginURL ?? "";
    zenodoTokenExists.value = data?.zenodoToken ?? false;
    zenodoConfigError.value = !data?.zenodoLoginURL;
    zenodoAccount.value = data?.zenodoAccount ?? null;
    zenodoLoading.value = false;
  },
  { immediate: true },
);

function handleZenodoSignIn() {
  if (!zenodoLoginUrl.value) return;
  window.location.href = zenodoLoginUrl.value;
}

async function handleZenodoDisconnect() {
  zenodoDisconnecting.value = true;
  try {
    await $fetch("/api/zenodo/disconnect", { method: "POST" });
    zenodoTokenExists.value = false;
    zenodoAccount.value = null;
    toast.add({
      title: "Signed out of Zenodo",
      description: "Sign in again when you are ready to publish.",
      color: "neutral",
    });
    await refreshZenodoStatus();
  } catch (error) {
    toast.add({
      title: "Could not sign out of Zenodo",
      description: error instanceof Error ? error.message : "Try again.",
      color: "error",
    });
  } finally {
    zenodoDisconnecting.value = false;
  }
}

async function resolvePublicationVersion(
  posterId: number,
): Promise<string | undefined> {
  try {
    const poster = await $fetch<PosterResponse>(`/api/poster/${posterId}`);
    if (poster.automated) return undefined;
    const version = poster.posterMetadata?.version?.trim();
    return version || undefined;
  } catch {
    return undefined;
  }
}

async function publishRow(row: PublishRow) {
  const posterId = row.item.posterId;
  if (posterId == null) return;

  const itemId = row.item.id;
  patchRow(itemId, {
    status: "publishing",
    error: undefined,
    recordUrl: undefined,
  });

  const version = await resolvePublicationVersion(posterId);
  const result = await publishPosterViaZenodoStream({
    posterId: String(posterId),
    mode: "new",
    license: licenseForPublish.value || undefined,
    version,
  });

  if (result.success) {
    let recordUrl = result.recordUrl;
    let doi: string | undefined;
    if (!recordUrl) {
      try {
        const poster = await $fetch<PosterWithZenodo>(`/api/poster/${posterId}`);
        recordUrl = zenodoPublicationUrlForPoster(poster);
        doi = zenodoPublicationDoiForPoster(poster);
      } catch {
        // Link may appear after a refresh.
      }
    } else if (result.recordUrl?.includes("doi.org")) {
      doi = result.recordUrl.replace(/^https?:\/\/doi\.org\//i, "");
    }

    patchRow(itemId, {
      status: "published",
      ...(recordUrl && { recordUrl }),
      ...(doi && { doi }),
      error: undefined,
    });
    return;
  }

  patchRow(itemId, {
    status: "failed",
    error: result.error ?? "Could not publish to Zenodo",
  });
}

async function publishAllToZenodo() {
  if (batchPublishing.value || completedItems.value.length === 0) return;

  if (!licenseForPublish.value) {
    toast.add({
      title: "License required",
      description:
        "Go back to the license step and choose a license for this batch.",
      color: "warning",
    });
    return;
  }

  if (!zenodoTokenExists.value) {
    toast.add({
      title: "Sign in to Zenodo",
      description: "Connect your Zenodo account before publishing.",
      color: "warning",
    });
    return;
  }

  batchPublishing.value = true;
  batchStoppedEarly.value = false;

  for (const row of rows.value) {
    if (row.status === "published" || row.status === "skipped") continue;

    await publishRow(row);
    const current = rows.value.find((entry) => entry.item.id === row.item.id);
    if (current?.status === "failed") {
      batchStoppedEarly.value = true;
      break;
    }
  }

  batchPublishing.value = false;

  if (allPublished.value) {
    toast.add({
      title: "Batch published",
      description: `All posters in this batch are on Zenodo.`,
      color: "success",
    });
  } else if (publishedCount.value > 0) {
    toast.add({
      title: "Partially published",
      description: `${publishedCount.value} published, ${failedCount.value} failed. Fix issues and run again for the rest.`,
      color: "warning",
    });
  }
}

const returnedFromZenodoOAuth = computed(
  () => route.query.repository === "zenodo",
);

watch(
  returnedFromZenodoOAuth,
  (fromZenodo) => {
    if (fromZenodo) {
      selectedRepository.value = "zenodo";
      if (zenodoTokenExists.value && !batchPublishing.value) {
        toast.add({
          title: "Zenodo connected",
          description: "You can publish all posters in this batch.",
          color: "success",
        });
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-6">
    <div
      v-if="completedItems.length === 0"
      class="text-muted rounded-lg border border-dashed px-4 py-8 text-center text-sm"
    >
      No completed extractions yet. Finish extraction and review metadata before
      submitting to a repository.
    </div>

    <template v-else>
      <UAlert
        v-if="!licenseForPublish"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Batch license missing"
        description="Return to the license step and set a license. It will be applied when publishing each poster."
      />

      <div class="border-default rounded-xl border p-6">
        <h3 class="mb-2 text-lg font-semibold">Select a Repository</h3>

        <p class="text-muted mb-6 text-sm">
          Choose where you would like to archive your posters. Click one of the
          following options:
        </p>

        <UAlert
          v-if="ZENODO_DISABLED"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          class="mb-6"
          title="Zenodo submissions are temporarily unavailable"
          description="We are currently experiencing issues with the Zenodo publishing workflow and are actively working on a fix. Submitting to Zenodo is paused for now, so please check back later. In the meantime, you can download your poster files and metadata to archive them elsewhere."
        />

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UButton
            v-for="repo in visibleRepositories"
            :key="repo.id"
            :disabled="!repo.enabled"
            class="border-default hover:border-primary flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all"
            :class="[
              selectedRepository === repo.id ? 'border-primary bg-primary/5' : '',
              !repo.enabled && 'cursor-not-allowed opacity-50',
            ]"
            color="primary"
            variant="outline"
            @click="selectRepository(repo)"
          >
            <UIcon :name="repo.icon" class="size-12" />

            <span class="font-medium">{{ repo.name }}</span>

            <span class="text-muted text-center text-xs">{{ repo.description }}</span>

            <UBadge v-if="repo.unavailable" color="warning" variant="subtle">
              Temporarily Unavailable
            </UBadge>

            <UBadge v-else-if="!repo.enabled" color="neutral" variant="subtle">
              Coming Soon
            </UBadge>
          </UButton>
        </div>
      </div>

      <div
        v-if="selectedRepository === 'zenodo'"
        class="border-default rounded-xl border p-6"
      >
        <div class="mb-4 flex items-center gap-2">
          <UIcon name="i-simple-icons-zenodo" class="size-6" />
          <h3 class="text-lg font-semibold">Archive to Zenodo</h3>
        </div>

        <p class="mb-5 text-sm">
          <ULink
            to="https://zenodo.org"
            target="_blank"
            class="text-primary underline"
            >Zenodo</ULink
          >
          is a free general-purpose repository. Each poster in this batch is
          published as its own record using your batch license ({{
            licenseForPublish || "not set"
          }}). Posters are processed one at a time.
        </p>

        <UiSpinner v-if="zenodoLoading" class="py-8" />

        <template v-else-if="!zenodoTokenExists">
          <p class="mb-4 text-sm">
            If you don't have a Zenodo account already, please create one first
            at
            <ULink
              to="https://zenodo.org"
              target="_blank"
              class="text-primary underline"
            >
              zenodo.org</ULink
            >
            before continuing.
          </p>

          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            class="mb-4"
            title="Zenodo sign-in may require more than one attempt"
            description="There is a known issue where Zenodo authentication can occasionally fail on the first try. We are currently working with the Zenodo team to resolve this. If you are redirected to an error page, use your browser's Back button to return to the Zenodo authorization page and approve access again. It typically resolves after one or two attempts."
          />

          <div class="flex flex-wrap items-center justify-between gap-4">
            <p class="text-muted text-sm">
              Ready to archive on Zenodo? Sign in to get started.
            </p>

            <UButton
              color="primary"
              size="lg"
              :disabled="!zenodoLoginUrl || zenodoConfigError"
              @click="handleZenodoSignIn"
            >
              Sign in to Zenodo
            </UButton>
          </div>
        </template>

        <template v-else>
          <ZenodoAccountStatus
            class="mb-4"
            :account="zenodoAccount"
            :disconnecting="zenodoDisconnecting"
            @disconnect="handleZenodoDisconnect"
          />

          <div class="flex flex-wrap items-center gap-3">
            <UButton
              color="primary"
              size="lg"
              icon="i-lucide-upload-cloud"
              label="Publish all to Zenodo"
              :loading="batchPublishing"
              :disabled="!licenseForPublish || allPublished"
              @click="publishAllToZenodo"
            />
            <span v-if="allPublished" class="text-success text-sm font-medium">
              All posters in this batch are published.
            </span>
          </div>
        </template>
      </div>

      <div
        v-if="selectedRepository === 'download'"
        class="border-default flex flex-col gap-6 rounded-xl border p-6"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-download" class="size-6" />
          <h3 class="text-lg font-semibold">Download Files</h3>
        </div>

        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          title="Heads up: poster.json will be incomplete"
          description="Each downloaded poster.json may have blank identifier, license, and publisher fields until you publish or update metadata on Posters.science."
        />

        <UCheckbox
          v-model="batchDownloadAcknowledged"
          label="I understand that my poster.json files may be incomplete"
        />

        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-download"
          :loading="batchDownloadingAll"
          :disabled="!batchDownloadAcknowledged"
          @click="downloadAllLocally"
        >
          Download all as one ZIP
        </UButton>
      </div>

      <div class="border-default overflow-hidden rounded-xl border">
        <table class="w-full text-left text-sm">
          <thead class="border-default border-b bg-gray-50/80 dark:bg-gray-900/40">
            <tr>
              <th class="px-4 py-3 font-medium">Poster</th>
              <th class="px-4 py-3 font-medium">{{ actionColumnLabel }}</th>
            </tr>
          </thead>
          <tbody class="divide-default divide-y">
            <tr v-for="row in rows" :key="row.item.id">
              <td class="px-4 py-3">
                <span class="line-clamp-2 font-medium" :title="row.title">
                  {{ row.title }}
                </span>
                <span class="text-muted block text-xs">{{ row.item.fileName }}</span>
              </td>
              <td class="px-4 py-3">
                <p
                  v-if="!selectedRepository"
                  class="text-muted text-sm"
                >
                  Select a repository above
                </p>

                <template v-else-if="selectedRepository === 'download'">
                  <UButton
                    color="primary"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-download"
                    label="Download"
                    :disabled="!batchDownloadAcknowledged"
                    :loading="isRowDownloading(row)"
                    @click="downloadRow(row)"
                  />
                </template>

                <template v-else-if="selectedRepository === 'zenodo'">
                  <div v-if="rowIsOnZenodo(row)" class="flex flex-col gap-1">
                    <UButton
                      color="primary"
                      variant="soft"
                      size="sm"
                      icon="i-lucide-external-link"
                      label="View on Zenodo"
                      :to="row.recordUrl"
                      target="_blank"
                    />
                    <span
                      v-if="row.doi"
                      class="text-muted max-w-xs truncate text-xs"
                      :title="row.doi"
                    >
                      {{ row.doi }}
                    </span>
                  </div>

                  <div
                    v-else-if="row.status === 'publishing'"
                    class="text-primary inline-flex items-center gap-2 text-sm"
                  >
                    <UIcon name="i-lucide-loader" class="size-4 animate-spin" />
                    Publishing…
                  </div>

                  <div v-else class="flex flex-col items-start gap-2">
                    <p
                      v-if="row.status === 'failed' && row.error"
                      class="text-error max-w-md text-xs"
                    >
                      {{ row.error }}
                    </p>
                    <UButton
                      color="primary"
                      variant="outline"
                      size="sm"
                      icon="i-lucide-upload-cloud"
                      :label="
                        row.status === 'failed'
                          ? 'Retry publish'
                          : 'Publish to Zenodo'
                      "
                      :disabled="!canPublishRow(row)"
                      :loading="row.status === 'publishing'"
                      @click="publishSingle(row)"
                    />
                  </div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UAlert
        v-if="batchStoppedEarly && selectedRepository === 'zenodo'"
        color="warning"
        variant="soft"
        icon="i-lucide-info"
        title="Publishing paused"
        description="Fix the failed poster and use Retry publish on that row, or run Publish all again for the rest."
      />
    </template>
  </div>
</template>
