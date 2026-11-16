/**
 * Grow wrapping grid cells to fit their text. Uses CSS field-sizing where
 * supported; otherwise (e.g. Firefox) sets the height from scrollHeight, and
 * only re-measures when the field's text changed (measuring forces layout).
 */
const supportsFieldSizing =
  typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

const fittedValues = new WeakMap<HTMLTextAreaElement, string>();

function fitTextareaIfChanged(el: HTMLTextAreaElement) {
  if (supportsFieldSizing) return;
  if (fittedValues.get(el) === el.value) return;
  fittedValues.set(el, el.value);
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** v-auto-grow directive. */
export const vAutoGrow = {
  mounted: fitTextareaIfChanged,
  updated: fitTextareaIfChanged,
};
