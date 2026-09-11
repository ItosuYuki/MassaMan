/**
 * In-memory notification preferences, keyed by employee id — reservations
 * themselves now live in Postgres (src/lib/booking/repo.ts), but these
 * preferences are still a follow-up (see db/schema.sql's notification_settings
 * table).
 */

export const REMINDER_MINUTE_OPTIONS = [15, 30, 60, 120] as const;
export type ReminderMinutes = (typeof REMINDER_MINUTE_OPTIONS)[number];

export type NotificationPreferences = {
  enabled: boolean;
  reminderMinutes: ReminderMinutes[];
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: false,
  reminderMinutes: [30],
};

type PrefsStore = Record<string, NotificationPreferences>;

const globalForPrefs = globalThis as unknown as { __notificationPrefs?: PrefsStore };

function getPrefsStore(): PrefsStore {
  if (!globalForPrefs.__notificationPrefs) {
    globalForPrefs.__notificationPrefs = {};
  }
  return globalForPrefs.__notificationPrefs;
}

export function getPreferences(employeeId: string): NotificationPreferences {
  return getPrefsStore()[employeeId] ?? DEFAULT_PREFERENCES;
}

export function setPreferences(employeeId: string, prefs: NotificationPreferences): void {
  getPrefsStore()[employeeId] = prefs;
}

/** All [employeeId, preferences] pairs with notifications enabled — used by the reminder scheduler. */
export function getAllEnabledPreferences(): [string, NotificationPreferences][] {
  return Object.entries(getPrefsStore()).filter(([, prefs]) => prefs.enabled);
}
