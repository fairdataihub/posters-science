<script setup lang="ts">
import type { MyOrganization } from "#shared/types/organization";
import type { OrganizationDetails } from "#shared/utils/organization";
import { parseApiError } from "~/utils/apiError";

// Managing one organization: its posters, members, page and details, one tab
// each so no single view gets crowded.

definePageMeta({
  middleware: ["auth"],
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { origin } = useRequestURL();
const organizationId = route.params.id as string;

// The create form used to be its own page. Old links open the create pane.
if (organizationId === "new") {
  await navigateTo("/organizations?new=1", { replace: true });
}

const {
  data: organization,
  error,
  refresh,
} = await useFetch<MyOrganization>(
  `/api/organizations/${encodeURIComponent(organizationId)}`,
);

useSeoMeta({
  title: () => organization.value?.name ?? "Organization",
  robots: "noindex",
});

const isOwner = computed(() => organization.value?.role === "owner");

const publicUrl = computed(() =>
  organization.value ? `${origin}${organization.value.path}` : "",
);

// The tab lives in the address, ?tab=members, so a link opens it.
const TABS = ["posters", "members", "settings"] as const;
type Tab = (typeof TABS)[number];

const tabItems = computed(() => [
  { label: "Posters", value: "posters", icon: "i-lucide-image" },
  { label: "Members", value: "members", icon: "i-lucide-users" },
  {
    label: isOwner.value ? "Settings" : "Details",
    value: "settings",
    icon: "i-lucide-settings",
  },
]);

const activeTab = computed<Tab>({
  get: () => {
    const tab = route.query.tab;

    return TABS.includes(tab as Tab) ? (tab as Tab) : "posters";
  },
  set: (tab) => {
    router.replace({
      query: { ...route.query, tab: tab === "posters" ? undefined : tab },
    });
  },
});

function showError(title: string, err: unknown) {
  toast.add({
    title,
    description:
      parseApiError(err).statusMessage ?? "Something went wrong. Try again.",
    color: "error",
    icon: "i-heroicons-exclamation-circle",
  });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    toast.add({
      title: "Link copied",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch {
    toast.add({
      title: "Could not copy the link",
      color: "error",
      icon: "i-heroicons-exclamation-circle",
    });
  }
}

async function patch(
  body: Partial<OrganizationDetails> & {
    profilePublic?: boolean;
    showMemberCount?: boolean;
  },
) {
  const updated = await $fetch<MyOrganization>(
    `/api/organizations/${encodeURIComponent(organizationId)}`,
    { method: "PATCH", body },
  );

  organization.value = { ...organization.value!, ...updated };
}

const updatingVisibility = ref(false);

async function setVisibility(profilePublic: boolean) {
  updatingVisibility.value = true;

  try {
    await patch({ profilePublic });
    toast.add({
      title: profilePublic
        ? "The organization page is public"
        : "The organization page is private",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not update the organization", err);
  } finally {
    updatingVisibility.value = false;
  }
}

const updatingMemberCount = ref(false);

async function setShowMemberCount(showMemberCount: boolean) {
  updatingMemberCount.value = true;

  try {
    await patch({ showMemberCount });
    toast.add({
      title: showMemberCount
        ? "The public page shows the member count"
        : "The public page hides the member count",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not update the organization", err);
  } finally {
    updatingMemberCount.value = false;
  }
}

const saving = ref(false);

async function saveDetails(details: OrganizationDetails) {
  saving.value = true;

  try {
    await patch(details);
    toast.add({
      title: "Organization updated",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
  } catch (err: unknown) {
    showError("Could not update the organization", err);
  } finally {
    saving.value = false;
  }
}

function onLeft() {
  navigateTo("/organizations");
}

const deleteOpen = ref(false);
const deleting = ref(false);

async function deleteOrganization() {
  deleting.value = true;

  try {
    await $fetch(`/api/organizations/${encodeURIComponent(organizationId)}`, {
      method: "DELETE",
    });
    toast.add({
      title: "Organization deleted",
      color: "success",
      icon: "i-heroicons-check-circle",
    });
    deleteOpen.value = false;
    await navigateTo("/organizations");
  } catch (err: unknown) {
    showError("Could not delete the organization", err);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <UContainer>
      <UPage>
        <UEmpty
          v-if="error || !organization"
          class="py-16"
          icon="i-lucide-building-2"
          title="Organization not found"
          description="This organization doesn't exist or you aren't a member of it."
          :actions="[
            {
              label: 'Your organizations',
              to: '/organizations',
              color: 'neutral',
              variant: 'subtle',
            },
          ]"
        />

        <template v-else>
          <UPageHeader
            :links="[
              {
                label: 'View page',
                icon: 'i-heroicons-arrow-top-right-on-square',
                to: organization.path,
                color: 'neutral',
                variant: 'subtle',
              },
            ]"
          >
            <template #headline>
              <ULink
                to="/organizations"
                class="text-muted hover:text-default flex items-center gap-1 text-sm"
              >
                <UIcon name="i-heroicons-arrow-left" />
                All organizations
              </ULink>
            </template>

            <template #title>
              <span class="flex min-w-0 items-center gap-3">
                <UAvatar
                  :src="organization.avatarUrl"
                  :alt="organization.name"
                  size="lg"
                  class="shrink-0"
                />

                <span class="min-w-0 break-words">{{ organization.name }}</span>
              </span>
            </template>

            <template #description>
              <span class="flex flex-wrap items-center gap-2 text-sm">
                <UBadge
                  :color="isOwner ? 'primary' : 'neutral'"
                  variant="subtle"
                >
                  {{ isOwner ? "Owner" : "Member" }}
                </UBadge>

                <UBadge
                  v-if="organization.hidden"
                  color="error"
                  variant="subtle"
                  icon="i-heroicons-eye-slash"
                >
                  Hidden
                </UBadge>

                <UBadge
                  v-else
                  :color="organization.profilePublic ? 'success' : 'neutral'"
                  variant="subtle"
                  :icon="
                    organization.profilePublic
                      ? 'i-heroicons-globe-alt'
                      : 'i-heroicons-lock-closed'
                  "
                >
                  {{ organization.profilePublic ? "Public" : "Private" }}
                </UBadge>

                <span>
                  {{ organization.memberCount.toLocaleString() }}
                  {{ organization.memberCount === 1 ? "member" : "members" }}
                </span>

                <span>
                  {{ organization.posterCount.toLocaleString() }}
                  {{ organization.posterCount === 1 ? "poster" : "posters" }}
                </span>
              </span>
            </template>
          </UPageHeader>

          <UPageBody class="space-y-6">
            <UAlert
              v-if="organization.hidden"
              color="error"
              variant="subtle"
              icon="i-heroicons-eye-slash"
              title="Hidden by the Posters.science team"
              :description="`The public page is unavailable, and posters are not affected. Reason: ${organization.hiddenReason}`"
            />

            <UTabs
              v-model="activeTab"
              :items="tabItems"
              :content="false"
              class="w-full"
            />

            <UCard v-if="activeTab === 'posters'">
              <OrganizationPosterManager
                :organization-id="organization.id"
                :organization-name="organization.name"
                :role="organization.role"
                @changed="refresh()"
              />
            </UCard>

            <UCard v-else-if="activeTab === 'members'">
              <OrganizationMemberManager
                :key="`${organization.id}-${organization.role}`"
                :organization-id="organization.id"
                :organization-name="organization.name"
                @changed="refresh()"
                @left="onLeft"
              />
            </UCard>

            <div v-else class="space-y-6">
              <UCard>
                <template #header>
                  <h2 class="text-base font-semibold">Public page</h2>
                </template>

                <div class="space-y-3">
                  <p class="text-muted text-sm">
                    {{
                      organization.hidden
                        ? "Only members and site admins can see this page while it is hidden."
                        : organization.profilePublic
                          ? "Anyone with the link can see this organization's name, description, website and the posters its members have chosen to show. Members are never named, and search engines are asked not to index it."
                          : "Only members can see this page. Make it public to share the organization's name, description, website and the posters its members have chosen to show. Members are never named."
                    }}
                  </p>

                  <div class="flex flex-wrap items-center gap-2">
                    <code
                      class="rounded bg-gray-100 px-2 py-1 text-sm break-all dark:bg-gray-800"
                    >
                      {{ publicUrl }}
                    </code>

                    <UButton
                      size="xs"
                      color="neutral"
                      variant="subtle"
                      icon="i-heroicons-clipboard"
                      label="Copy link"
                      @click="copyLink"
                    />
                  </div>

                  <template v-if="isOwner && !organization.hidden">
                    <UButton
                      v-if="organization.profilePublic"
                      size="sm"
                      color="warning"
                      variant="subtle"
                      icon="i-heroicons-lock-closed"
                      label="Make page private"
                      :loading="updatingVisibility"
                      @click="setVisibility(false)"
                    />

                    <UButton
                      v-else
                      size="sm"
                      icon="i-heroicons-globe-alt"
                      label="Make page public"
                      :loading="updatingVisibility"
                      @click="setVisibility(true)"
                    />
                  </template>

                  <USwitch
                    v-if="isOwner"
                    :model-value="organization.showMemberCount"
                    :loading="updatingMemberCount"
                    :disabled="updatingMemberCount"
                    label="Show the number of members"
                    description="Visitors see how many members the organization has, but never who they are. Members always see the count."
                    class="border-default border-t pt-3"
                    @update:model-value="setShowMemberCount"
                  />

                  <p
                    v-else
                    class="text-muted border-default border-t pt-3 text-sm"
                  >
                    {{
                      organization.showMemberCount
                        ? "The public page shows how many members the organization has, but never who they are."
                        : "The public page doesn't show how many members the organization has."
                    }}
                    Only an owner can change this.
                  </p>
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <h2 class="text-base font-semibold">Details</h2>
                </template>

                <OrganizationDetailsForm
                  v-if="isOwner"
                  :key="organization.id"
                  :initial="{
                    name: organization.name,
                    description: organization.description,
                    websiteUrl: organization.websiteUrl,
                  }"
                  submit-label="Save changes"
                  :loading="saving"
                  @submit="saveDetails"
                />

                <dl v-else class="space-y-3 text-sm">
                  <div>
                    <dt class="font-medium">Name</dt>

                    <dd class="text-muted break-words">
                      {{ organization.name }}
                    </dd>
                  </div>

                  <div>
                    <dt class="font-medium">Description</dt>

                    <dd class="text-muted break-words whitespace-pre-line">
                      {{ organization.description || "None yet" }}
                    </dd>
                  </div>

                  <div>
                    <dt class="font-medium">Website</dt>

                    <dd class="text-muted break-all">
                      {{ organization.websiteUrl || "None yet" }}
                    </dd>
                  </div>

                  <p class="text-muted">
                    Only an owner can change these details.
                  </p>
                </dl>
              </UCard>

              <UCard v-if="isOwner">
                <template #header>
                  <h2 class="text-base font-semibold">Delete organization</h2>
                </template>

                <div class="space-y-3">
                  <p class="text-muted text-sm">
                    {{
                      organization.hidden
                        ? "A hidden organization can't be deleted. Contact the Posters.science team if you need it removed."
                        : "This removes the page, its members and its list of posters. The posters themselves stay published and keep their owners."
                    }}
                  </p>

                  <UButton
                    size="sm"
                    color="error"
                    variant="subtle"
                    icon="i-heroicons-trash"
                    label="Delete organization"
                    :disabled="organization.hidden"
                    @click="deleteOpen = true"
                  />
                </div>
              </UCard>
            </div>
          </UPageBody>
        </template>
      </UPage>
    </UContainer>

    <UModal
      v-model:open="deleteOpen"
      title="Delete organization"
      :description="`Delete ${organization?.name ?? 'this organization'}? This can't be undone. Its posters stay published and keep their owners.`"
    >
      <template #footer="{ close }">
        <div class="flex w-full items-center justify-between gap-3">
          <UButton
            color="neutral"
            variant="subtle"
            label="Cancel"
            @click="close"
          />

          <UButton
            color="error"
            label="Delete organization"
            :loading="deleting"
            @click="deleteOrganization"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
