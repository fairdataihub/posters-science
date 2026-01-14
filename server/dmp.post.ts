import { readBody } from "h3";

export default defineEventHandler(async (event) => {
  const body = await readBody(event); // get posted JSON from browser

  try {
    // call the Flask microservice
    const flaskUrl = process.env.WARNING_DMP_API;

    if (!flaskUrl) {
      throw createError({
        statusCode: 500,
        statusMessage: "WARNING_DMP_API is not set",
      });
    }

    return await $fetch(flaskUrl as string, {
      method: "POST",
      body,
      // If Flask requires specific headers (it doesn't by default), add them here
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(
      "[API Gateway] Error contacting Flask service:",
      err?.message ?? err,
    );
    throw createError({
      statusCode: 502,
      statusMessage: "Bad Gateway: failed to contact DMSP service",
    });
  }
});
