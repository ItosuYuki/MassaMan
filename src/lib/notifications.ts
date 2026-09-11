import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationSettings, users } from "@/db/schema";

export type NotificationChannel = "in_app" | "email" | "slack";

export { NOTIFICATION_MINUTES_OPTIONS } from "@/lib/notification-options";

export type NotificationSettings = {
  channel: NotificationChannel;
  enabled: boolean;
  minutesBefore: number;
};

export async function getNotificationSettings(
  employeeId: string,
  channel: NotificationChannel
): Promise<NotificationSettings | null> {
  const rows = await db
    .select({
      channel: notificationSettings.channel,
      enabled: notificationSettings.enabled,
      minutesBefore: notificationSettings.minutesBefore,
    })
    .from(notificationSettings)
    .innerJoin(users, eq(users.id, notificationSettings.userId))
    .where(and(eq(users.employeeCode, employeeId), eq(notificationSettings.channel, channel)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    channel: row.channel,
    enabled: row.enabled,
    minutesBefore: row.minutesBefore,
  };
}

async function findUserIdByEmployeeCode(employeeId: string): Promise<string | null> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.employeeCode, employeeId)).limit(1);
  return user?.id ?? null;
}

export async function setNotificationEnabled(
  employeeId: string,
  channel: NotificationChannel,
  enabled: boolean
): Promise<void> {
  const userId = await findUserIdByEmployeeCode(employeeId);
  if (!userId) return;

  await db
    .update(notificationSettings)
    .set({ enabled })
    .where(and(eq(notificationSettings.channel, channel), eq(notificationSettings.userId, userId)));
}

export async function setNotificationMinutesBefore(
  employeeId: string,
  channel: NotificationChannel,
  minutesBefore: number
): Promise<void> {
  const userId = await findUserIdByEmployeeCode(employeeId);
  if (!userId) return;

  await db
    .update(notificationSettings)
    .set({ minutesBefore })
    .where(and(eq(notificationSettings.channel, channel), eq(notificationSettings.userId, userId)));
}
