import { type CalendarDate, parseDate } from "@internationalized/date";

export type ConferenceDateRangeValue = {
  start: CalendarDate | undefined;
  end: CalendarDate | undefined;
};

/** YYYY-MM-DD as picked; going through a UTC Date shifted it a day east of UTC. */
function calendarDateToW3C(cd: CalendarDate): string {
  return cd.toString();
}

/**
 * Two-way binding between W3C date strings on a form and DateRangePicker.
 */
export function useConferenceDateRangePicker(options: {
  startDate: Ref<string>;
  endDate: Ref<string>;
}) {
  const conferenceDateRange = computed<ConferenceDateRangeValue>({
    get() {
      const startStr = options.startDate.value ?? "";
      const endStr = options.endDate.value ?? "";

      if (!startStr && !endStr) {
        return { start: undefined, end: undefined };
      }

      let start: CalendarDate | undefined;
      let end: CalendarDate | undefined;
      try {
        start = startStr ? parseDate(startStr) : undefined;
        end = endStr ? parseDate(endStr) : undefined;
      } catch {
        start = undefined;
        end = undefined;
      }
      if (start && end && start.compare(end) > 0) end = start;

      return { start, end };
    },
    set(value: ConferenceDateRangeValue) {
      options.startDate.value = value.start
        ? calendarDateToW3C(value.start)
        : "";
      options.endDate.value = value.end ? calendarDateToW3C(value.end) : "";
    },
  });

  function clearConferenceDates() {
    options.startDate.value = "";
    options.endDate.value = "";
  }

  return { conferenceDateRange, clearConferenceDates };
}
