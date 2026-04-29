<script setup lang="ts">
import {
  type CalendarDate,
  DateFormatter,
  getLocalTimeZone,
} from "@internationalized/date";

const modelValue = defineModel<{
  start: CalendarDate | undefined;
  end: CalendarDate | undefined;
}>({ required: true });

const props = defineProps<{
  numberOfMonths?: number;
}>();

const df = new DateFormatter("en-US", { dateStyle: "medium" });

function clear() {
  modelValue.value = { start: undefined, end: undefined };
}
</script>

<template>
  <div>
    <h4 class="mb-3 text-sm font-medium">Published</h4>

    <div class="flex items-center gap-2">
      <UPopover>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-calendar"
        >
          <template v-if="modelValue.start">
            <template v-if="modelValue.end">
              {{ df.format(modelValue.start.toDate(getLocalTimeZone())) }}
              -
              {{ df.format(modelValue.end.toDate(getLocalTimeZone())) }}
            </template>

            <template v-else>
              {{ df.format(modelValue.start.toDate(getLocalTimeZone())) }}
            </template>
          </template>

          <template v-else> Pick a date </template>
        </UButton>

        <template #content>
          <UCalendar
            v-model="modelValue"
            class="p-2"
            :number-of-months="props.numberOfMonths ?? 2"
            range
          />
        </template>
      </UPopover>

      <UButton
        v-if="modelValue.start"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-x"
        @click="clear"
      />
    </div>
  </div>
</template>
