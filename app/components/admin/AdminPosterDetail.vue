<script setup lang="ts">
import type { AdminPosterRow, PosterOwner } from "./types";

const props = defineProps<{ posterId: number | null }>();

const emit = defineEmits<{ (e: "close"): void }>();

type FamilyMember = {
  id: number;
  status: string;
  versionSequence: number;
  isLatestVersion: boolean;
  tombstone: boolean;
  publishedAt: string | null;
  created: string;
  posterMetadata: { doi: string | null; version: string | null } | null;
};

type DetailResponse = {
  poster: AdminPosterRow & {
    description: string;
    user: PosterOwner;
    posterMetadata: Record<string, unknown> | null;
    zenodoDepositions: Record<string, unknown> | null;
    extractionJob: Record<string, unknown> | null;
  };
  rootId: number;
  family: FamilyMember[];
};

const open = computed({
  get: () => props.posterId !== null,
  set: (value: boolean) => {
    if (!value) emit("close");
  },
});

const { data, status } = await useFetch<DetailResponse>(
  () => `/api/admin/posters/${props.posterId}`,
  {
    // Nothing to fetch until a row is picked.
    immediate: false,
    watch: [() => props.posterId],
    key: "admin-poster-detail",
  },
);

const poster = computed(() => data.value?.poster ?? null);
const family = computed(() => data.value?.family ?? []);
const metadata = computed(
  () =>
    (poster.value?.posterMetadata ?? null) as Record<string, unknown> | null,
);

const doi = computed(
  () =>
    (metadata.value?.doi as string | null)?.trim() ||
    poster.value?.zenodoDepositions?.lastPublishedZenodoDoi?.trim() ||
    null,
);

const showRawJson = ref(false);

// Long free-form arrays and blobs are better read in the raw view than in a
// summary row, so the summary sticks to the scalar fields.
const metadataRows = computed(() => {
  const source = metadata.value;
  if (!source) return [];

  const keys = [
    "license",
    "publisher",
    "publicationYear",
    "version",
    "domain",
    "language",
    "size",
    "format",
    "conferenceName",
    "conferenceLocation",
    "conferenceYear",
  ];

  return keys
    .map((key) => ({ key, value: source[key] }))
    .filter(
      (row) =>
        row.value !== null && row.value !== undefined && row.value !== "",
    );
});

const creators = computed(() => {
  const value = metadata.value?.creators;

  return Array.isArray(value) ? (value as Array<{ name?: string }>) : [];
});
</script>

