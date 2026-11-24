<script setup lang="ts">
import { resolveDoiUrl } from "#shared/utils/doi";
import { parseApiError } from "~/utils/apiError";

const props = defineProps<{
  posterId: string;
  posterDetailsUrl: string;
}>();

const emit = defineEmits<{ published: [] }>();

type FigshareStatus = {
  configured: boolean;
  paused: boolean;
  oauthAvailable: boolean;
  tokenSignIn: boolean;
  /** Outside production, publishing stops at a private draft. */
  draftOnly?: boolean;
  applicationsUrl: string;
  familyRepository: "zenodo" | "figshare" | null;
  isVersion: boolean;
  linked: { articleId: number; status: string; url: string | null } | null;
  connected: boolean;
  tokenType?: string;
  expiresAt?: string | null;
  account?: {
    name: string;
    email?: string;
    orcid?: string;
    institutional: boolean;
  };
  message?: string;
  personalTokenExpired?: boolean;
  optionsError?: string;
  licenses?: { value: number; name: string; url?: string }[];
  categories?: {
    id: number;
    title: string;
    parentId: number | null;
    path: string | null;
    selectable: boolean;
  }[];
  suggestedLicenseId?: number | null;
  suggestedCategoryIds?: number[];
  missing?: string[];
};

const route = useRoute();
const toast = useToast();

const {
  data: status,
  pending: statusPending,
  error: statusError,
  refresh: refreshStatus,
} = useFetch<FigshareStatus>("/api/release/figshare", {
  query: { posterId: props.posterId },
  server: false,
});

// Sign-in method tabs, shown when both ways are available.
const signInTabs = [
  {
    label: "Connect with a personal token",
    icon: "i-lucide-key-round",
    value: "token" as const,
  },
  {
    label: "Sign in with Figshare",
    icon: "i-lucide-log-in",
    value: "oauth" as const,
  },
];
// Coming back from Sign in with Figshare with an error opens that tab again.
const signInTab = ref<"token" | "oauth">(
  route.query.figshareError ? "oauth" : "token",
);
const signInMethod = computed<"token" | "oauth" | null>(() => {
  const value = status.value;

  if (!value) return null;
  if (value.oauthAvailable && value.tokenSignIn) return signInTab.value;
  if (value.oauthAvailable) return "oauth";
  if (value.tokenSignIn) return "token";

  return null;
});

const oauthError = computed(() => {
  const value = route.query.figshareError;
  // A short OAuth error code from the callback, such as invalid_request.
  const reason =
    typeof route.query.figshareReason === "string" &&
    /^[a-z_]{1,64}$/.test(route.query.figshareReason)
      ? route.query.figshareReason
      : "";

  if (value === "declined") {
    return "You cancelled signing in on Figshare. Try again, or connect with a personal token instead.";
  }

  if (value === "refused") {
    return `Figshare didn't sign you in${reason ? ` (Figshare said: ${reason})` : ""}. Try again, or connect with a personal token instead.`;
  }

  if (value === "exchange") {
    return "Figshare didn't finish connecting your account. Try again in a few minutes, or connect with a personal token instead.";
  }

  return "";
});

function signInWithFigshare() {
  window.umami?.track("figshare_oauth_started", { posterId: props.posterId });
  window.location.href = `/api/figshare/authorize?posterId=${encodeURIComponent(props.posterId)}`;
}

const personalToken = ref("");
const tokenConnecting = ref(false);
const tokenError = ref("");

async function connectWithToken() {
  if (!personalToken.value.trim() || tokenConnecting.value) return;

  tokenConnecting.value = true;
  tokenError.value = "";

  try {
    await $fetch("/api/figshare/token", {
      method: "POST",
      body: { token: personalToken.value },
    });

    personalToken.value = "";
    window.umami?.track("figshare_token_connected", {
      posterId: props.posterId,
    });
    await refreshStatus();
  } catch (error) {
    const { statusMessage } = parseApiError(error);

    tokenError.value =
      statusMessage ?? "Could not connect to Figshare. Please try again.";
  } finally {
    tokenConnecting.value = false;
  }
}

const disconnecting = ref(false);

async function disconnect() {
  disconnecting.value = true;

  try {
    await $fetch("/api/figshare/disconnect", { method: "POST" });
    await refreshStatus();
  } catch (error) {
    toast.add({
      title: "Could not disconnect from Figshare",
      description: error instanceof Error ? error.message : "Try again.",
      color: "error",
    });
  } finally {
    disconnecting.value = false;
  }
}

