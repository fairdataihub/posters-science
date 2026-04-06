import { readBody, createError, defineEventHandler } from "h3";

export default defineEventHandler(async (event) => {
  // 1️⃣ Read the incoming request body
  let rawBody;
  try {
    rawBody = await readBody(event);
  } catch (err) {
    console.error('[H3 Error] Failed to read request body:', err);
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid request body',
      data: err
    });
  }

  // 2️⃣ Build the payload to send to Flask
  const body = {
    title: rawBody.title || "Untitled Project",
    agency: rawBody.agency || "Not specified",
    projectSummary: rawBody.projectSummary || "Not provided",
    dataType: rawBody.dataType || "Not specified",
    dataSource: rawBody.dataSource || "Not specified",
    humanSubjects: rawBody.humanSubjects || "No",
    dataSharing: rawBody.dataSharing || "Not specified",
    dataVolume: rawBody.dataVolume || "Not specified"
  };

  console.log('[H3] Sending to Flask:', JSON.stringify(body));

  // 3️⃣ Flask endpoint
  const flaskUrl = 'http://100.81.132.45:40925/query';
  if (!flaskUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: "Flask URL is not set"
    });
  }

  // 4️⃣ Send POST request using native fetch
  try {
    const response = await fetch(flaskUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Note: fetch timeout is not built-in. Can wrap in AbortController if needed
    });

    console.log('[H3] Flask responded with status:', response.status);

    // Check if response is JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data;
    } else {
      const text = await response.text();
      return { raw: text };
    }
  } catch (err) {
    console.error('[H3 Fetch Error]:', err);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reach Flask',
      data: err
    });
  }
});
