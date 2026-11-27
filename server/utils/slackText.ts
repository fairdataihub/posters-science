/** Slack mrkdwn treats &, < and > as control characters. */
export function slackText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Posts a team notice to the Slack webhook. Never throws: without a webhook
 * (local development) or when Slack fails, the notice goes to the log and
 * this returns false.
 */
export async function postToSlack(
  webhook: string | undefined,
  text: string,
): Promise<boolean> {
  if (!webhook) {
    console.info(`[slack] No webhook set; notice not sent:\n${text}`);

    return false;
  }
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  }).catch((error: unknown) => {
    console.error("[slack] Could not post the notice:", error);

    return null;
  });
  if (!response?.ok) {
    if (response) {
      console.error(`[slack] Notice refused: HTTP ${response.status}`);
    }
    console.info(`[slack] Notice not sent:\n${text}`);

    return false;
  }

  return true;
}
