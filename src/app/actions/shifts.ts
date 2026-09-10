"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { findTherapistProfileIdByEmployeeCode } from "@/lib/employees";
import { getDayAvailability, saveDayAvailability, type SlotState } from "@/lib/shifts";
import { currentSlotIndex } from "@/lib/shift-slots";

export type WeekAvailabilityInput = { dateIso: string; slots: SlotState[] }[];

/**
 * Today's date (server clock), as a YYYY-MM-DD string. Past shifts are records of
 * what already happened — never editable, regardless of what the client sends —
 * so every write path below filters against this.
 */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Saves one day's slots, but if it's today, keeps whatever is already saved
 * for the slots at-or-before the current time untouched — the client disables
 * those cells, but a stale client shouldn't be able to rewrite the past by
 * sending its own copy of them anyway.
 */
function applyDayAvailability(therapistProfileId: string, dateIso: string, slots: SlotState[], today: string) {
  if (dateIso === today) {
    const current = getDayAvailability(therapistProfileId, dateIso);
    const cutoff = currentSlotIndex();
    slots = slots.map((s, i) => (i < cutoff ? current[i] : s));
  }
  saveDayAvailability(therapistProfileId, dateIso, slots);
}

export async function saveWeekAvailability(days: WeekAvailabilityInput) {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return;

  const today = todayIso();
  for (const day of days) {
    if (day.dateIso < today) continue;
    applyDayAvailability(therapistProfileId, day.dateIso, day.slots, today);
  }

  revalidatePath("/schedule");
}

function mondayOfIso(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MAX_COPY_WEEKS = 26; // sanity bound (half a year) against a mistyped huge count

/**
 * Copies one week's saved availability (Mon-Fri) onto another week (and, if
 * weekCount > 1, onto that many consecutive weeks starting there), overwriting
 * each target week.
 */
export async function copyWeekAvailability(sourceMondayIso: string, targetDateIso: string, weekCount: number = 1) {
  const session = await requireRole("therapist");
  const therapistProfileId = findTherapistProfileIdByEmployeeCode(session.employeeId);
  if (!therapistProfileId) return;

  const targetMondayIso = mondayOfIso(targetDateIso);
  const count = Math.min(Math.max(1, Math.trunc(weekCount)), MAX_COPY_WEEKS);
  const today = todayIso();

  const sourceSlotsByWeekday = Array.from({ length: 5 }, (_, i) =>
    getDayAvailability(therapistProfileId, addDaysIso(sourceMondayIso, i))
  );

  for (let week = 0; week < count; week++) {
    const weekMondayIso = addDaysIso(targetMondayIso, week * 7);
    for (let i = 0; i < 5; i++) {
      const targetDate = addDaysIso(weekMondayIso, i);
      if (targetDate < today) continue;
      applyDayAvailability(therapistProfileId, targetDate, sourceSlotsByWeekday[i], today);
    }
  }

  revalidatePath("/schedule");
}
