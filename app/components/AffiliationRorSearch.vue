<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";

interface RorResult {
  id: string;
  name: string;
  country: string;
}

interface Affiliation {
  name: string;
  affiliationIdentifier?: string;
  affiliationIdentifierScheme?: string;
  schemeURI?: string;
}

const props = defineProps<{
  modelValue: Affiliation;
  nameFieldName: string;
  identifierFieldName: string;
  identifierError?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: Affiliation): void;
  (e: "identifierInput", value: string): void;
  (e: "delete"): void;
}>();

const localName = ref(props.modelValue.name);
const localIdentifier = ref(props.modelValue.affiliationIdentifier ?? "");

watch(
  () => props.modelValue,
  (v) => {
    localName.value = v.name;
    localIdentifier.value = v.affiliationIdentifier ?? "";
  },
  { deep: true },
);

const results = ref<RorResult[]>([]);
const loading = ref(false);
const showDropdown = ref(false);
const highlighted = ref(-1);

const inputWrapperRef = ref<HTMLElement | null>(null);
const dropdownStyle = ref({ top: "0px", left: "0px", width: "0px" });

function updateDropdownPosition() {
  const el = inputWrapperRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  dropdownStyle.value = {
    top: `${rect.bottom + window.scrollY}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${rect.width}px`,
  };
}

let activeController: AbortController | null = null;

const fetchResults = useDebounceFn(async (query: string) => {
  if (query.length < 2) {
    results.value = [];
    showDropdown.value = false;

    return;
  }

  activeController?.abort();
  activeController = new AbortController();
  const { signal } = activeController;

  loading.value = true;
  try {
    const data = await $fetch<RorResult[]>("/api/ror/search", {
      query: { query },
      signal,
    });
    results.value = data;
    if (results.value.length > 0) {
      updateDropdownPosition();
      showDropdown.value = true;
    } else {
      showDropdown.value = false;
    }
    highlighted.value = -1;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    results.value = [];
    showDropdown.value = false;
  } finally {
    loading.value = false;
  }
}, 600);

function onNameInput(value: string | number) {
  const str = String(value);
  localName.value = str;
  emit("update:modelValue", { ...props.modelValue, name: str });
  fetchResults(str);
}

function onIdentifierInput(value: string | number) {
  const str = String(value);
  localIdentifier.value = str;
  emit("update:modelValue", {
    ...props.modelValue,
    affiliationIdentifier: str,
  });
  emit("identifierInput", str);
}

function selectResult(result: RorResult) {
  localName.value = result.name;
  localIdentifier.value = result.id;
  emit("update:modelValue", {
    ...props.modelValue,
    name: result.name,
    affiliationIdentifier: result.id,
    affiliationIdentifierScheme: "ROR",
    schemeURI: "https://ror.org",
  });
  emit("identifierInput", result.id);
  closeDropdown();
}

function closeDropdown() {
  showDropdown.value = false;
  highlighted.value = -1;
}

function closeDropdownDelayed() {
  setTimeout(closeDropdown, 150);
}

function highlightNext() {
  if (!showDropdown.value || !results.value.length) return;
  highlighted.value = Math.min(highlighted.value + 1, results.value.length - 1);
}

function highlightPrev() {
  if (!showDropdown.value) return;
  highlighted.value = Math.max(highlighted.value - 1, 0);
}

function selectHighlighted() {
  const item = results.value[highlighted.value];
  if (item) selectResult(item);
}
</script>

<template>
  <div class="flex gap-2">
    <UFormField class="w-full" :name="nameFieldName" label="Name" required>
      <div ref="inputWrapperRef">
        <UInput
          :model-value="localName"
          placeholder="University of California, San Diego"
          @update:model-value="onNameInput"
          @focus="
            if (results.length && localName.length >= 2) {
              updateDropdownPosition();
              showDropdown = true;
            }
          "
          @blur="closeDropdownDelayed"
          @keydown.escape="closeDropdown"
          @keydown.down.prevent="highlightNext"
          @keydown.up.prevent="highlightPrev"
          @keydown.enter.prevent="selectHighlighted"
        >
          <template v-if="loading" #trailing>
            <UIcon
              name="i-lucide-loader"
              class="size-4 animate-spin text-gray-400"
            />
          </template>
        </UInput>
      </div>
    </UFormField>

    <Teleport to="body">
      <div
        v-if="showDropdown"
        :style="{ position: 'absolute', zIndex: 9999, ...dropdownStyle }"
        class="mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      >
        <button
          v-for="(result, i) in results"
          :key="result.id"
          type="button"
          class="flex w-full flex-col px-3 py-2 text-left text-sm transition-colors"
          :class="
            i === highlighted
              ? 'bg-primary-50 dark:bg-primary-900/20'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
          "
          @mousedown.prevent="selectResult(result)"
        >
          <span class="font-medium text-gray-900 dark:text-white">{{
            result.name
          }}</span>

          <span v-if="result.country" class="text-xs text-gray-500">{{
            result.country
          }}</span>
        </button>
      </div>
    </Teleport>

    <UButton
      class="mt-6"
      size="sm"
      color="error"
      variant="outline"
      icon="i-lucide-trash"
      @click="$emit('delete')"
    />
  </div>

  <UFormField
    class="mt-3"
    :name="identifierFieldName"
    label="ROR Identifier"
    :error="identifierError"
  >
    <template #hint>
      <a
        href="https://ror.org/"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-primary-500 text-[11px] font-normal text-gray-400 hover:underline"
        >Learn more about ROR</a
      >
    </template>

    <UInput
      :model-value="localIdentifier"
      placeholder="https://ror.org/..."
      class="w-full"
      @update:model-value="onIdentifierInput"
    >
      <template
        v-if="localIdentifier?.startsWith('http') && !identifierError"
        #trailing
      >
        <a
          :href="localIdentifier"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-primary-500 text-gray-400"
        >
          <UIcon name="i-lucide-external-link" class="size-4 cursor-pointer" />
        </a>
      </template>
    </UInput>
  </UFormField>
</template>
