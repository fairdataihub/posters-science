/** Slack mrkdwn treats &, < and > as control characters. */
export function slackText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
