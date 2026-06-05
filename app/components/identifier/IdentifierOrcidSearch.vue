<script setup lang="ts">
interface OrcidResult {
  orcidId: string;
  givenName: string;
  familyName: string;
  affiliations: string[];
}

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
const results = ref<OrcidResult[]>([]);
const loading = ref(false);
const searched = ref(false);
const useAffiliationFilter = ref(false);

onMounted(() => {
  useAffiliationFilter.value = props.affiliations.length > 0;
  if (query.value) runSearch();
});

watch(useAffiliationFilter, () => {
  if (searched.value || loading.value) runSearch();
});

async function runSearch() {
  const parts = query.value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return;

  const givenName = parts[0]!;
  const familyName = parts.length > 1 ? parts.slice(1).join(" ") : parts[0]!;

  loading.value = true;
  searched.value = false;
  try {
    const data = await $fetch<OrcidResult[]>("/api/orcid/search", {
      query: {
        givenName,
        familyName,
        ...(useAffiliationFilter.value && props.affiliations[0]
          ? { affiliation: props.affiliations[0] }
          : {}),
      },
    });
    results.value = data;
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
    searched.value = true;
  }
}

function selectResult(result: OrcidResult) {
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
    title="Find ORCID Identifier"
    description="Search for the author's ORCID identifier based on their name and affiliation information."
    @update:open="$emit('update:open', $event)"
  >
    <template #body>
      <div class="flex h-full w-full flex-col gap-4">
        <div
          v-if="affiliations.length > 0"
          class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <UToggle
            :model-value="useAffiliationFilter"
            size="sm"
            @update:model-value="useAffiliationFilter = $event"
          />

          <div class="min-w-0">
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
              Filter by affiliation
            </p>

            <p class="truncate text-xs text-gray-500 dark:text-gray-400">
              {{ affiliations[0] }}
            </p>
          </div>
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
            <p class="text-sm text-gray-500 dark:text-gray-400">
              No results found.
            </p>

            <UButton
              v-if="useAffiliationFilter && affiliations.length > 0"
              size="sm"
              variant="outline"
              color="neutral"
              @click="useAffiliationFilter = false"
            >
              Remove affiliation filter and retry
            </UButton>

            <p v-else class="text-xs text-gray-400 dark:text-gray-500">
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
              class="hover:border-primary-300 hover:bg-primary-50 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 w-full rounded-lg border border-gray-200 p-3 text-left transition-colors dark:border-gray-700"
              @click="selectResult(result)"
            >
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ result.givenName }} {{ result.familyName }}
                  </p>

                  <a
                    :href="`https://orcid.org/${result.orcidId}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="hover:text-primary-500 shrink-0 font-mono text-gray-500 hover:underline dark:text-gray-400"
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
