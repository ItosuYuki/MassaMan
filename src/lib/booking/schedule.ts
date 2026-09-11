export const BUSINESS_DAYS = [1, 2, 3, 4, 5] as const; // Mon-Fri (Date.getDay())
export const BUSINESS_HOURS = { start: 9, end: 19 } as const;
export const SLOT_STEP_MINUTES = 15;

/** The business day closes at 19:45 — no treatment (including its cleanup buffer) may run past this. */
export const CLOSING_TIME_MINUTES = 19 * 60 + 45;

/** Minutes-from-midnight for every displayed start-time row, e.g. 540 (9:00) .. 1170 (19:30), step 15. */
export function getTimeSlots(): number[] {
  const startMinutes = BUSINESS_HOURS.start * 60;
  const endMinutes = BUSINESS_HOURS.end * 60 + 30;
  const slots: number[] = [];
  for (let m = startMinutes; m <= endMinutes; m += SLOT_STEP_MINUTES) slots.push(m);
  return slots;
}

/** Formats minutes-from-midnight as "H:MM", e.g. 555 -> "9:15". */
export function formatTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Whether the given business-hour slot has already started (or passed), relative to `now`. */
export function isSlotInPast(dateIso: string, startMinutes: number, now: Date): boolean {
  const slotStart = new Date(`${dateIso}T00:00:00`);
  slotStart.setMinutes(startMinutes, 0, 0);
  return slotStart <= now;
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** Formats an ISO date as "MM/DD（曜）", e.g. "2026-09-10" -> "09/10（木）". */
export function formatDateWithWeekday(iso: string): string {
  const weekday = WEEKDAY_LABELS[new Date(`${iso}T00:00:00`).getDay()];
  return `${iso.slice(5).replace("-", "/")}（${weekday}）`;
}

/** Mon-Fri dates of the business week containing `anchor`. */
export function getWeekDates(anchor: Date): Date[] {
  const day = anchor.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diffToMonday);

  return BUSINESS_DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
