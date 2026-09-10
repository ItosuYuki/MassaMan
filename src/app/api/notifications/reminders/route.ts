import { sendDueReservationReminders } from "@/lib/notifications";

export async function POST(request: Request) {
  const expected = process.env.NOTIFICATION_JOB_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sent = await sendDueReservationReminders();
  return Response.json({ sent });
}