const expiresAtLabel = computed(() =>
  status.value?.tokenType === "personal" && status.value.expiresAt
    ? new Date(status.value.expiresAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "",
);

// Form choices
const selectedLicenseId = ref<number | undefined>(undefined);
const selectedCategoryIds = ref<number[]>([]);

watch(
  status,
  (value) => {
    if (!value) return;

    if (selectedLicenseId.value === undefined && value.suggestedLicenseId) {
      selectedLicenseId.value = value.suggestedLicenseId;
    }

    if (
      selectedCategoryIds.value.length === 0 &&
      value.suggestedCategoryIds?.length
    ) {
      selectedCategoryIds.value = [...value.suggestedCategoryIds];
    }
  },
  { immediate: true },
);

const licenseItems = computed(() =>
  (status.value?.licenses ?? []).map((license) => ({
    label: license.name,
    value: license.value,
  })),
);

// Figshare's category list holds parents and the categories under them. Only
// selectable ones are offered, with their parent as a hint.
const categoryItems = computed(() => {
  const categories = status.value?.categories ?? [];
  const titles = new Map(categories.map((entry) => [entry.id, entry.title]));

  return categories
    .filter((entry) => entry.selectable)
    .map((entry) => {
      const parent = entry.parentId ? titles.get(entry.parentId) : undefined;

      return {
        label: entry.title,
        value: entry.id,
        ...(parent && { description: parent }),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
});

const missing = computed(() => status.value?.missing ?? []);
const underReview = computed(() => status.value?.linked?.status === "review");
const isFigshareVersion = computed(
  () => status.value?.familyRepository === "figshare",
);

const readyToPublish = computed(
  () =>
    !!status.value?.connected &&
    !status.value.optionsError &&
    missing.value.length === 0 &&
    !!selectedLicenseId.value &&
    selectedCategoryIds.value.length > 0,
);

// Publication progress
type Step = {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "error";
};

const defaultSteps = (): Step[] => [
  { id: "deposition", label: "Preparing the Figshare item", status: "pending" },
  { id: "upload_metadata", label: "Sending metadata", status: "pending" },
  { id: "upload_files", label: "Uploading poster files", status: "pending" },
  {
    id: "publish",
    label: status.value?.draftOnly
      ? "Publishing (skipped on this site)"
      : "Publishing on Figshare",
    status: "pending",
  },
];

const publishing = ref(false);
const publishError = ref("");
const publishComplete = ref(false);
const publishResult = ref<{
  articleId?: number;
  doi?: string;
  url?: string;
  version?: number;
  underReview?: boolean;
  draftOnly?: boolean;
  privateUrl?: string;
} | null>(null);
const steps = ref<Step[]>(defaultSteps());

const resultUrl = computed(() => {
  const result = publishResult.value;

  if (!result) return "";
  if (result.doi) return resolveDoiUrl(result.doi);

  return result.url ?? "";
});

function resetPublish() {
  publishing.value = false;
  publishError.value = "";
  publishComplete.value = false;
  publishResult.value = null;
  steps.value = defaultSteps();
}

function handleEvent(event: {
  step: string;
  status: string;
  message?: string;
  data?: Record<string, unknown>;
}) {
  if (event.step === "complete") {
    publishComplete.value = true;
    publishResult.value = (event.data ?? null) as typeof publishResult.value;
    steps.value.forEach((step) => {
      if (step.status !== "error" && step.status !== "skipped") {
        step.status = "completed";
      }
    });

    // A private draft leaves the poster unpublished, so the page stays put.
    if (publishResult.value?.draftOnly) {
      window.umami?.track("figshare_draft_created", {
        posterId: props.posterId,
      });

      return;
    }

    window.umami?.track("figshare_publish_completed", {
      posterId: props.posterId,
    });

    if (!publishResult.value?.underReview) {
      setTimeout(() => emit("published"), 3000);
    }

    return;
  }

  if (event.step === "error") {
    publishError.value = event.message || "An error occurred";
    window.umami?.track("figshare_publish_error", {
      posterId: props.posterId,
    });

    const active = steps.value.find((step) => step.status === "in_progress");

    if (active) active.status = "error";

    return;
  }

  const step = steps.value.find((entry) => entry.id === event.step);

  if (step) step.status = event.status as Step["status"];
}

async function publish() {
  resetPublish();
  publishing.value = true;
  window.umami?.track("figshare_publish_started", { posterId: props.posterId });

  try {
    const response = await fetch("/api/release/figshare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        posterId: props.posterId,
        licenseId: selectedLicenseId.value,
        categoryIds: selectedCategoryIds.value,
      }),
    });

    if (!response.ok || !response.body) {
      const detail = (await response.json().catch(() => null)) as {
        statusMessage?: string;
        message?: string;
      } | null;

      publishError.value =
        detail?.statusMessage ||
        detail?.message ||
        `Request failed (${response.status} ${response.statusText})`;

      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const consume = (part: string) => {
      const dataLine = part
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) return;

      try {
        handleEvent(JSON.parse(dataLine.slice(6)));
      } catch {
        // skip malformed events
      }
    };

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");

      buffer = parts.pop() || "";
      parts.forEach(consume);
    }

    if (buffer.trim()) consume(buffer);
  } catch (error) {
    publishError.value =
      (error as Error).message || "An unexpected error occurred";
  }
}
</script>

