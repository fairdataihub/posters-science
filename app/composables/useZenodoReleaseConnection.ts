import { parseApiError } from "~/utils/apiError";
import type { ZenodoAccountDisplay } from "~/components/share/ZenodoAccountStatus.vue";

export type ZenodoReleaseStatusResponse = {
  zenodoConfigured?: boolean;
  zenodoLoginURL?: string | null;
  zenodoTokenSignIn?: boolean;
  zenodoNewTokenUrl?: string | null;
  zenodoTokensUrl?: string | null;
  zenodoToken?: boolean;
  zenodoPersonalTokenExpiresAt?: string | null;
  zenodoPersonalTokenExpired?: boolean;
  zenodoAccount?: ZenodoAccountDisplay | null;
  existingDepositions?: unknown[];
  linkedDepositionId?: number | string | null;
  linkedDeposition?: unknown;
  suggestedLicense?: string;
  isVersion?: boolean;
  message?: string;
};

export type ZenodoSignInMethod = "oauth" | "token";

export function useZenodoReleaseConnection(options?: {
  posterId?: MaybeRefOrGetter<string | null | undefined>;
  bulkJobId?: MaybeRefOrGetter<string | null | undefined>;
  /** When true, skip the status fetch until posterId is set (bulk publish step). */
  requirePosterId?: MaybeRefOrGetter<boolean>;
  analyticsPosterId?: MaybeRefOrGetter<string | undefined>;
  onReleaseData?: (data: ZenodoReleaseStatusResponse | null) => void;
  onTokenConnected?: () => void;
  onDisconnected?: () => void;
}) {
  const toast = useToast();
  const { messageFor: maintenanceMessageFor } = useMaintenance();
  const zenodoOAuthPausedMessage = computed(() =>
    maintenanceMessageFor("zenodoOAuth"),
  );

  const zenodoLoginUrl = ref("");
  const zenodoTokenSignIn = ref(false);
  const zenodoNewTokenUrl = ref("");
  const zenodoTokensUrl = ref("");
  const zenodoTokenExists = ref(false);
  const zenodoPersonalTokenExpiresAt = ref<string | null>(null);
  const zenodoPersonalTokenExpired = ref(false);
  const zenodoLoading = ref(true);
  const zenodoConfigError = ref(false);
  const zenodoUnavailableMessage = ref("");
  const zenodoAccount = ref<ZenodoAccountDisplay | null>(null);
  const zenodoDisconnecting = ref(false);
  const zenodoPersonalToken = ref("");
  const zenodoTokenConnecting = ref(false);
  const zenodoTokenError = ref("");

  const zenodoSignInTabs = [
    {
      label: "Connect with a personal token",
      icon: "i-lucide-key-round",
      value: "token" as const,
    },
    {
      label: "Connect with email and password",
      icon: "i-lucide-log-in",
      value: "oauth" as const,
    },
  ];
  const zenodoSignInTab = ref<ZenodoSignInMethod>("token");
  const zenodoSignInMethod = computed<ZenodoSignInMethod | null>(() => {
    if (zenodoLoginUrl.value && zenodoTokenSignIn.value) {
      return zenodoSignInTab.value;
    }
    if (zenodoLoginUrl.value) return "oauth";
    if (zenodoTokenSignIn.value) return "token";

    return null;
  });

  const zenodoPersonalTokenExpiresAtLabel = computed(() =>
    zenodoPersonalTokenExpiresAt.value
      ? new Date(zenodoPersonalTokenExpiresAt.value).toLocaleTimeString(
          "en-US",
          {
            hour: "numeric",
            minute: "2-digit",
          },
        )
      : "",
  );

  function applyReleaseData(data: ZenodoReleaseStatusResponse | null) {
    if (!data) return;

    zenodoLoginUrl.value = data.zenodoLoginURL ?? "";
    zenodoTokenSignIn.value = data.zenodoTokenSignIn ?? false;
    zenodoNewTokenUrl.value = data.zenodoNewTokenUrl ?? "";
    zenodoTokensUrl.value = data.zenodoTokensUrl ?? "";
    zenodoTokenExists.value = data.zenodoToken ?? false;
    zenodoPersonalTokenExpiresAt.value =
      data.zenodoPersonalTokenExpiresAt ?? null;
    zenodoPersonalTokenExpired.value = data.zenodoPersonalTokenExpired ?? false;
    if (zenodoPersonalTokenExpired.value) zenodoSignInTab.value = "token";
    zenodoConfigError.value = !data.zenodoConfigured;
    zenodoUnavailableMessage.value = !data.zenodoConfigured
      ? (data.message ??
        "Please try again later, or download your files instead.")
      : "";
    zenodoAccount.value = data.zenodoAccount ?? null;
    options?.onReleaseData?.(data);
  }

  const {
    data: zenodoData,
    pending: zenodoPending,
    error: zenodoFetchError,
    refresh: refreshZenodoStatus,
  } = useFetch<ZenodoReleaseStatusResponse>("/api/release/zenodo", {
    headers: useRequestHeaders(["cookie"]),
    method: "GET",
    params: computed(() => {
      const posterId = toValue(options?.posterId);
      const requirePosterId = toValue(options?.requirePosterId) ?? false;
      if (requirePosterId && !posterId) return undefined;

      const query: Record<string, string> = {};
      if (posterId) query.posterId = posterId;
      const bulkJobId = toValue(options?.bulkJobId);
      if (bulkJobId) query.bulkJobId = bulkJobId;

      return Object.keys(query).length > 0 ? query : undefined;
    }),
    server: false,
  });

  watch(
    [
      zenodoData,
      zenodoPending,
      zenodoFetchError,
      () => toValue(options?.posterId),
      () => toValue(options?.requirePosterId),
    ],
    ([data, pending, error, posterId, requirePosterId]) => {
      if (requirePosterId && !posterId) {
        zenodoLoading.value = false;
        zenodoConfigError.value = false;
        zenodoUnavailableMessage.value = "";

        return;
      }
      if (pending) return;
      if (error) {
        console.error("Zenodo fetch error:", error);
        zenodoConfigError.value = true;
        const { statusMessage } = parseApiError(error);
        zenodoUnavailableMessage.value =
          statusMessage ||
          "Could not load Zenodo status. Please try again later, or download your files instead.";
        zenodoLoading.value = false;

        return;
      }

      zenodoUnavailableMessage.value = "";

      applyReleaseData(data ?? null);
      zenodoLoading.value = false;
    },
    { immediate: true },
  );

  function handleZenodoSignIn() {
    if (!zenodoLoginUrl.value) return;
    window.location.href = zenodoLoginUrl.value;
  }

  async function handleZenodoTokenConnect() {
    if (!zenodoPersonalToken.value.trim() || zenodoTokenConnecting.value) {
      return;
    }

    zenodoTokenConnecting.value = true;
    zenodoTokenError.value = "";

    try {
      await $fetch("/api/zenodo/token", {
        method: "POST",
        body: { token: zenodoPersonalToken.value },
      });

      zenodoPersonalToken.value = "";
      const analyticsId = toValue(options?.analyticsPosterId);
      if (analyticsId) {
        window.umami?.track("zenodo_token_connected", {
          posterId: analyticsId,
        });
      }

      zenodoLoading.value = true;
      await refreshZenodoStatus();
      options?.onTokenConnected?.();
    } catch (error) {
      const { statusCode, statusMessage } = parseApiError(error);
      zenodoTokenError.value =
        statusMessage ?? "Could not connect to Zenodo. Please try again.";
      const analyticsId = toValue(options?.analyticsPosterId);
      if (analyticsId) {
        window.umami?.track("zenodo_token_failed", {
          posterId: analyticsId,
          status: statusCode ?? 0,
        });
      }
    } finally {
      zenodoTokenConnecting.value = false;
    }
  }

  async function handleZenodoDisconnect() {
    zenodoDisconnecting.value = true;
    try {
      await $fetch("/api/zenodo/disconnect", { method: "POST" });
      zenodoTokenExists.value = false;
      zenodoAccount.value = null;
      zenodoPersonalTokenExpiresAt.value = null;
      await refreshZenodoStatus();
      options?.onDisconnected?.();
    } catch (error) {
      toast.add({
        title: "Error disconnecting from Zenodo",
        description: error instanceof Error ? error.message : "Try again.",
        color: "error",
      });
    } finally {
      zenodoDisconnecting.value = false;
    }
  }

  return {
    zenodoLoginUrl,
    zenodoTokenSignIn,
    zenodoNewTokenUrl,
    zenodoTokensUrl,
    zenodoTokenExists,
    zenodoPersonalTokenExpiresAt,
    zenodoPersonalTokenExpired,
    zenodoLoading,
    zenodoConfigError,
    zenodoUnavailableMessage,
    zenodoAccount,
    zenodoDisconnecting,
    zenodoPersonalToken,
    zenodoTokenConnecting,
    zenodoTokenError,
    zenodoSignInTabs,
    zenodoSignInTab,
    zenodoSignInMethod,
    zenodoPersonalTokenExpiresAtLabel,
    zenodoOAuthPausedMessage,
    maintenanceMessageFor,
    refreshZenodoStatus,
    handleZenodoSignIn,
    handleZenodoTokenConnect,
    handleZenodoDisconnect,
  };
}
