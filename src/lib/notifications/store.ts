/**
 * In-memory notification preferences, keyed by employee id — mirrors the
 * process-local pattern used for the reservations store (mock-data.ts). Real
 * persistence is a follow-up once a real DB is connected (see db/schema.sql's
 * notification_settings table).
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
