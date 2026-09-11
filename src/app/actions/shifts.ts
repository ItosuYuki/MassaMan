"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { findTherapistProfileIdByEmployeeCode } from "@/lib/employees";
import { getDaySchedule, saveDayAvailability, type SlotState } from "@/lib/shifts";
import { currentSlotIndex, SLOT_COUNT, slotStartTime } from "@/lib/shift-slots";
import { getReservationsForTherapist } from "@/lib/reservations";
import { localDateIso, parseIsoDateLocal, addLocalDays, isValidDateIso, localWeekday } from "@/lib/local-date";
import { runInTransaction } from "@/lib/db";

export type WeekAvailabilityInput = { dateIso: string; slots: SlotState[]; labels: (string | null)[] }[];

const VALID_SLOT_STATES = new Set<SlotState>(["available", "unavailable", "break"]);
const MAX_LABEL_LENGTH = 50; // sanity bound against a pasted essay, not a hard product requirement

/**
 * WeekAvailabilityInput is only a TypeScript type — it isn't checked at
 * runtime by anything upstream. A malformed payload (wrong slot count, a
 * stray value, a bad date string) would otherwise reach saveDayAvailability,
 * which deletes the existing shift/break rows *before* inserting the new
 * ones — so a bad day doesn't just fail to save, it can wipe out real data.
 */
function isValidWeekInput(days: WeekAvailabilityInput): boolean {
  return (
    Array.isArray(days) &&
    days.every(
      (day) =>
        day &&
        typeof day.dateIso === "string" &&
        isValidDateIso(day.dateIso) &&
        Array.isArray(day.slots) &&
        day.slots.length === SLOT_COUNT &&
        day.slots.every((s) => VALID_SLOT_STATES.has(s)) &&
        Array.isArray(day.labels) &&
        day.labels.length === SLOT_COUNT &&
        day.labels.every((l) => l === null || (typeof l === "string" && l.length <= MAX_LABEL_LENGTH))
    )
  );
}

/**
 * True if the client's slots would put anything other than "available" on a
 * slot that a confirmed reservation actually occupies. The grid's UI already
 * refuses to paint over a reservation (see blockedEvents in schedule-view),
 * but that's a client-side courtesy only — this is the actual guard, since a
 * stale client, a direct Action call, or the old (pre-block) UI could
 * otherwise save a day where "その他"/"休憩" and a confirmed booking overlap.
 */
function conflictsWithReservations(therapistProfileId: string, dateIso: string, slots: SlotState[]): boolean {
  const events = getReservationsForTherapist(therapistProfileId, dateIso);
  if (events.length === 0) return false;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slotStart = slotStartTime(i);
    const slotEnd = slotStartTime(i + 1);
    const hasEvent = events.some((e) => e.startTime < slotEnd && e.endTime > slotStart);
    if (hasEvent && slots[i] !== "available") return true;
  }
  return false;
}

/**
 * Today's date (server clock, local calendar day). Past shifts are records of
 * what already happened — never editable, regardless of what the client sends —
 * so every write path below filters against this.
 */
function todayIso(): string {
  return localDateIso(new Date());
}

/**
 * Saves one day's slots (and each "その他" slot's reason label), but if it's
 * today, keeps whatever is already saved for the slots at-or-before the
 * current time untouched — the client disables those cells, but a stale
 * client shouldn't be able to rewrite the past by sending its own copy of
 * them anyway.
 */
function applyDayAvailability(
  therapistProfileId: string,
  dateIso: string,
  slots: SlotState[],
  labels: (string | null)[],
  today: string
) {
  if (dateIso === today) {
    const current = getDaySchedule(therapistProfileId, dateIso);
    const cutoff = currentSlotIndex();
    slots = slots.map((s, i) => (i < cutoff ? current.slots[i] : s));
    labels = labels.map((l, i) => (i < cutoff ? current.labels[i] : l));
  }
  saveDayAvailability(therapistProfileId, dateIso, slots, labels);
}

