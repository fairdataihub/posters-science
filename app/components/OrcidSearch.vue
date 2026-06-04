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

const results = ref<OrcidResult[]>([]);
const loading = ref(false);
const searched = ref(false);
const useAffiliationFilter = ref(false);

onMounted(() => {
  useAffiliationFilter.value = props.affiliations.length > 0;
  if (props.givenName && props.familyName) runSearch();
});

watch(useAffiliationFilter, () => {
  if (searched.value || loading.value) runSearch();
});

async function runSearch() {
  if (!props.givenName || !props.familyName) return;
  loading.value = true;
  searched.value = false;
  try {
    const data = await $fetch<OrcidResult[]>("/api/orcid/search", {
      query: {
        givenName: props.givenName,
        familyName: props.familyName,
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
    :ui="{ content: 'w-[480px] max-w-full' }"
    @update:open="$emit('update:open', $event)"
  >
    <template #content>
      <div class="flex h-full w-full flex-col gap-4 p-6">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Find ORCID
            </h3>
            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {{ givenName }} {{ familyName }}
            </p>
          </div>

          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="$emit('update:open', false)"
          />
        </div>

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

          <div v-else-if="!searched" class="flex h-full items-center justify-center py-16">
            <p class="text-sm text-gray-400 dark:text-gray-500">
              Both given and family name are required to search.
            </p>
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="result in results"
              :key="result.orcidId"
              type="button"
              class="w-full rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-gray-700 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
              @click="selectResult(result)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ result.givenName }} {{ result.familyName }}
                  </p>

                  <p
                    v-if="result.affiliations.length"
                    class="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
                  >
                    {{ result.affiliations.join(", ") }}
                  </p>

                  <p
                    v-else
                    class="mt-0.5 text-xs italic text-gray-400 dark:text-gray-500"
                  >
                    No institution info
                  </p>
                </div>

                <a
                  :href="`https://orcid.org/${result.orcidId}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 font-mono text-xs text-gray-400 hover:text-primary-500 hover:underline"
                  @click.stop
                >
                  {{ result.orcidId }}
                </a>
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
