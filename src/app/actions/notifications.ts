"use server";

import { revalidatePath } from "next/cache";
import { notificationSettings } from "@/db/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { getNotificationUserId } from "@/lib/notification-settings";

const ALLOWED_MINUTES = new Set([5, 10, 15, 30, 60, 120]);

export type NotificationSettingsActionState = { error?: string; saved?: boolean };

export async function saveNotificationSettings(
  _previous: NotificationSettingsActionState,
  formData: FormData
): Promise<NotificationSettingsActionState> {
  const session = await verifySession();
  if (session.role !== "user" && session.role !== "therapist") {
    return { error: "この設定は利用者またはマッサージ師のみ変更できます。" };
  }
  const minutesBefore = Number(formData.get("minutesBefore"));
  if (!ALLOWED_MINUTES.has(minutesBefore)) return { error: "通知タイミングが正しくありません。" };
  const enabled = formData.get("enabled") === "on";
  const channels = session.role === "user" ? (["in_app", "email", "slack"] as const) : (["slack"] as const);
  const userId = await getNotificationUserId(session.employeeId);
  const reservationCreatedEnabled = formData.get("reservationCreatedEnabled") === "on";
  const reservationCancelledEnabled = formData.get("reservationCancelledEnabled") === "on";
  const reminderEnabled = formData.get("reminderEnabled") === "on";

  await Promise.all(channels.map((channel) =>
    db.insert(notificationSettings)
      .values({ userId, channel, enabled, minutesBefore, reservationCreatedEnabled, reservationCancelledEnabled, reminderEnabled })
      .onConflictDoUpdate({
        target: [notificationSettings.userId, notificationSettings.channel],
        set: { enabled, minutesBefore, reservationCreatedEnabled, reservationCancelledEnabled, reminderEnabled },
      })
  ));
  revalidatePath(session.role === "user" ? "/booking" : "/schedule");
  return { saved: true };
}
