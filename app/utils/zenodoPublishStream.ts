export type ZenodoStreamEvent = {
  step: string;
  status: string;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
};

export type ZenodoPublishRequest = {
  posterId: string;
  mode?: "new" | "existing";
  existingDepositionId?: number;
  license?: string;
  version?: string;
};

export type ZenodoPublishStreamResult = {
  success: boolean;
  error?: string;
  recordUrl?: string;
};

function recordUrlFromEventData(
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) return undefined;

  const url = data.recordUrl;
  if (typeof url === "string" && url.length > 0) return url;

  const doi = data.doi;
  if (typeof doi === "string" && doi.trim()) {
    const trimmed = doi.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://doi.org/${trimmed.replace(/^doi:\s*/i, "")}`;
  }

  const recordId = data.recordId;
  if (typeof recordId === "number" && Number.isFinite(recordId)) {
    return `https://zenodo.org/records/${recordId}`;
  }

  return undefined;
}

/** POST /api/release/zenodo and consume the SSE response until complete or error. */
export async function publishPosterViaZenodoStream(
  body: ZenodoPublishRequest,
): Promise<ZenodoPublishStreamResult> {
  const response = await fetch("/api/release/zenodo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      posterId: body.posterId,
      mode: body.mode ?? "new",
      existingDepositionId: body.existingDepositionId,
      license: body.license || undefined,
      version: body.version,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = (await response.json().catch(() => null)) as {
      statusMessage?: string;
      message?: string;
    } | null;

    return {
      success: false,
      error:
        detail?.statusMessage ||
        detail?.message ||
        `Request failed (${response.status} ${response.statusText})`,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastError: string | undefined;
  let recordUrl: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const dataLine = part.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      try {
        const event = JSON.parse(dataLine.slice(6)) as ZenodoStreamEvent;
        if (event.step === "complete") {
          recordUrl = recordUrlFromEventData(event.data);
          return { success: true, recordUrl };
        }
        if (event.step === "error") {
          lastError = event.message || event.error || "Publication failed";
        }
      } catch {
        // skip malformed events
      }
    }
  }

  if (lastError) {
    return { success: false, error: lastError };
  }

  return { success: false, error: "Publication ended without a result" };
}
