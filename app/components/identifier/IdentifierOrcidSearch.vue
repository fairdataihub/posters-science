<script setup lang="ts">
interface OrcidResult {
  orcidId: string;
  givenName: string;
  familyName: string;
  affiliations: string[];
}

type OrcidMatch = OrcidResult & { matchesAffiliation: boolean };

const props = defineProps<{
  open: boolean;
  givenName: string;
  familyName: string;
  affiliations: string[];
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "select", orcidUrl: string): void;
}>();

const query = ref(
  [props.givenName, props.familyName].filter(Boolean).join(" "),
);
const results = ref<OrcidMatch[]>([]);
const loading = ref(false);
const searched = ref(false);
const searchFailed = ref(false);

onMounted(() => {
  if (query.value) runSearch();
});

/**
 * Search by name alone and, when the author has affiliations, by name within
 * them at the same time. Affiliation matches come first and are highlighted;
 * everyone else follows, so a profile with no affiliation listed is not missed.
 */
async function runSearch() {
  const parts = query.value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return;

  const givenName = parts[0]!;
  const familyName = parts.length > 1 ? parts.slice(1).join(" ") : parts[0]!;
  const search = (affiliation?: string) =>
    $fetch<OrcidResult[]>("/api/orcid/search", {
      query: { givenName, familyName, ...(affiliation ? { affiliation } : {}) },
    });

  loading.value = true;
  searched.value = false;
  searchFailed.value = false;
  try {
    const [byAffiliation, byName] = await Promise.allSettled([
      // Every affiliation; the server splits them into org-name parts.
      props.affiliations.length > 0
        ? search(props.affiliations.join("; "))
        : Promise.resolve([]),
      search(),
    ]);
    const matched =
      byAffiliation.status === "fulfilled" ? byAffiliation.value : [];
    const all = byName.status === "fulfilled" ? byName.value : [];
    const matchedIds = new Set(matched.map((result) => result.orcidId));

    results.value = [
      ...matched.map((result) => ({ ...result, matchesAffiliation: true })),
      ...all
        .filter((result) => !matchedIds.has(result.orcidId))
        .map((result) => ({ ...result, matchesAffiliation: false })),
    ];
    searchFailed.value =
      byAffiliation.status === "rejected" && byName.status === "rejected";
  } finally {
    loading.value = false;
    searched.value = true;
  }
}

function selectResult(result: OrcidMatch) {
  emit("select", `https://orcid.org/${result.orcidId}`);
  emit("update:open", false);
}
</script>

<template>
  <UDrawer
    :open="open"
    direction="right"
    handle-only
    :ui="{ content: 'w-[480px] max-w-full' }"
    title="Find ORCID"
    description="Search for the author's ORCID based on their name and affiliation information."
    @update:open="$emit('update:open', $event)"
  >
    <template #title>
      <div class="flex items-start justify-between gap-2">
        <span>Find ORCID</span>

        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Close"
          @click="$emit('update:open', false)"
        />
      </div>
    </template>

    <template #body>
      <div class="flex h-full w-full flex-col gap-4">
        <div
          v-if="affiliations.length > 0"
          class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
            Matching affiliations shown first
          </p>

          <p
            class="line-clamp-[10] break-words text-xs text-gray-500 dark:text-gray-400"
            :title="affiliations.join('; ')"
          >
            {{ affiliations.join("; ") }}
          </p>
        </div>

        <div class="flex gap-2">
          <UInput
            v-model="query"
            placeholder="Search by name"
            class="w-full"
            @keydown.enter.prevent="runSearch"
          />

          <UButton
            size="sm"
            color="primary"
            variant="outline"
            icon="i-lucide-search"
            :loading="loading"
            @click="runSearch"
          />
        </div>

        <UAlert
          v-if="searched && affiliations.length === 0"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="Results may be broad"
          description="Add an affiliation to this author to narrow down the search results."
        />

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div
            v-if="loading"
            class="flex h-full items-center justify-center py-16"
          >
            <UiSpinner />
          </div>

          <div
            v-else-if="searched && results.length === 0"
            class="flex h-full flex-col items-center justify-center gap-3 py-16 text-center"
          >
            <template v-if="searchFailed">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Couldn't reach ORCID.
              </p>

              <UButton
                size="sm"
                variant="outline"
                color="neutral"
                icon="i-lucide-refresh-cw"
                @click="runSearch"
              >
                Try again
              </UButton>
            </template>

            <p v-else class="text-sm text-gray-500 dark:text-gray-400">
              No results found.
            </p>

            <p v-if="!searchFailed" class="text-xs text-gray-400 dark:text-gray-500">
              Check the name spelling or search directly on
              <a
                href="https://orcid.org/orcid-search/search"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-primary-500 underline"
                >orcid.org</a
              >.
            </p>
          </div>

          <div
            v-else-if="!searched"
            class="flex h-full items-center justify-center py-16"
          >
            <p class="text-sm text-gray-400 dark:text-gray-500">
              Enter a name to search.
            </p>
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="result in results"
              :key="result.orcidId"
              type="button"
              class="group hover:border-primary-300 hover:bg-primary-50 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 w-full cursor-pointer rounded-lg border p-3 text-left transition-colors"
              :class="
                result.matchesAffiliation
                  ? 'border-primary-300 bg-primary-50/50 dark:border-primary-700 dark:bg-primary-900/10'
                  : 'border-gray-200 dark:border-gray-700'
              "
              @click="selectResult(result)"
            >
              <div class="flex flex-col gap-1">
                <UBadge
                  v-if="result.matchesAffiliation"
                  color="primary"
                  variant="subtle"
                  size="sm"
                  icon="i-lucide-building-2"
                  label="Matches affiliation"
                  class="self-start"
                />
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ result.givenName }} {{ result.familyName }}
                  </p>

                  <a
                    :href="`https://orcid.org/${result.orcidId}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="group-hover:text-primary-500 shrink-0 font-mono text-gray-500 group-hover:underline dark:text-gray-400"
                    @click.stop
                  >
                    {{ result.orcidId }}
                  </a>
                </div>

                <p
                  v-if="result.affiliations.length"
                  class="text-xs text-gray-500 dark:text-gray-400"
                >
                  {{ result.affiliations.join(", ") }}
                </p>

                <p
                  v-else
                  class="text-xs italic text-gray-400 dark:text-gray-500"
                >
                  No institution info
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
