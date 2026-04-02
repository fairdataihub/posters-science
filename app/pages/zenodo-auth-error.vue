<script setup lang="ts">
const route = useRoute();
const posterId = route.query.posterId as string | undefined;

const reviewLink = posterId
  ? `/share/${posterId}/review?repository=zenodo`
  : "/dashboard";
</script>

<template>
  <div class="mx-auto flex w-full max-w-screen-md flex-col gap-6 px-6 py-16">
    <div class="flex flex-col items-center gap-4 text-center">
      <UIcon name="i-simple-icons-zenodo" class="text-muted size-12" />

      <h1 class="text-2xl font-bold">Zenodo Sign-In Didn't Complete</h1>
    </div>

    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="This is a known intermittent issue"
      description="Zenodo's authentication occasionally rejects the sign-in code on the first attempt. This is not caused by anything you did wrong — it is a timing issue on Zenodo's side."
    />

    <div class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">How to resolve this</h2>

      <ol class="text-muted list-inside list-decimal space-y-2 text-sm">
        <li>
          Use your browser's <strong>Back</strong> button to return to the
          Zenodo authorization page.
        </li>

        <li>
          Approve access again (or, if Zenodo skips the approval screen, press
          <strong>Forward</strong> in your browser).
        </li>

        <li>
          If you end up on this page again, repeat the steps above. The issue is
          intermittent and typically resolves after one or two more attempts.
        </li>
      </ol>
    </div>

    <div class="flex justify-center gap-3 pt-2">
      <UButton
        color="primary"
        size="lg"
        icon="i-lucide-arrow-left"
        @click="$router.go(-2)"
      >
        Back to Zenodo Authorization
      </UButton>

      <UButton variant="outline" size="lg" :to="reviewLink">
        {{ posterId ? "Return to Review Page" : "Go to Dashboard" }}
      </UButton>
    </div>
  </div>
</template>
