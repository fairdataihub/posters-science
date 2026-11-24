<script setup lang="ts">
/**
 * Asks which email we should use about the worksheets, before they're sent.
 * Starts with the account email; the organizer confirms it or changes it.
 */

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
  <div class="space-y-2">
    <UFormField
      label="Best email to reach you"
      help="We'll email you here about these worksheets."
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
