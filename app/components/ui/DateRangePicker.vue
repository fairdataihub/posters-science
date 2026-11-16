<script setup lang="ts">
import {
  type CalendarDate,
  type DateValue,
  DateFormatter,
  getLocalTimeZone,
  toCalendarDate,
} from "@internationalized/date";

defineOptions({ inheritAttrs: false });

const modelValue = defineModel<{
  start: CalendarDate | undefined;
  end: CalendarDate | undefined;
}>({ required: true });

const props = defineProps<{
  numberOfMonths?: number;
  icon?: string;
  variant?: string;
  placeholder?: string;
  clearable?: boolean;
  label?: string;
  /** Earliest selectable date; earlier dates are disabled. */
  minValue?: CalendarDate;
  /** Month the calendar opens on when no range is picked yet. */
  defaultPlaceholder?: CalendarDate;
}>();

const df = new DateFormatter("en-US", { dateStyle: "medium" });

// shallowRef: ref() would unwrap CalendarDate and drop its class type.
// The range is always replaced, never mutated.
const localRange = shallowRef<{
  start: CalendarDate | undefined;
  end: CalendarDate | undefined;
}>({
  start: modelValue.value.start,
  end: modelValue.value.end,
});

watch(
  modelValue,
  (val) => {
    localRange.value = { start: val.start, end: val.end };
  },
  { deep: true },
);

const isOpen = ref(false);
const toast = useToast();
let closedViaConfirm = false;

function rangesMatch() {
  return (
    localRange.value.start?.toString() === modelValue.value.start?.toString() &&
    localRange.value.end?.toString() === modelValue.value.end?.toString()
  );
}

watch(isOpen, (open) => {
  if (!open) {
    if (!closedViaConfirm && localRange.value.start && !rangesMatch()) {
      const fieldLabel = props.label ?? "Date range";
      toast.add({
        title: `${fieldLabel} not saved`,
        description: "Click Confirm to apply your selection.",
        color: "warning",
      });
      localRange.value = {
        start: modelValue.value.start,
        end: modelValue.value.end,
      };
    }
    closedViaConfirm = false;
  }
});

function onCalendarChange(
  value: { start?: DateValue; end?: DateValue } | null,
) {
  localRange.value = {
    start: value?.start ? toCalendarDate(value.start) : undefined,
    end: value?.end ? toCalendarDate(value.end) : undefined,
  };
}

function confirm() {
  closedViaConfirm = true;
  const { start, end } = localRange.value;
  if (!start) return;
  modelValue.value = { start, end: end ?? start };
  isOpen.value = false;
}

function clear() {
  localRange.value = { start: undefined, end: undefined };
  modelValue.value = { start: undefined, end: undefined };
}

const buttonLabel = computed(() => {
  const { start, end } = localRange.value;
  if (start && end) {
    const s = df.format(start.toDate(getLocalTimeZone()));
    const e = df.format(end.toDate(getLocalTimeZone()));

    return start.compare(end) === 0 ? s : `${s} - ${e}`;
  }
  if (start) return `${df.format(start.toDate(getLocalTimeZone()))} - ...`;

  return props.placeholder ?? "Pick a date range";
});
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
        <div class="flex flex-col">
          <UCalendar
            class="p-2"
            :model-value="localRange"
            :number-of-months="props.numberOfMonths ?? 2"
            :min-value="props.minValue"
            :default-placeholder="props.defaultPlaceholder"
            range
            @update:model-value="onCalendarChange"
          />

          <div class="flex justify-end px-2 pb-2">
            <UButton size="sm" :disabled="!localRange.start" @click="confirm">
              Confirm
            </UButton>
          </div>
        </div>
      </template>
    </UPopover>

    <UButton
      v-if="clearable && localRange.start"
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-x"
      @click="clear"
    />
  </div>
</template>
