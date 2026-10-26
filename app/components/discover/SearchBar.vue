<script setup lang="ts">
import {
  DISCOVER_FREE_TEXT_FIELDS,
  DISCOVER_SEARCH_EXAMPLES,
  DISCOVER_SEARCH_FIELD_LABELS,
  parseDiscoverSearch,
} from "#shared/utils/discoverSearch";

// The Discover search box: the input, its field-prefix help and the line that
// explains what the submitted search matched. Used on /discover and on public
// profiles, so both understand the same search syntax. Anything in the default
// slot sits on the same row as the input, and wraps below it when narrow.

const props = withDefaults(
  defineProps<{
    /** The search that was last submitted, which the scope line describes. */
    committed?: string;
    placeholder?: string;
    buttonLabel?: string;
  }>(),
  {
    committed: "",
    placeholder: "Search title, author, affiliation, DOI, ORCID...",
    buttonLabel: "Search Posters",
  },
);

const searchQuery = defineModel<string>({ required: true });

const emit = defineEmits<{
  submit: [];
}>();

const FREE_TEXT_SCOPE =
  "title, description, keywords, authors, affiliations, conference and DOI";

const searchHelp = (
  Object.keys(DISCOVER_SEARCH_EXAMPLES) as Array<
    keyof typeof DISCOVER_SEARCH_EXAMPLES
  >
).map((field) => ({
  field,
  label: DISCOVER_SEARCH_FIELD_LABELS[field],
  example: DISCOVER_SEARCH_EXAMPLES[field],
  inFreeText: (DISCOVER_FREE_TEXT_FIELDS as readonly string[]).includes(field),
}));

const searchScopeLabel = computed(() => {
  const { clauses, freeText } = parseDiscoverSearch(props.committed);

  if (clauses.length === 0) {
    return freeText ? `Searching ${FREE_TEXT_SCOPE} for "${freeText}".` : "";
  }

  const parts = clauses.map(
    ({ field, term }) => `${DISCOVER_SEARCH_FIELD_LABELS[field]} "${term}"`,
  );

  if (freeText) parts.push(`"${freeText}" in any of the default fields`);

  return `Matching ${parts.join(" and ")}.`;
});
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3 pb-4">
      <div class="flex w-full items-center gap-2 sm:w-auto">
        <UTooltip
          :ui="{ content: 'h-auto max-w-md items-start p-3' }"
          :delay-duration="300"
        >
          <UInput
            v-model="searchQuery"
            :placeholder="placeholder"
            icon="i-lucide-search"
            class="w-full sm:w-96"
            @keydown.enter="emit('submit')"
          />

          <template #content>
            <div class="space-y-2 text-xs">
              <p>
                A plain search looks at the {{ FREE_TEXT_SCOPE }}. Pasting an
                ORCID, ROR or DOI searches for that identifier.
              </p>

              <p>
                Narrow it with one or more prefixes. Put values with spaces in
                quotes.
              </p>

              <ul class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <template v-for="item in searchHelp" :key="item.field">
                  <li class="contents">
                    <span class="text-muted">{{ item.label }}</span>

                    <code>{{ item.example }}</code>
                  </li>
                </template>
              </ul>
            </div>
          </template>
        </UTooltip>

        <UButton
          color="primary"
          variant="outline"
          :label="buttonLabel"
          icon="i-lucide-search"
          @click="emit('submit')"
        />
      </div>

      <slot />
    </div>

    <p
      v-if="searchScopeLabel"
      class="text-muted -mt-2 flex items-center gap-1.5 pb-4 text-xs"
    >
      <UIcon name="i-lucide-search" class="size-3.5 shrink-0" />

      {{ searchScopeLabel }}
    </p>
  </div>
</template>
