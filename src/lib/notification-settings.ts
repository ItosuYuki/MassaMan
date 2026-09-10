import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { notificationSettings, slackConnections, users } from "@/db/schema";
import { db } from "@/lib/db";
import type { Role } from "@/lib/session";

export const USER_DEFAULT_MINUTES = 30;
export const THERAPIST_DEFAULT_MINUTES = 10;
export const THERAPIST_SLACK_CHANNEL = "#massage-room";

export type NotificationCardSettings = {
  enabled: boolean;
  minutesBefore: number;
  channels: Array<"in_app" | "email" | "slack">;
  reservationCreatedEnabled: boolean;
  reservationCancelledEnabled: boolean;
  reminderEnabled: boolean;
  slackConnection: { teamId: string; slackUserId: string } | null;
};

export async function getNotificationCardSettings(
  employeeCode: string,
  role: Extract<Role, "user" | "therapist">
): Promise<NotificationCardSettings> {
  const user = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.employeeCode, employeeCode),
  });
  if (!user) throw new Error("通知設定の対象ユーザーが見つかりません。");

  const channels = role === "user" ? (["in_app", "email", "slack"] as const) : (["slack"] as const);
  const rows = await db
    .select({
      channel: notificationSettings.channel,
      enabled: notificationSettings.enabled,
      minutesBefore: notificationSettings.minutesBefore,
      reservationCreatedEnabled: notificationSettings.reservationCreatedEnabled,
      reservationCancelledEnabled: notificationSettings.reservationCancelledEnabled,
      reminderEnabled: notificationSettings.reminderEnabled,
    })
    .from(notificationSettings)
    .where(and(eq(notificationSettings.userId, user.id), inArray(notificationSettings.channel, channels)));

  const defaults = role === "user" ? USER_DEFAULT_MINUTES : THERAPIST_DEFAULT_MINUTES;
  return {
    enabled: rows.length === 0 ? true : rows.every((row) => row.enabled),
    minutesBefore: rows[0]?.minutesBefore ?? defaults,
    channels: [...channels],
    reservationCreatedEnabled: rows.length === 0 ? true : rows.some((row) => row.reservationCreatedEnabled),
    reservationCancelledEnabled: rows.length === 0 ? true : rows.some((row) => row.reservationCancelledEnabled),
    reminderEnabled: rows.length === 0 ? true : rows.some((row) => row.reminderEnabled),
    slackConnection: (await db
      .select({ teamId: slackConnections.slackTeamId, slackUserId: slackConnections.slackUserId })
      .from(slackConnections)
      .where(eq(slackConnections.userId, user.id))
      .limit(1))[0] ?? null,
  };
}

export async function getNotificationUserId(employeeCode: string) {
  const user = await db.query.users.findFirst({ columns: { id: true }, where: eq(users.employeeCode, employeeCode) });
  if (!user) throw new Error("通知設定の対象ユーザーが見つかりません。");
  return user.id;
}
