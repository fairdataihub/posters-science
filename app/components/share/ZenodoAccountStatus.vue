<script setup lang="ts">
export type ZenodoAccountDisplay = {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
  affiliations?: string;
  profileUrl?: string;
};

defineProps<{
  account: ZenodoAccountDisplay | null;
  disconnecting?: boolean;
}>();

const emit = defineEmits<{
  disconnect: [];
}>();
</script>

<template>
  <div
    class="border-default flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-gray-50/50 p-4 dark:bg-gray-900/30"
  >
    <div class="min-w-0 space-y-1">
      <UBadge
        color="success"
        variant="subtle"
        icon="i-lucide-check-circle"
        class="mb-1"
      >
        Connected to Zenodo
      </UBadge>

      <p v-if="account?.fullName" class="font-medium">
        {{ account.fullName }}
      </p>
      <p v-else-if="account?.username" class="font-medium">
        @{{ account.username }}
      </p>

      <p v-if="account?.username && account?.fullName" class="text-muted text-sm">
        @{{ account.username }}
      </p>

      <p v-if="account?.email" class="text-muted text-sm">
        {{ account.email }}
      </p>

      <p v-if="account?.affiliations" class="text-muted text-sm">
        {{ account.affiliations }}
      </p>

      <ULink
        v-if="account?.profileUrl"
        :to="account.profileUrl"
        target="_blank"
        class="text-primary inline-flex items-center gap-1 text-sm underline"
      >
        View Zenodo profile
        <UIcon name="i-lucide-external-link" class="size-3.5" />
      </ULink>
    </div>

    <UButton
      variant="outline"
      color="error"
      size="sm"
      label="Sign out of Zenodo"
      :loading="disconnecting"
      @click="emit('disconnect')"
    />
  </div>
</template>
