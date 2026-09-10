import "server-only";
import { db } from "@/lib/db";

export type NotificationChannel = "in_app" | "email" | "slack";

export type NotificationSettings = {
  channel: NotificationChannel;
  enabled: boolean;
  minutesBefore: number;
};

type NotificationSettingsRow = {
  channel: NotificationChannel;
  enabled: number;
  minutes_before: number;
};

const FIND_BY_EMPLOYEE_CODE = db.prepare(`
  SELECT ns.channel, ns.enabled, ns.minutes_before
  FROM notification_settings ns
  JOIN users u ON u.id = ns.user_id
  WHERE u.employee_code = ? AND ns.channel = ?
`);

export function getNotificationSettings(
  employeeId: string,
  channel: NotificationChannel
): NotificationSettings | null {
  const row = FIND_BY_EMPLOYEE_CODE.get(employeeId, channel) as NotificationSettingsRow | undefined;
  if (!row) return null;

  return {
    channel: row.channel,
    enabled: !!row.enabled,
    minutesBefore: row.minutes_before,
  };
}

const SET_ENABLED = db.prepare(`
  UPDATE notification_settings
  SET enabled = ?
  WHERE channel = ? AND user_id = (SELECT id FROM users WHERE employee_code = ?)
`);

export function setNotificationEnabled(employeeId: string, channel: NotificationChannel, enabled: boolean): void {
  SET_ENABLED.run(enabled ? 1 : 0, channel, employeeId);
}
