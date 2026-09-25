type ApiError = {
  statusCode?: number;
  statusMessage?: string;
  reason?: string;
};

/**
 * Normalize a failed $fetch into the parts the UI actually branches on.
 *
 * Nitro serializes createError into the response body, so the status message
 * and any extra `data` sit under `error.data` rather than on the error itself.
 *
 * A request that never got a response (offline, server down) still has a
 * `data` property, but it is undefined. Any field can therefore be missing, so
 * callers should always supply a fallback message.
 */
export const parseApiError = (error: unknown): ApiError => {
  if (!error || typeof error !== "object") {
    return {};
  }

  const candidate = error as {
    statusCode?: number;
    response?: { status?: number };
    data?: {
      statusCode?: number;
      statusMessage?: string;
      data?: { reason?: string };
    };
  };

  return {
    statusCode:
      candidate.statusCode ??
      candidate.response?.status ??
      candidate.data?.statusCode,
    statusMessage: candidate.data?.statusMessage,
    reason: candidate.data?.data?.reason,
  };
};
