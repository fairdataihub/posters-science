<script setup lang="ts">
export type ZenodoAccountDisplay = {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
  affiliations?: string;
  profileUrl?: string;
};

const props = defineProps<{
  account: ZenodoAccountDisplay | null;
  disconnecting?: boolean;
}>();

const emit = defineEmits<{
  disconnect: [];
}>();

/** A username that is only the email adds nothing, so it is not shown. */
const handle = computed(() => {
  const account = props.account;
  if (!account?.username || account.username === account.email) return "";
  return `@${account.username}`;
});

/** Bold line: the person's name, else their @handle, else their email. */
const primaryLine = computed(
  () => props.account?.fullName || handle.value || props.account?.email || "",
);

/** Muted details under it, skipping whatever is already the bold line. */
const secondaryLines = computed(() =>
  [handle.value, props.account?.email, props.account?.affiliations].filter(
    (line): line is string => Boolean(line) && line !== primaryLine.value,
  ),
);
</script>

<template>
  <div
    class="border-default flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
  >
    <div class="flex min-w-0 items-center gap-3">
      <div class="min-w-0">
        <p class="text-success flex items-center gap-1 text-xs font-medium">
          <UIcon name="i-lucide-check-circle" class="size-3.5" />
          Connected to Zenodo
        </p>
        <p v-if="primaryLine" class="truncate font-medium">
          {{ primaryLine }}
        </p>
        <p
          v-for="line in secondaryLines"
          :key="line"
          class="text-muted truncate text-sm"
        >
          {{ line }}
        </p>
        <ULink
          v-if="account?.profileUrl"
          :to="account.profileUrl"
          target="_blank"
          class="text-primary inline-flex items-center gap-1 text-sm hover:underline"
        >
          View Zenodo profile
          <UIcon name="i-lucide-external-link" class="size-3.5" />
        </ULink>
      </div>
    </div>

    <UButton
      variant="outline"
      color="neutral"
      size="sm"
      icon="i-lucide-log-out"
      label="Sign out of Zenodo"
      :loading="disconnecting"
      @click="emit('disconnect')"
    />
  </div>
</template>
