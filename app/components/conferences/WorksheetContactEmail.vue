<script setup lang="ts">
/**
 * Asks which email we should use about the worksheets, before they're sent.
 * Starts with the account email; the organizer confirms it or changes it.
 */

const props = withDefaults(
  defineProps<{
    /** What we'll email about, under the field. Differs per flow. */
    help?: string;
  }>(),
  {
    help: "We'll take a look at your worksheets and email you here within 7 days.",
  },
);

const email = defineModel<string>("email", { required: true });
const confirmed = defineModel<boolean>("confirmed", { required: true });

const invalid = computed(
  () => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()),
);

// A changed address needs confirming again.
watch(email, () => {
  confirmed.value = false;
});
</script>

<template>
  <div
    class="border-default bg-default space-y-2 rounded-md border p-3"
  >
    <UFormField
      label="Best email to reach you"
      :help="props.help"
      :error="
        email.trim() && invalid ? 'Enter a valid email address.' : undefined
      "
    >
      <UInput
        v-model="email"
        type="email"
        autocomplete="email"
        placeholder="you@example.org"
        :maxlength="254"
        class="w-full"
      />
    </UFormField>

    <UCheckbox
      v-model="confirmed"
      :disabled="invalid"
      label="Yes, this is the best email to reach me"
    />
  </div>
</template>