export type SaveWeekResult =
  | { status: "ok" }
  | { status: "invalid_input" }
  | { status: "conflict"; dateIso: string };

export async function saveWeekAvailability(days: WeekAvailabilityInput): Promise<SaveWeekResult> {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return { status: "invalid_input" };

  if (!isValidWeekInput(days)) return { status: "invalid_input" };

  const today = todayIso();
  const editableDays = days.filter((day) => day.dateIso >= today);

  // Validate every day up front — reject the whole save rather than silently
  // applying only the days before the conflicting one.
  for (const day of editableDays) {
    if (conflictsWithReservations(therapistProfileId, day.dateIso, day.slots)) {
      return { status: "conflict", dateIso: day.dateIso };
    }
  }

  runInTransaction(() => {
    for (const day of editableDays) {
      applyDayAvailability(therapistProfileId, day.dateIso, day.slots, day.labels, today);
    }
  });

  revalidatePath("/schedule");
  return { status: "ok" };
}

function mondayOfIso(dateIso: string): string {
  const date = parseIsoDateLocal(dateIso);
  const day = localWeekday(date); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return localDateIso(addLocalDays(date, diffToMonday));
}

function addDaysIso(dateIso: string, days: number): string {
  return localDateIso(addLocalDays(parseIsoDateLocal(dateIso), days));
}

const MAX_COPY_WEEKS = 26; // sanity bound (half a year) against a mistyped huge count

export type CopyWeekResult =
  | { status: "ok" }
  | { status: "invalid_input" }
  | { status: "conflict"; dateIso: string };

/**
 * Copies one week's saved availability (Mon-Fri) onto another week (and, if
 * weekCount > 1, onto that many consecutive weeks starting there), overwriting
 * each target week. Same all-or-nothing rule as saveWeekAvailability: every
 * target day is checked against confirmed reservations *before* anything is
 * written, and the whole copy is rejected if even one day conflicts — a
 * partial multi-week copy would leave the therapist unsure which weeks
 * actually changed.
 */
export async function copyWeekAvailability(
  sourceMondayIso: string,
  targetDateIso: string,
  weekCount: number = 1
): Promise<CopyWeekResult> {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return { status: "invalid_input" };

  // Both come straight from the client (one of them from localStorage) —
  // same reasoning as WeekAvailabilityInput above: a malformed string here
  // would otherwise flow straight into date arithmetic and DB lookups below.
  if (!isValidDateIso(sourceMondayIso) || !isValidDateIso(targetDateIso)) {
    return { status: "invalid_input" };
  }

  const targetMondayIso = mondayOfIso(targetDateIso);
  const count = Math.min(Math.max(1, Math.trunc(weekCount)), MAX_COPY_WEEKS);
  const today = todayIso();

  const sourceScheduleByWeekday = Array.from({ length: 5 }, (_, i) =>
    getDaySchedule(therapistProfileId, addDaysIso(sourceMondayIso, i))
  );

  const targets: { dateIso: string; weekday: number }[] = [];
  for (let week = 0; week < count; week++) {
    const weekMondayIso = addDaysIso(targetMondayIso, week * 7);
    for (let weekday = 0; weekday < 5; weekday++) {
      const dateIso = addDaysIso(weekMondayIso, weekday);
      if (dateIso >= today) targets.push({ dateIso, weekday });
    }
  }

  // Validate every target day up front, across every week being copied to —
  // reject the whole copy rather than silently applying only the weeks
  // before the conflicting one.
  for (const target of targets) {
    if (conflictsWithReservations(therapistProfileId, target.dateIso, sourceScheduleByWeekday[target.weekday].slots)) {
      return { status: "conflict", dateIso: target.dateIso };
    }
  }

  runInTransaction(() => {
    for (const target of targets) {
      const source = sourceScheduleByWeekday[target.weekday];
      applyDayAvailability(therapistProfileId, target.dateIso, source.slots, source.labels, today);
    }
  });

  revalidatePath("/schedule");
  return { status: "ok" };
}
