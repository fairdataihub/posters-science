<script setup lang="ts">
interface RorResult {
  id: string;
  name: string;
  country: string;
}

interface RorName {
  value: string;
  types: string[];
}

interface RorOrganization {
  id: string;
  names?: RorName[];
  locations?: { geonames_details?: { country_name?: string } }[];
}

interface RorItem extends RorOrganization {
  organization?: RorOrganization;
}

const props = defineProps<{
  open: boolean;
  orgName: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "select", rorUrl: string, displayName: string): void;
}>();

const results = ref<RorResult[]>([]);
const loading = ref(false);
const searched = ref(false);

onMounted(() => {
  if (props.orgName) runSearch();
});

async function runSearch() {
  if (!props.orgName) return;
  loading.value = true;
  searched.value = false;
  try {
    const advancedQuery = `names.value:(${props.orgName
      .trim()
      .split(/\s+/)
      .map((w) => `+${w}`)
      .join(" ")})`;

    const data = await $fetch<{ items: RorItem[] }>(
      "https://api.ror.org/v2/organizations",
      { query: { "query.advanced": advancedQuery } },
    );

    results.value = (data.items ?? [])
      .map((item) => {
        const org = item.organization ?? item;
        const name =
          org.names?.find((n) => n.types.includes("ror_display"))?.value ??
          org.names?.[0]?.value ??
          "";
        const country =
          org.locations?.[0]?.geonames_details?.country_name ?? "";

        return { id: org.id ?? "", name, country };
      })
      .filter((r) => r.name)
      .slice(0, 8);
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
              Find ROR
            </h3>

            <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {{ orgName }}
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
                :href="`https://ror.org/search?query=${encodeURIComponent(orgName)}`"
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
              An organization name is required to search.
            </p>
          </div>

          <div v-else class="space-y-2">
            <button
              v-for="result in results"
              :key="result.id"
              type="button"
              class="w-full rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-gray-700 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
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
                  class="shrink-0 font-mono text-xs text-gray-400 hover:text-primary-500 hover:underline"
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
