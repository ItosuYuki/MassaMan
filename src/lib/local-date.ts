// Shared "what calendar day/time is it, in the server's local timezone" helpers.
//
// Bug this exists to fix: several call sites derived a date string via
// `date.toISOString().slice(0, 10)` (UTC) while deriving the time-of-day via
// `date.getHours()`/`getMinutes()` (local). Those two disagree on which
// calendar day it is for roughly the first 9 hours of the local day (e.g. in
// Asia/Tokyo, local 00:00–08:59 is still the *previous* UTC calendar day) —
// so "today", "already started", and "day-of-week" checks could all be off
// by one exactly during that window. Every date/time derived from "now" (or
// from a Date built from one of our own YYYY-MM-DD strings) should go through
// these local-only helpers instead, never `toISOString()`.

/** "YYYY-MM-DD" for `date`, using its local calendar day (never UTC). */
export function localDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "HH:MM" for `date`'s local wall-clock time. */
export function localTimeHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Parses a "YYYY-MM-DD" string as local midnight on that calendar day.
 * `new Date("YYYY-MM-DD")` parses as *UTC* midnight per spec, which is the
 * wrong day in any timezone west of UTC (all of the Americas) and fine only
 * by luck east of it — always go through this instead.
 */
export function parseIsoDateLocal(dateIso: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Adds `days` (may be negative) to a local-midnight Date, returning a new local-midnight Date. */
export function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** 1 (Monday) .. 5 (Friday) for this local date's ISO weekday, using the same 0=Sunday convention as Date#getDay. */
export function localWeekday(date: Date): number {
  return date.getDay();
}

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in "YYYY-MM-DD" form. A bare regex
 * accepts calendar nonsense like "2026-13-45" or "2026-02-30" — native Date
 * silently normalizes those to some *other* real date (rolling the month/day
 * forward) instead of rejecting them, so this round-trips the parsed date
 * back through `localDateIso` and requires an exact match to actually catch
 * that. Any Server Action taking a date string from the client should
 * validate it with this before using it for anything (date arithmetic, a
 * shift/reservation lookup, a DB write).
 */
export function isValidDateIso(value: string): boolean {
  return DATE_ISO_RE.test(value) && localDateIso(parseIsoDateLocal(value)) === value;
}
