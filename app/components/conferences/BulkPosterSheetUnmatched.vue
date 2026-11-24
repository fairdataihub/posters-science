<script setup lang="ts">
import type { HeldPoster } from "#shared/types/bulkWorksheetHold";

/**
 * Lists the posters that didn't match a worksheet row at Review. The
 * organizer can send them to us, which holds just those posters, or keep
 * what was read from them.
 */

const props = defineProps<{
  /** Posters without a row, not decided on yet */
  posters: HeldPoster[];
  /** Posters already sent to the team */
  held: HeldPoster[];
  /** When they were sent; another batch of posters can't be sent after */
  heldAt: string | null;
  sending: boolean;
}>();

const emit = defineEmits<{
  (e: "send" | "keep"): void;
}>();

const REASONS: Record<HeldPoster["reason"], string> = {
  no_row: "No row in your worksheet",
  unlinked: "You unlinked its row",
};

/** Expected by: 7 days after they were sent. */
const heldUntil = computed(() => {
  if (!props.heldAt) return "";
  const due = new Date(new Date(props.heldAt).getTime() + 7 * 86_400_000);

  return due.toLocaleDateString(undefined, { month: "long", day: "numeric" });
});

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
</script>

<template>
  <div class="space-y-3">
    <section
      v-if="posters.length"
      class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"
      aria-labelledby="poster-sheet-unmatched-title"
    >
      <h3 id="poster-sheet-unmatched-title" class="font-semibold">
        {{ plural(posters.length, "poster", "posters") }}
        didn't match your worksheet
      </h3>

      <p class="text-muted mt-1 text-sm">
        <template v-if="!heldAt">
          Send {{ posters.length === 1 ? "it" : "them" }} to us and we'll set
          {{ posters.length === 1 ? "it" : "them" }} up within 7 days. You can
          publish the rest of your batch meanwhile. Or keep what we read from
          {{ posters.length === 1 ? "the poster" : "the posters" }}.
        </template>

        <template v-else>
          We already have other posters from this batch, so these keep what we
          read from them. Email us if they need a look too.
        </template>
      </p>

      <ul class="mt-3 divide-y divide-amber-200 text-sm dark:divide-amber-900">
        <li
          v-for="poster in posters"
          :key="poster.posterId"
          class="flex flex-wrap items-center justify-between gap-x-3 py-1.5"
        >
          <span
            class="min-w-0 flex-1 truncate font-mono text-xs"
            :title="poster.fileName"
          >
            {{ poster.fileName }}
          </span>

          <span class="text-muted text-xs">{{ REASONS[poster.reason] }}</span>
        </li>
      </ul>

      <div class="mt-3 flex flex-wrap justify-end gap-2">
        <UButton
          :color="heldAt ? 'primary' : 'neutral'"
          :variant="heldAt ? 'solid' : 'outline'"
          :label="heldAt ? 'OK' : 'Use what we read'"
          :disabled="sending"
          @click="emit('keep')"
        />

        <UButton
          v-if="!heldAt"
          color="primary"
          icon="i-lucide-send"
          :label="`Send ${posters.length === 1 ? 'it' : 'these'} to us`"
          :loading="sending"
          @click="emit('send')"
        />
      </div>
    </section>

    <p
      v-if="held.length"
      class="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"
      role="status"
    >
      <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0" />

      <span class="min-w-0 [overflow-wrap:anywhere]">
        {{ plural(held.length, "poster is", "posters are") }} with us ({{
          held.map((poster) => poster.fileName).join(", ")
        }}). We'll have {{ held.length === 1 ? "it" : "them" }} ready by
        {{ heldUntil }} and email you; publish the rest of your batch meanwhile.
      </span>
    </p>
  </div>
</template>
