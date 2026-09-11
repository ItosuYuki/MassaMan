import { sendDueReservationReminders } from "@/lib/notifications";

export const runtime = "nodejs";

async function runReminderJob(request: Request) {
  const configuredSecrets = [process.env.CRON_SECRET, process.env.NOTIFICATION_JOB_SECRET]
    .filter((secret): secret is string => Boolean(secret));
  const authorization = request.headers.get("authorization");
  if (!configuredSecrets.some((secret) => authorization === `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sent = await sendDueReservationReminders();
  return Response.json({ sent }, { headers: { "cache-control": "no-store" } });
}

// Vercel CronはGET、手動実行や他のジョブランナーはPOSTで同じ処理を呼び出せる。
export { runReminderJob as GET, runReminderJob as POST };