<template>
  <USlideover
    v-model:open="open"
    side="right"
    class="w-full max-w-3xl"
    :title="poster ? `Poster ${poster.id}` : 'Poster'"
    :description="poster?.title"
  >
    <template #body>
      <UiSpinner v-if="status === 'pending'" size="lg" class="h-40" />

      <div v-else-if="poster" class="space-y-6">
        <div class="flex gap-4">
          <NuxtImg
            v-if="poster.imageUrl"
            :src="poster.imageUrl"
            :alt="poster.title"
            class="border-default h-32 w-24 shrink-0 rounded border object-cover"
          />

          <div class="min-w-0 space-y-2">
            <p class="font-medium">{{ poster.title }}</p>

            <div class="flex flex-wrap gap-1">
              <UBadge
                :color="posterStatusColor(poster.status)"
                variant="subtle"
                size="sm"
              >
                {{ poster.status }}
              </UBadge>

              <UBadge
                v-if="poster.tombstone"
                color="warning"
                variant="subtle"
                size="sm"
              >
                Tombstoned
              </UBadge>

              <UBadge
                v-if="poster.automated"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Auto indexed
              </UBadge>

              <UBadge color="neutral" variant="subtle" size="sm">
                {{ poster._count.likes }} likes
              </UBadge>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                variant="outline"
                color="neutral"
                icon="material-symbols:open-in-new"
                label="Public page"
                :to="`/discover/${data?.rootId}`"
                target="_blank"
              />
            </div>
          </div>
        </div>

        <p v-if="poster.tombstone && poster.tombedReason" class="text-sm">
          <span class="text-muted">Retired because:</span>
          {{ poster.tombedReason }}
        </p>

        <USeparator />

        <section class="space-y-2">
          <h3 class="text-sm font-semibold">Identity</h3>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt class="text-muted">Poster id</dt>

            <dd class="font-mono">{{ poster.id }}</dd>

            <dt class="text-muted">Version root id</dt>

            <dd class="font-mono">{{ data?.rootId }}</dd>

            <dt class="text-muted">Version sequence</dt>

            <dd class="font-mono">
              v{{ poster.versionSequence }}
              <span v-if="poster.isLatestVersion">(latest)</span>
            </dd>

            <dt class="text-muted">Owner</dt>

            <dd class="truncate">{{ poster.user.emailAddress }}</dd>

            <dt class="text-muted">Created</dt>

            <dd>{{ formatDateTime(poster.created) }}</dd>

            <dt class="text-muted">Updated</dt>

            <dd>{{ formatDateTime(poster.updated) }}</dd>

            <dt class="text-muted">Published</dt>

            <dd>{{ formatDateTime(poster.publishedAt) }}</dd>
          </dl>
        </section>

        <USeparator />

        <section class="space-y-2">
          <h3 class="text-sm font-semibold">Publication</h3>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt class="text-muted">DOI</dt>

            <dd>
              <a
                v-if="doi"
                :href="resolveDoiUrl(doi)"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary font-mono hover:underline"
              >
                {{ doi }}
              </a>

              <span v-else class="text-muted">-</span>
            </dd>

            <template v-for="row in metadataRows" :key="row.key">
              <dt class="text-muted">{{ row.key }}</dt>

              <dd class="truncate">{{ row.value }}</dd>
            </template>
          </dl>

          <p v-if="creators.length > 0" class="text-sm">
            <span class="text-muted">Creators:</span>
            {{
              creators
                .map((c) => c.name)
                .filter(Boolean)
                .join(", ")
            }}
          </p>
        </section>

        <USeparator />

        <section class="space-y-2">
          <h3 class="text-sm font-semibold">Zenodo</h3>

          <dl
            v-if="poster.zenodoDepositions"
            class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm"
          >
            <dt class="text-muted">Deposition id</dt>

            <dd class="font-mono">
              {{ poster.zenodoDepositions.depositionId }}
            </dd>

            <dt class="text-muted">Deposition status</dt>

            <dd>{{ poster.zenodoDepositions.status }}</dd>

            <dt class="text-muted">Last published DOI</dt>

            <dd class="font-mono">
              {{ poster.zenodoDepositions.lastPublishedZenodoDoi ?? "-" }}
            </dd>
          </dl>

          <p v-else class="text-muted text-sm">
            No Zenodo deposition is linked to this poster.
          </p>
        </section>

        <USeparator />

        <section class="space-y-2">
          <h3 class="text-sm font-semibold">Extraction job</h3>

          <dl
            v-if="poster.extractionJob"
            class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm"
          >
            <dt class="text-muted">Job id</dt>

            <dd class="font-mono text-xs">{{ poster.extractionJob.id }}</dd>

            <dt class="text-muted">Status</dt>

            <dd>{{ poster.extractionJob.status }}</dd>

            <dt class="text-muted">File</dt>

            <dd class="truncate">{{ poster.extractionJob.fileName }}</dd>

            <dt class="text-muted">Updated</dt>

            <dd>
              {{ formatDateTime(poster.extractionJob.updated as string) }}
            </dd>
          </dl>

          <p v-else class="text-muted text-sm">
            No extraction job exists for this poster.
          </p>

          <UAlert
            v-if="poster.extractionJob?.error"
            color="error"
            variant="soft"
            title="Extraction error"
            :description="String(poster.extractionJob.error)"
          />
        </section>

        <template v-if="family.length > 1">
          <USeparator />

          <section class="space-y-2">
            <h3 class="text-sm font-semibold">
              Version family ({{ family.length }})
            </h3>

            <div class="space-y-1">
              <div
                v-for="member in family"
                :key="member.id"
                class="border-default flex items-center gap-2 rounded border p-2 text-sm"
                :class="member.id === poster.id ? 'bg-elevated' : ''"
              >
                <span class="font-mono">{{ member.id }}</span>

                <span class="text-muted">v{{ member.versionSequence }}</span>

                <UBadge
                  :color="posterStatusColor(member.status)"
                  variant="subtle"
                  size="sm"
                >
                  {{ member.status }}
                </UBadge>

                <UBadge
                  v-if="member.isLatestVersion"
                  color="primary"
                  variant="subtle"
                  size="sm"
                >
                  latest
                </UBadge>

                <span
                  v-if="member.posterMetadata?.doi"
                  class="text-muted truncate font-mono text-xs"
                >
                  {{ member.posterMetadata.doi }}
                </span>

                <span class="text-muted ml-auto text-xs">
                  {{ formatDate(member.created) }}
                </span>
              </div>
            </div>
          </section>
        </template>

        <USeparator />

        <section class="space-y-2">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="
              showRawJson
                ? 'material-symbols:expand-less'
                : 'material-symbols:expand-more'
            "
            :label="showRawJson ? 'Hide raw record' : 'Show raw record'"
            @click="showRawJson = !showRawJson"
          />

          <pre
            v-if="showRawJson"
            class="bg-elevated max-h-96 overflow-auto rounded-lg p-3 text-xs"
            >{{ JSON.stringify(data, null, 2) }}</pre
          >
        </section>
      </div>
    </template>
  </USlideover>
</template>
