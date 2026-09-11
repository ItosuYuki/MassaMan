import "server-only";

/**
 * Posts a message to the Slack channel configured via SLACK_WEBHOOK_URL (a Slack
 * "Incoming Webhook" URL — see https://api.slack.com/messaging/webhooks).
 * No-ops with a console warning when unconfigured, so the rest of the app keeps
 * working without Slack set up.
 */
export async function sendSlackMessage(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[slack] SLACK_WEBHOOK_URL is not set; skipping notification:", text);
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error("[slack] webhook returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("[slack] failed to send notification", err);
  }
}
