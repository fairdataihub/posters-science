<script setup lang="ts">
import type { MyOrganization } from "#shared/types/organization";

definePageMeta({
  middleware: ["auth"],
});

useSeoMeta({
  title: "Organizations",
  description: "The organizations you belong to on Posters.science.",
  robots: "noindex",
});

const route = useRoute();
const router = useRouter();

const { data, status, error, refresh } = await useFetch<{
  organizations: MyOrganization[];
}>("/api/organizations");

const organizations = computed(() => data.value?.organizations ?? []);

// Creating happens in a side pane that lives in the address, ?new=1, so a
// link or a refresh opens it again. Managing has its own page.
const createOpen = ref(route.query.new !== undefined);

watch(
  () => route.query.new,
  (value) => {
    createOpen.value = value !== undefined;
  },
);

// Set once an organization is created, so closing the pane doesn't clear the
// address over the move to its manage page.
let leaving = false;

watch(createOpen, (isOpen) => {
  if (!isOpen && !leaving && route.query.new !== undefined) {
    router.replace({ query: {} });
  }
});

function openCreate() {
  router.replace({ query: { new: "1" } });
}

function managePath(id: string) {
  return `/organizations/${id}`;
}

// Joining adds the organization to the list below.
function onInviteAccepted() {
  refresh();
}

function onCreated(organization: MyOrganization) {
  leaving = true;
  navigateTo(managePath(organization.id));
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer>
      <UPage>
        <UPageHeader
          title="Organizations"
          description="Organizations have a public page that lists posters from their members. Each poster still belongs to the person who published it."
          :links="[
            {
              label: 'New organization',
              icon: 'i-heroicons-plus',
              onClick: openCreate,
            },
          ]"
        />

        <UPageBody>
          <OrganizationInviteList @accepted="onInviteAccepted" />

          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-heroicons-exclamation-circle"
            title="Could not load your organizations"
            :actions="[
              {
                label: 'Try again',
                color: 'error',
                variant: 'solid',
                onClick: () => refresh(),
              },
            ]"
          />

          <UiSpinner v-else :loading="status === 'pending'" subtle>
            <UEmpty
              v-if="organizations.length === 0"
              icon="i-lucide-building-2"
              title="You aren't part of an organization yet"
              description="Create one for your lab, institute or society. You can use your current account, and you can create as many as you need."
              :actions="[
                {
                  label: 'Create an organization',
                  icon: 'i-heroicons-plus',
                  onClick: openCreate,
                },
              ]"
            />

            <ul v-else class="w-full space-y-3">
              <li v-for="organization in organizations" :key="organization.id">
                <UCard>
                  <div
                    class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div class="flex min-w-0 items-center gap-3">
                      <UAvatar
                        :src="organization.avatarUrl"
                        :alt="organization.name"
                        size="lg"
                        class="shrink-0"
                      />

                      <div class="min-w-0">
                        <NuxtLink
                          :to="managePath(organization.id)"
                          class="block font-semibold break-words hover:underline"
                        >
                          {{ organization.name }}
                        </NuxtLink>

                        <div
                          class="text-muted mt-1 flex flex-wrap items-center gap-2 text-sm"
                        >
                          <UBadge
                            :color="
                              organization.role === 'owner'
                                ? 'primary'
                                : 'neutral'
                            "
                            variant="subtle"
                            size="sm"
                          >
                            {{
                              organization.role === "owner" ? "Owner" : "Member"
                            }}
                          </UBadge>

                          <UBadge
                            v-if="organization.hidden"
                            color="error"
                            variant="subtle"
                            size="sm"
                            icon="i-heroicons-eye-slash"
                          >
                            Hidden
                          </UBadge>

                          <UBadge
                            v-else
                            :color="
                              organization.profilePublic ? 'success' : 'neutral'
                            "
                            variant="subtle"
                            size="sm"
                            :icon="
                              organization.profilePublic
                                ? 'i-heroicons-globe-alt'
                                : 'i-heroicons-lock-closed'
                            "
                          >
                            {{
                              organization.profilePublic ? "Public" : "Private"
                            }}
                          </UBadge>

                          <span>
                            {{ organization.memberCount }}
                            {{
                              organization.memberCount === 1
                                ? "member"
                                : "members"
                            }}
                          </span>

                          <span>
                            {{ organization.posterCount }}
                            {{
                              organization.posterCount === 1
                                ? "poster"
                                : "posters"
                            }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2">
                      <UButton
                        :to="organization.path"
                        size="sm"
                        color="neutral"
                        variant="subtle"
                        label="View page"
                      />

                      <UButton
                        size="sm"
                        color="neutral"
                        variant="outline"
                        icon="i-heroicons-cog-6-tooth"
                        label="Manage"
                        :to="managePath(organization.id)"
                      />
                    </div>
                  </div>
                </UCard>
              </li>
            </ul>
          </UiSpinner>
        </UPageBody>
      </UPage>
    </UContainer>

    <OrganizationCreatePane v-model:open="createOpen" @created="onCreated" />
  </div>
</template>
