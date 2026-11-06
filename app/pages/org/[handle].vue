<script setup lang="ts">
import type { OrganizationRole } from "#shared/types/organization";
import type { ProfilePoster } from "~/components/profile/PosterCard.vue";
import { parseApiError } from "~/utils/apiError";

type PublicOrganization = {
  /** Null unless the viewer is a member or a site admin. */
  id: string | null;
  path: string;
  avatarUrl: string;
  name: string;
  description: string;
  websiteUrl: string;
  /** Null for anyone who isn't a member. */
  role: OrganizationRole | null;
  /** Null for visitors when an owner has hidden it. */
  memberCount: number | null;
  showMemberCount: boolean;
  /** False only for members and site admins previewing the page. */
  isPublic: boolean;
  isHidden: boolean;
  hiddenReason: string;
  posters: ProfilePoster[];
  /** Root ids matching `?search=`, or null when there is no search. */
  searchMatches: number[] | null;
};

const route = useRoute();
const handle = route.params.handle as string;

// The search runs on the server with the Discover search syntax, so a new
// search refetches the page. Filters and sorting happen on the page.
const committedSearch = computed(() =>
  typeof route.query.search === "string" ? route.query.search : undefined,
);

const {
  data: organization,
  error,
  refresh,
} = await useFetch<PublicOrganization>(
  `/api/org/${encodeURIComponent(handle)}`,
  { query: { search: committedSearch } },
);

// Ids are matched case-insensitively. Send other spellings to the lower case
// address so there is one canonical URL per organization.
if (organization.value && organization.value.path !== route.path) {
  await navigateTo(organization.value.path, {
    redirectCode: 301,
    replace: true,
  });
}

const posterCountLabel = computed(() => {
  const count = organization.value?.posters.length ?? 0;

  return `${count} ${count === 1 ? "poster" : "posters"}`;
});

const memberCountLabel = computed(() => {
  const count = organization.value?.memberCount;

  if (count === null || count === undefined) return "";

  return `${count.toLocaleString()} ${count === 1 ? "member" : "members"}`;
});

// Members manage the organization on its own page.
const canManage = computed(() =>
  Boolean(organization.value?.role && organization.value.id),
);

const seoDescription = computed(() => {
  if (!organization.value) return "Organization not found.";

  return (
    organization.value.description ||
    `Posters from ${organization.value.name} on Posters.science.`
  );
});

// The preview card shown when the page is shared, drawn by Kalai like the other
// pages. Set for X as well, which would otherwise use the site default.
const ogImage = computed(() => {
  const title = organization.value?.name ?? "Organization not found";
  const description = organization.value
    ? `${posterCountLabel.value} on Posters.science`
    : "This organization doesn't exist or is set to private.";

  return `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&app=posters-science&org=fairdataihub`;
});

useSeoMeta({
  // The title template adds " - Posters.science".
  title: () => organization.value?.name ?? "Organization",
  description: seoDescription,
  ogTitle: () =>
    organization.value
      ? `${organization.value.name} - Posters.science`
      : "Organization - Posters.science",
  ogDescription: seoDescription,
  ogImage,
  twitterImage: ogImage,
  robots: () => (organization.value?.isPublic ? undefined : "noindex"),
});

const toast = useToast();
const makingPublic = ref(false);

async function makePublic() {
  if (!organization.value?.id) return;

  makingPublic.value = true;

  try {
    await $fetch(`/api/organizations/${organization.value.id}`, {
      method: "PATCH",
      body: { profilePublic: true },
    });
    await refresh();
    toast.add({
      title: "The organization page is public",
      description: "Anyone with the link can now see this page.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not update the organization",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    makingPublic.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer class="py-10">
      <UEmpty
        v-if="error || !organization"
        icon="i-lucide-building-2"
        title="Organization not found"
        description="This organization doesn't exist or is set to private."
        :actions="[
          {
            label: 'Discover posters',
            to: '/discover',
            color: 'neutral',
            variant: 'subtle',
          },
        ]"
      />

      <div v-else class="space-y-8">
        <UAlert
          v-if="organization.isHidden"
          color="error"
          variant="subtle"
          icon="i-heroicons-eye-slash"
          title="Hidden by the Posters.science team"
          :description="`Only members and site admins can see this page. Reason: ${organization.hiddenReason}`"
        />

        <UAlert
          v-else-if="!organization.isPublic"
          color="warning"
          variant="subtle"
          icon="i-heroicons-lock-closed"
          title="This organization is private"
          description="Only its members and site admins can see this page."
          :actions="
            organization.role === 'owner'
              ? [
                  {
                    label: 'Make page public',
                    color: 'warning',
                    variant: 'solid',
                    icon: 'i-heroicons-globe-alt',
                    loading: makingPublic,
                    onClick: makePublic,
                  },
                ]
              : []
          "
        />

        <UCard>
          <div class="flex flex-col gap-6 sm:flex-row sm:items-start">
            <UAvatar
              :src="organization.avatarUrl"
              :alt="organization.name"
              size="3xl"
              class="shrink-0"
            />

            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <h1 class="min-w-0 text-2xl font-bold break-words">
                  {{ organization.name }}
                </h1>

                <UButton
                  v-if="canManage"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  icon="i-heroicons-cog-6-tooth"
                  label="Manage"
                  :to="`/organizations/${organization.id}`"
                />
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="subtle">
                  {{ posterCountLabel }}
                </UBadge>

                <UTooltip
                  v-if="memberCountLabel"
                  :disabled="organization.showMemberCount"
                  text="Hidden from visitors. Only members and site admins see this."
                >
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    :icon="
                      organization.showMemberCount
                        ? undefined
                        : 'i-heroicons-eye-slash'
                    "
                  >
                    {{ memberCountLabel }}
                  </UBadge>
                </UTooltip>

                <UButton
                  v-if="organization.websiteUrl"
                  :to="organization.websiteUrl"
                  target="_blank"
                  rel="noopener nofollow"
                  size="xs"
                  color="neutral"
                  variant="link"
                  icon="i-heroicons-link"
                  label="Website"
                />
              </div>

              <p
                v-if="organization.description"
                class="pt-2 break-words whitespace-pre-line text-gray-700 dark:text-gray-300"
              >
                {{ organization.description }}
              </p>
            </div>
          </div>
        </UCard>

        <section class="space-y-6">
          <h2 class="text-lg font-semibold">
            Posters ({{ organization.posters.length }})
          </h2>

          <ProfilePosterBrowser
            :posters="organization.posters"
            :search-matches="organization.searchMatches"
            kind="posters"
            audience="organization"
            :is-owner="false"
            :empty-description="
              organization.role
                ? 'Members choose which of their published posters appear here. Open Manage to add yours.'
                : 'This organization has no public posters yet.'
            "
          />
        </section>
      </div>
    </UContainer>
  </div>
</template>
