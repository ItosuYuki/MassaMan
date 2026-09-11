"use server";

import { requireRole } from "@/lib/dal";
import {
  getPreferences,
  setPreferences,
  type NotificationPreferences,
  type ReminderMinutes,
} from "./store";

export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const session = await requireRole("user");
  return getPreferences(session.employeeId);
}

export async function updateMyNotificationPreferences(
  prefs: NotificationPreferences
): Promise<{ ok: true }> {
  const session = await requireRole("user");
  setPreferences(session.employeeId, prefs);
  return { ok: true };
}

export type { NotificationPreferences, ReminderMinutes };
