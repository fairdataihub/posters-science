<script setup lang="ts">
import {
  type CalendarDate,
  DateFormatter,
  getLocalTimeZone,
} from "@internationalized/date";

defineOptions({ inheritAttrs: false });

const modelValue = defineModel<CalendarDate | undefined>({ required: true });

const props = defineProps<{
  icon?: string;
  variant?: string;
  placeholder?: string;
  clearable?: boolean;
}>();

const df = new DateFormatter("en-US", { dateStyle: "medium" });
const isOpen = ref(false);

function onSelect(value: CalendarDate) {
  modelValue.value = value;
  isOpen.value = false;
}

function clear() {
  modelValue.value = undefined;
}

const buttonLabel = computed(() =>
  modelValue.value
    ? df.format(modelValue.value.toDate(getLocalTimeZone()))
    : (props.placeholder ?? "Pick a date"),
);
</script>

<template>
  <div class="flex items-center gap-2" v-bind="$attrs">
    <UPopover v-model:open="isOpen">
      <UButton
        color="neutral"
        :variant="(props.variant as any) ?? 'outline'"
        size="md"
        :icon="props.icon ?? 'i-lucide-calendar'"
        class="flex-1"
      >
        {{ buttonLabel }}
      </UButton>

      <template #content>
        <UCalendar
          class="p-2"
          :model-value="modelValue"
          @update:model-value="onSelect"
        />
      </template>
    </UPopover>

    <UButton
      v-if="clearable && modelValue"
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-x"
      @click="clear"
    />
  </div>
</template>
