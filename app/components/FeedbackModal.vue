<script setup lang="ts">
// The feedback form. Opened from anywhere through the shared feedbackOpen
// state, such as the Contact Us button.
const feedbackOpen = useState("feedbackOpen", () => false);
</script>

<template>
  <UModal
    v-model:open="feedbackOpen"
    title="Share Your Feedback"
    description="Tell us how the experience was using our platform!"
    class="max-w-2xl"
    :ui="{ title: 'text-xl font-semibold' }"
  >
    <template #body>
      <iframe
        src="https://tally.so/embed/XxEBYP?alignLeft=1&hideTitle=1"
        width="100%"
        height="500"
        frameborder="0"
        title="Feedback form"
        class="dark:[filter:invert(1)_contrast(0.9)_brightness(1.2)]"
      />
    </template>
  </UModal>
</template>
