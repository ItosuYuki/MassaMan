// Pure constants shared by the server-only notification layer (src/lib/notifications.ts)
// and the client-side schedule/mypage UI — no "server-only" import here, so client
// components can use these without pulling in the DB layer into their bundle.

export const NOTIFICATION_MINUTES_OPTIONS = [15, 30, 60, 120] as const;
export type NotificationMinutes = (typeof NOTIFICATION_MINUTES_OPTIONS)[number];
