import { readBody, createError } from "h3";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const flaskUrl = process.env.WARNING_DMP_API;
  if (!flaskUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: "WARNING_DMP_API is not set",
    });
  }

  try {
    return await $fetch(flaskUrl, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
      // IMPORTANT: prevent premature gateway failure
      timeout: 300_000, // 5 minutes
    });
  } catch (err: any) {
    // Log full upstream error for debugging
    console.error("[API Gateway] Upstream error:", err);

    // Preserve upstream status + message instead of forcing 502
    throw createError({
      statusCode: err?.response?.status ?? 500,
      statusMessage:
        typeof err?.response?._data === "string"
          ? err.response._data
          : JSON.stringify(err?.response?._data ?? err?.message),
    });
  }
});
