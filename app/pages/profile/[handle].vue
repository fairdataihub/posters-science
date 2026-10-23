<script setup lang="ts">
import { parseApiError } from "~/utils/apiError";
import type { ProfilePoster } from "~/components/profile/PosterCard.vue";

type PublicProfile = {
  path: string;
  givenName: string;
  familyName: string;
  affiliation: string;
  bio: string;
  avatarUrl: string;
  orcid: string | null;
  memberSince: string;
  isOwner: boolean;
  /** False only when the owner is previewing their own private profile. */
  isPublic: boolean;
  posters: ProfilePoster[];
  /** Null unless the owner chose to show their liked posters. */
  likedPosters: ProfilePoster[] | null;
  /** Root ids matching `?search=`, or null when there is no search. */
  searchMatches: number[] | null;
};

const route = useRoute();
const router = useRouter();
const handle = route.params.handle as string;

// The search runs on the server with the Discover search syntax, so a new
// search refetches the profile. Filters and sorting happen on the page.
const committedSearch = computed(() =>
  typeof route.query.search === "string" ? route.query.search : undefined,
);

const {
  data: profile,
  error,
  refresh,
} = await useFetch<PublicProfile>(
  `/api/profile/${encodeURIComponent(handle)}`,
  { query: { search: committedSearch } },
);

// Ids are matched case-insensitively. Send other spellings to the lower case
// address so there is one canonical URL per profile.
if (profile.value && profile.value.path !== route.path) {
  await navigateTo(profile.value.path, { redirectCode: 301, replace: true });
}

const displayName = computed(() => {
  const name =
    `${profile.value?.givenName ?? ""} ${profile.value?.familyName ?? ""}`.trim();

  return name || "Posters.science author";
});

const posterCountLabel = computed(() => {
  const count = profile.value?.posters.length ?? 0;

  return `${count} ${count === 1 ? "poster" : "posters"}`;
});

const orcidUrl = computed(() => {
  const orcid = profile.value?.orcid;

  if (!orcid) return "";

  return orcid.startsWith("http") ? orcid : `https://orcid.org/${orcid}`;
});

// The tab lives in the query string, like the filters, so it survives a
// reload and can be shared.
const showLikes = computed(() => profile.value?.likedPosters != null);

const activeTab = computed({
  get: () =>
    showLikes.value && route.query.tab === "liked" ? "liked" : "posters",
  set: (tab: string) =>
    router.replace({
      query: { ...route.query, tab: tab === "liked" ? "liked" : undefined },
    }),
});

// Always rendered as tabs, so the page looks the same with or without likes.
const tabItems = computed(() => [
  {
    label: `Posters (${profile.value?.posters.length ?? 0})`,
    icon: "i-lucide-presentation",
    value: "posters",
  },
  ...(showLikes.value
    ? [
        {
          label: `Liked (${profile.value?.likedPosters?.length ?? 0})`,
          icon: "i-heroicons-heart",
          value: "liked",
        },
      ]
    : []),
]);

const seoDescription = computed(() => {
  if (!profile.value) return "Profile not found.";

  return (
    profile.value.bio || `Posters by ${displayName.value} on Posters.science.`
  );
});

// Owners can open their own private profile to preview it. The banner says so
// and lets them publish it from here.
const toast = useToast();
const makingPublic = ref(false);

async function makeProfilePublic() {
  makingPublic.value = true;

  try {
    await $fetch("/api/user", {
      method: "PATCH",
      body: { profilePublic: true },
    });
    await refresh();
    toast.add({
      title: "Your profile is public",
      description: "Anyone with the link can now see this page.",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    toast.add({
      title: "Could not update your profile",
      description:
        parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  } finally {
    makingPublic.value = false;
  }
}

// The preview card shown when the profile is shared, drawn by Kalai like the
// other pages. Set for X as well, which would otherwise use the site default.
const ogImage = computed(() => {
  const title = profile.value ? displayName.value : "Profile not found";
  const description = profile.value
    ? [
        profile.value.affiliation,
        `${posterCountLabel.value} on Posters.science`,
      ]
        .filter(Boolean)
        .join(". ")
    : "This profile doesn't exist or is set to private.";

  return `https://kalai.fairdataihub.org/api/generate?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&app=posters-science&org=fairdataihub`;
});

useSeoMeta({
  // The title template adds " - Posters.science".
  title: () => (profile.value ? displayName.value : "Profile"),
  description: seoDescription,
  ogTitle: () =>
    profile.value
      ? `${displayName.value} - Posters.science`
      : "Profile - Posters.science",
  ogDescription: seoDescription,
  ogImage,
  twitterImage: ogImage,
  robots: () => (profile.value?.isPublic ? undefined : "noindex"),
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer class="py-10">
      <UEmpty
        v-if="error || !profile"
        icon="i-heroicons-user-circle"
        title="Profile not found"
        description="This profile doesn't exist or is set to private."
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
          v-if="!profile.isPublic"
          color="warning"
          variant="subtle"
          icon="i-heroicons-lock-closed"
          title="Your profile is private"
          description="Only you can see this page. Make it public to share it with others."
          :actions="[
            {
              label: 'Make profile public',
              color: 'warning',
              variant: 'solid',
              icon: 'i-heroicons-globe-alt',
              loading: makingPublic,
              onClick: makeProfilePublic,
            },
            {
              label: 'Settings',
              to: '/profile',
              color: 'neutral',
              variant: 'ghost',
            },
          ]"
        />

        <UCard>
          <div class="flex flex-col gap-6 sm:flex-row sm:items-start">
            <UAvatar
              :src="profile.avatarUrl"
              :alt="displayName"
              size="3xl"
              class="shrink-0"
            />

            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <h1 class="text-2xl font-bold break-words">
                    {{ displayName }}
                  </h1>

                  <p
                    v-if="profile.affiliation"
                    class="text-gray-600 dark:text-gray-400"
                  >
                    {{ profile.affiliation }}
                  </p>
                </div>

                <UButton
                  v-if="profile.isOwner"
                  to="/profile"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  icon="i-heroicons-pencil-square"
                >
                  Edit profile
                </UButton>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <ULink v-if="profile.orcid" :to="orcidUrl" target="_blank">
                  <UBadge
                    color="success"
                    variant="subtle"
                    icon="simple-icons:orcid"
                  >
                    {{ profile.orcid.replace("https://orcid.org/", "") }}
                  </UBadge>
                </ULink>

                <UBadge color="neutral" variant="subtle">
                  {{ posterCountLabel }}
                </UBadge>
              </div>

              <p
                v-if="profile.bio"
                class="pt-2 whitespace-pre-line text-gray-700 dark:text-gray-300"
              >
                {{ profile.bio }}
              </p>
            </div>
          </div>
        </UCard>

        <section class="space-y-6">
          <UTabs
            v-model="activeTab"
            :items="tabItems"
            :content="false"
            variant="link"
            class="w-full"
          />

          <ProfilePosterBrowser
            :key="activeTab"
            :posters="
              activeTab === 'liked'
                ? (profile.likedPosters ?? [])
                : profile.posters
            "
            :search-matches="profile.searchMatches"
            :kind="activeTab === 'liked' ? 'liked' : 'posters'"
            :is-owner="profile.isOwner"
          />
        </section>
      </div>
    </UContainer>
  </div>
</template>
