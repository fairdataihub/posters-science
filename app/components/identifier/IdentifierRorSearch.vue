<script setup lang="ts">
interface RorResult {
  id: string;
  name: string;
  country: string;
}

const props = defineProps<{
  open: boolean;
  initialQuery: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "select", rorUrl: string, displayName: string): void;
}>();

const query = ref(props.initialQuery);
const results = ref<RorResult[]>([]);
const loading = ref(false);
const searched = ref(false);

onMounted(() => {
  if (props.initialQuery) runSearch();
});

async function runSearch() {
  if (!query.value.trim()) return;
  loading.value = true;
  searched.value = false;
  try {
    const data = await $fetch<RorResult[]>("/api/ror/search", {
      query: { query: query.value.trim(), simple: "true" },
    });

    results.value = data ?? [];
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
    searched.value = true;
  }
}

function selectResult(result: RorResult) {
  emit("select", result.id, result.name);
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
              Find ROR Identifier
            </h3>

            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Search the Research Organization Registry
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

        <div class="flex gap-2">
          <UInput
            v-model="query"
            placeholder="Search by organization name"
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

            <p class="text-xs text-gray-400 dark:text-gray-500">
              Check the name spelling or search directly on
              <a
                :href="`https://ror.org/search?query=${encodeURIComponent(query)}`"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-primary-500 underline"
                >ror.org</a
              >.
            </p>
          </div>

          <div
            v-else-if="!searched"
            class="flex h-full items-center justify-center py-16"
          >
            <p class="text-sm text-gray-400 dark:text-gray-500">
              Enter an organization name to search.
            </p>
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="result in results"
              :key="result.id"
              type="button"
              class="hover:border-primary-300 hover:bg-primary-50 dark:hover:border-primary-700 dark:hover:bg-primary-900/20 w-full rounded-lg border border-gray-200 p-3 text-left transition-colors dark:border-gray-700"
              @click="selectResult(result)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ result.name }}
                  </p>

                  <p
                    v-if="result.country"
                    class="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
                  >
                    {{ result.country }}
                  </p>
                </div>

                <a
                  :href="result.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="hover:text-primary-500 shrink-0 font-mono text-xs text-gray-400 hover:underline"
                  @click.stop
                >
                  {{ result.id.replace("https://ror.org/", "") }}
                </a>
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
