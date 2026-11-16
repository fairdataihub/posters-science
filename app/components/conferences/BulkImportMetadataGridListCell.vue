<script setup lang="ts">
/**
 * A grid cell for a semicolon-separated list (keywords). Each item shows as a
 * badge. An "Add keywords" link under them opens an input; type and press
 * Enter (or the Add button) to add one. The cell value
 * stays a "; "-joined string, as in the downloaded workbook.
 */
const props = defineProps<{
  value: string;
  dataCell: string;
  label: string;
  /** Singular noun for the add button and placeholder, e.g. "keyword". */
  itemNoun: string;
}>();

const emit = defineEmits<{
  change: [value: string];
  /** Grid navigation (Enter on an empty input, arrow keys). */
  keydown: [event: KeyboardEvent];
  /** Multi-cell paste from a spreadsheet. */
  paste: [event: ClipboardEvent];
}>();

const draft = ref("");

const items = computed(() =>
  props.value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean),
);

function commit(next: string[]) {
  emit("change", next.join("; "));
}

/** Add one or more items (split on semicolons), skipping duplicates. */
function addItems(text: string) {
  const seen = new Set(items.value.map((item) => item.toLowerCase()));
  const added: string[] = [];
  for (const part of text.split(";")) {
    const item = part.trim();
    if (!item || seen.has(item.toLowerCase())) continue;
    seen.add(item.toLowerCase());
    added.push(item);
  }
  if (added.length > 0) commit([...items.value, ...added]);
}

function addDraft() {
  if (!draft.value.trim()) return;
  addItems(draft.value);
  draft.value = "";
}

function removeItem(index: number) {
  commit(items.value.filter((_, i) => i !== index));
}

// A typed or pasted semicolon ends an item, as in the spreadsheet.
watch(draft, (text) => {
  const end = text.lastIndexOf(";");
  if (end < 0) return;
  addItems(text.slice(0, end));
  draft.value = text.slice(end + 1).trimStart();
});

// The input stays hidden behind an "Add keywords" link until asked for.
const adding = ref(false);
const input = useTemplateRef<HTMLInputElement>("input");

async function openInput() {
  adding.value = true;
  await nextTick();
  input.value?.focus();
}

function onInputBlur() {
  addDraft();
  adding.value = false;
}

function onOpenKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openInput();

    return;
  }
  emit("keydown", event);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    draft.value = "";
    input.value?.blur();

    return;
  }
  if (event.key === "Enter" && draft.value.trim()) {
    event.preventDefault();
    addDraft();

    return;
  }
  if (event.key === "Backspace" && !draft.value && items.value.length > 0) {
    event.preventDefault();
    removeItem(items.value.length - 1);

    return;
  }
  emit("keydown", event);
}
</script>

<template>
  <div class="flex flex-col gap-1.5 px-2 py-1.5">
    <div v-if="items.length > 0" class="flex flex-wrap gap-1">
      <UBadge
        v-for="(item, index) in items"
        :key="`${item}-${index}`"
        color="neutral"
        variant="subtle"
        class="max-w-full gap-1 pr-1"
      >
        <span class="[overflow-wrap:anywhere] break-words">{{ item }}</span>

        <button
          type="button"
          class="text-muted hover:text-default focus-visible:ring-primary shrink-0 rounded focus-visible:ring-2 focus-visible:outline-none"
          :aria-label="`Remove ${item}`"
          @click="removeItem(index)"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </UBadge>
    </div>

    <template v-if="adding">
      <input
        ref="input"
        v-model="draft"
        type="text"
        :data-cell="dataCell"
        class="placeholder:text-dimmed bg-default ring-accented focus-visible:ring-primary w-full rounded-md px-2.5 py-1.5 text-sm ring outline-none ring-inset focus-visible:ring-2"
        :placeholder="`Type a ${itemNoun} and press Enter`"
        :aria-label="label"
        @keydown="onKeydown"
        @paste="emit('paste', $event)"
        @blur="onInputBlur"
      />

      <UButton
        v-if="draft.trim()"
        size="xs"
        color="primary"
        variant="soft"
        icon="i-lucide-plus"
        class="self-start"
        @mousedown.prevent
        @click="addDraft"
      >
        <span class="[overflow-wrap:anywhere] break-words"
          >Add “{{ draft.trim() }}”</span
        >
      </UButton>
    </template>

    <button
      v-else
      type="button"
      :data-cell="dataCell"
      class="text-muted hover:text-primary focus-visible:ring-primary flex items-center gap-1 self-start rounded text-xs focus-visible:ring-2 focus-visible:outline-none"
      :aria-label="`Add ${itemNoun}s, ${label}`"
      @click="openInput"
      @keydown="onOpenKeydown"
      @paste="emit('paste', $event)"
    >
      <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
      Add {{ itemNoun }}s
    </button>
  </div>
</template>