<template>
  <div class="border-default rounded-xl border p-6">
    <div class="mb-4 flex items-center gap-2">
      <UIcon name="i-simple-icons-figshare" class="size-6" />

      <h3 class="text-lg font-semibold">Publish to Figshare</h3>
    </div>

    <p class="mb-5 text-sm">
      <ULink
        to="https://figshare.com"
        target="_blank"
        class="text-primary underline"
        >Figshare</ULink
      >
      is a repository where researchers share posters, figures, datasets and
      other outputs. Your poster is published on your own Figshare account with
      a DOI, as an item of type Poster.
    </p>

    <UiSpinner v-if="statusPending && !status" class="py-8" />

    <UAlert
      v-else-if="statusError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-x"
      title="Figshare publishing isn't available right now"
      :description="
        parseApiError(statusError).statusMessage ||
        'Please try again later, or download your files instead.'
      "
    />

    <UAlert
      v-else-if="status && !status.configured"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-x"
      title="Figshare publishing isn't available right now"
      description="Please try again later, or download your files instead."
    />

    <MaintenanceNotice v-else-if="status?.paused" maintenance-key="figshare" />

    <UAlert
      v-else-if="status?.familyRepository === 'zenodo'"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Earlier versions of this poster are on Zenodo"
      description="New versions go to the same repository as the earlier ones, so publish this version to Zenodo."
    />

    <!-- Not connected -->
    <template v-else-if="status && !status.connected">
      <UAlert
        v-if="oauthError"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        class="mb-4"
        :title="oauthError"
      />

      <UAlert
        v-if="status.message"
        color="warning"
        variant="soft"
        :icon="status.personalTokenExpired ? 'i-lucide-clock' : 'i-lucide-info'"
        class="mb-4"
        :title="status.message"
      />

      <p class="mb-5 text-sm">
        If you don't have a Figshare account yet, create one at
        <ULink
          to="https://figshare.com"
          target="_blank"
          class="text-primary underline"
          >figshare.com</ULink
        >
        first. Then connect it with Posters.science
        {{
          status.oauthAvailable && status.tokenSignIn
            ? "using one of the two options below:"
            : "using the option below:"
        }}
      </p>

      <UTabs
        v-if="status.oauthAvailable && status.tokenSignIn"
        v-model="signInTab"
        :items="signInTabs"
        :content="false"
        class="mb-5 w-full"
      />

      <template v-if="signInMethod === 'oauth'">
        <p class="mb-4 text-sm">
          You will be sent to Figshare to sign in and allow Posters.science to
          publish on your behalf, then brought back here.
        </p>

        <UButton color="primary" size="lg" @click="signInWithFigshare">
          Sign in to Figshare
        </UButton>
      </template>

      <div v-else-if="signInMethod === 'token'">
        <h4 class="mb-4 text-sm font-semibold">
          Connect your Figshare account with a personal token
        </h4>

        <ol class="mb-5 list-inside list-decimal space-y-2 text-sm">
          <li>Sign in to your Figshare account.</li>

          <li>
            Open the
            <ULink
              :to="status.applicationsUrl"
              target="_blank"
              class="text-primary underline"
              >Integrations page</ULink
            >
            (your user icon in the top right, then Integrations).
          </li>

          <li>
            Scroll to Personal tokens and click Create Personal Token. Describe
            it as Posters.science and save it.
          </li>

          <li>
            Copy the token and paste it below. Figshare only shows it once.
          </li>
        </ol>

        <form class="mb-5" @submit.prevent="connectWithToken">
          <UFormField
            label="Personal token"
            name="figsharePersonalToken"
            :error="tokenError || undefined"
          >
            <div class="flex flex-col gap-3 sm:flex-row">
              <UInput
                v-model="personalToken"
                type="password"
                autocomplete="off"
                spellcheck="false"
                data-1p-ignore
                data-lpignore="true"
                placeholder="Paste your token"
                class="w-full sm:max-w-md"
                :disabled="tokenConnecting"
              />

              <UButton
                type="submit"
                color="primary"
                :loading="tokenConnecting"
                :disabled="!personalToken.trim()"
              >
                Connect to Figshare
              </UButton>
            </div>
          </UFormField>
        </form>

        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-clock"
          title="We keep your token for one hour at most"
        >
          <template #description>
            Figshare personal tokens give full access to your Figshare account,
            because Figshare has no narrower permission. We check the token with
            Figshare, store it encrypted and only use it to publish the posters
            you choose. We delete it from Posters.science one hour after you
            connect, or sooner if you disconnect. The token stays active on
            Figshare until you delete it on the
            <ULink
              :to="status.applicationsUrl"
              target="_blank"
              class="text-primary underline"
              >Integrations page</ULink
            >.
          </template>
        </UAlert>
      </div>
    </template>

    <!-- Connected -->
    <template v-else-if="status?.connected">
      <div
        class="border-default mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
      >
        <div class="flex min-w-0 items-center gap-3">
          <UIcon
            name="i-lucide-circle-check"
            class="text-success size-5 shrink-0"
          />

          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              Connected as {{ status.account?.name }}
            </p>

            <p
              v-if="status.account?.email || status.account?.institutional"
              class="text-muted truncate text-xs"
            >
              {{ status.account?.email }}
              <template v-if="status.account?.institutional">
                {{ status.account?.email ? " · " : "" }}Institutional account
              </template>
            </p>
          </div>
        </div>

        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :loading="disconnecting"
          @click="disconnect"
        >
          Disconnect
        </UButton>
      </div>

      <p v-if="expiresAtLabel" class="text-muted mb-4 text-xs">
        Connected with a personal token. We will delete it from Posters.science
        at {{ expiresAtLabel }}. You can also delete it on Figshare under
        Integrations.
      </p>

      <!-- Progress -->
      <template v-if="publishing">
        <div class="space-y-3">
          <div
            v-for="step in steps"
            :key="step.id"
            class="flex items-center gap-3"
          >
            <UIcon
              v-if="step.status === 'completed'"
              name="i-lucide-circle-check"
              class="text-success size-5 shrink-0"
            />

            <UIcon
              v-else-if="step.status === 'in_progress'"
              name="i-lucide-loader"
              class="text-primary size-5 shrink-0 animate-spin"
            />

            <UIcon
              v-else-if="step.status === 'error'"
              name="i-lucide-circle-x"
              class="text-error size-5 shrink-0"
            />

            <UIcon
              v-else-if="step.status === 'skipped'"
              name="i-lucide-circle-minus"
              class="text-muted size-5 shrink-0"
            />

            <UIcon
              v-else
              name="i-lucide-circle-dashed"
              class="text-muted size-5 shrink-0"
            />

            <span
              :class="[
                step.status === 'completed' && 'text-success',
                step.status === 'in_progress' && 'text-highlighted font-medium',
                step.status === 'error' && 'text-error',
                (step.status === 'pending' || step.status === 'skipped') &&
                  'text-muted',
              ]"
            >
              {{ step.label }}
            </span>
          </div>
        </div>

        <div v-if="publishError" class="mt-5">
          <p class="text-error mb-3 text-sm">{{ publishError }}</p>

          <UButton color="primary" @click="resetPublish">Try Again</UButton>
        </div>

        <div
          v-if="publishComplete && publishResult?.draftOnly"
          class="mt-5 flex flex-col gap-4"
        >
          <UAlert
            color="info"
            variant="subtle"
            icon="i-lucide-flask-conical"
            title="Private draft ready on Figshare"
            description="This site doesn't publish to Figshare. The draft has your metadata and files, and only you can see it. Your poster is still unpublished here. Delete the draft on Figshare when you're done checking it, or run this again to update it."
          />

          <p v-if="publishResult.doi" class="text-muted text-sm">
            Reserved DOI, active only once published:
            <span class="font-mono">{{ publishResult.doi }}</span>
          </p>

          <div class="flex flex-wrap items-center gap-3">
            <UButton
              v-if="publishResult.privateUrl"
              color="primary"
              icon="i-lucide-external-link"
              :href="publishResult.privateUrl"
              target="_blank"
              rel="noopener noreferrer"
              external
            >
              Open the private draft
            </UButton>

            <UButton variant="outline" @click="resetPublish">
              Back to the form
            </UButton>
          </div>
        </div>

        <div v-else-if="publishComplete" class="mt-5 flex flex-col gap-4">
          <UAlert
            v-if="publishResult?.underReview"
            color="info"
            variant="subtle"
            icon="i-lucide-hourglass"
            title="Submitted to your institution's Figshare for review"
            description="Your institution reviews items before they are public. Once it approves the poster, come back here and publish again to finish. Nothing is sent to Figshare twice."
          />

          <template v-else>
            <UAlert
              color="success"
              variant="subtle"
              icon="i-lucide-circle-check"
              title="Your poster has been published to Figshare!"
            />

            <p class="text-sm">
              Your poster is also registered in Posters.science and is
              discoverable under
              <NuxtLink to="/discover" class="text-primary font-medium"
                >Find Posters</NuxtLink
              >.
            </p>
          </template>

          <div class="flex flex-wrap items-center gap-3">
            <UButton
              v-if="resultUrl"
              color="primary"
              icon="i-lucide-external-link"
              :href="resultUrl"
              target="_blank"
              rel="noopener noreferrer"
              external
            >
              View on Figshare
            </UButton>

            <UButton
              v-if="!publishResult?.underReview"
              variant="outline"
              :to="posterDetailsUrl"
            >
              View Poster Details
            </UButton>
          </div>
        </div>
      </template>

      <!-- Form -->
      <template v-else>
        <UAlert
          v-if="status.optionsError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          class="mb-4"
          :title="status.optionsError"
        >
          <template #actions>
            <UButton size="xs" variant="outline" @click="() => refreshStatus()">
              Try again
            </UButton>
          </template>
        </UAlert>

        <UAlert
          v-if="status.draftOnly"
          color="info"
          variant="subtle"
          icon="i-lucide-flask-conical"
          class="mb-4"
          title="Test site: nothing is published to Figshare"
          description="Here the button creates your poster's Figshare item as a private draft with its metadata and files, then stops. Only you can see the draft, and you can delete it on Figshare. Real publishing happens only on posters.science."
        />

        <UAlert
          v-if="underReview"
          color="info"
          variant="subtle"
          icon="i-lucide-hourglass"
          class="mb-4"
          title="Waiting for your institution's review"
          description="This poster was submitted to your institution's Figshare and is waiting for its review. Publish again to check whether it is public yet; nothing is sent to Figshare twice."
        />

        <UAlert
          v-if="missing.length > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          class="mb-4"
          title="Figshare needs a few more details"
        >
          <template #description>
            <ul class="list-inside list-disc">
              <li v-for="item in missing" :key="item">{{ item }}</li>
            </ul>
          </template>

          <template #actions>
            <UButton size="xs" variant="outline" :to="`/share/${posterId}`">
              Edit metadata
            </UButton>
          </template>
        </UAlert>

        <p v-if="isFigshareVersion" class="text-muted mb-4 text-sm">
          This will be published as a new version of your poster's existing
          Figshare item. Figshare numbers its versions itself.
        </p>

        <div class="flex max-w-xl flex-col gap-5">
          <UFormField
            label="Categories"
            required
            help="Pick the closest fields. Figshare requires at least one."
          >
            <USelectMenu
              v-model="selectedCategoryIds"
              :items="categoryItems"
              value-key="value"
              multiple
              :virtualize="true"
              placeholder="Search categories"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="License"
            required
            help="Only the licenses your Figshare account offers are listed."
          >
            <USelect
              v-model="selectedLicenseId"
              :items="licenseItems"
              placeholder="Select a license"
              class="w-full"
            />
          </UFormField>
        </div>

        <p class="text-muted mt-5 max-w-xl text-xs">
          Figshare has no fields for affiliations, language, funder identifiers
          or most conference details. The conference goes into the description,
          and everything else stays in poster.json, which is uploaded with your
          poster. Once published, a Figshare item can't be deleted, only updated
          with new versions.
        </p>

        <div class="mt-6">
          <UButton
            color="primary"
            size="lg"
            :disabled="!readyToPublish"
            @click="publish"
          >
            {{
              status.draftOnly
                ? "Create private draft on Figshare"
                : underReview
                  ? "Check review and finish"
                  : "Publish to Figshare"
            }}
          </UButton>
        </div>
      </template>
    </template>
  </div>
</template>
