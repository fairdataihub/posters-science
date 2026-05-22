<script setup lang="ts">
import type { CalendarDate } from "@internationalized/date";
import DateRangePicker from "~/components/ui/DateRangePicker.vue";

const modelValue = defineModel<{
  start: CalendarDate | undefined;
  end: CalendarDate | undefined;
}>({ required: true });

const props = defineProps<{
  numberOfMonths?: number;
}>();
</script>

<template>
  <div>
    <h4 class="mb-3 text-sm font-medium">Published</h4>

    <DateRangePicker
      v-model="modelValue"
      :number-of-months="props.numberOfMonths ?? 2"
      clearable
    />
  </div>
</template>
