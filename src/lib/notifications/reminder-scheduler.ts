import "server-only";
import { getStore } from "@/lib/booking/mock-data";
import { formatTimeLabel } from "@/lib/booking/schedule";
import { getAllEnabledPreferences } from "./store";
import { sendSlackMessage } from "./slack";

const POLL_INTERVAL_MS = 60_000;

/** Tracks which "reservationId:minutesBefore" reminders have already fired this process. */
const sentReminders = new Set<string>();

function appointmentDate(dateIso: string, startMinutes: number): Date {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setMinutes(startMinutes);
  return d;
}

function checkReminders() {
  const { reservations } = getStore();
  const now = new Date();

  for (const [employeeId, prefs] of getAllEnabledPreferences()) {
    const userReservations = reservations.filter((r) => r.userEmployeeId === employeeId);

    for (const reservation of userReservations) {
      const apptAt = appointmentDate(reservation.date, reservation.startMinutes);
      if (apptAt <= now) continue; // already happened

      for (const minutesBefore of prefs.reminderMinutes) {
        const key = `${reservation.id}:${minutesBefore}`;
        if (sentReminders.has(key)) continue;

        const triggerAt = new Date(apptAt.getTime() - minutesBefore * 60_000);
        if (now >= triggerAt) {
          sentReminders.add(key);
          sendSlackMessage(
            `⏰ リマインダー：${reservation.userName} さんの予約まで残り${minutesBefore}分です` +
              `（${reservation.date} ${formatTimeLabel(reservation.startMinutes)}〜、${reservation.durationMinutes}分）`
          );
        }
      }
    }
  }
}

/** Starts the reminder poller once per server process (HMR-safe via globalThis). */
export function startReminderScheduler() {
  const globalForScheduler = globalThis as unknown as { __reminderInterval?: ReturnType<typeof setInterval> };
  if (globalForScheduler.__reminderInterval) return;
  globalForScheduler.__reminderInterval = setInterval(checkReminders, POLL_INTERVAL_MS);
}
