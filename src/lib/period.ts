import { isNonWorkingDay } from "@/lib/holidays";

export type PeriodType = "day" | "week" | "month" | "year";

export type DateRange = { start: string; end: string }; // YYYY-MM-DD, inclusive

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday-start week
  return addDays(d, diff);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function isoWeekNumber(d: Date): number {
  const target = new Date(d.getTime());
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function rangeForPeriod(period: PeriodType, refDateISO: string): DateRange {
  const ref = parseISO(refDateISO);
  switch (period) {
    case "day":
      return { start: refDateISO, end: refDateISO };
    case "week": {
      const start = startOfWeek(ref);
      return { start: toISO(start), end: toISO(addDays(start, 6)) };
    }
    case "month":
      return { start: toISO(startOfMonth(ref)), end: toISO(endOfMonth(ref)) };
    case "year":
      return {
        start: `${ref.getUTCFullYear()}-01-01`,
        end: `${ref.getUTCFullYear()}-12-31`,
      };
  }
}

/** The equivalent range one period earlier, for "前期間と比較". */
export function previousRangeForPeriod(period: PeriodType, refDateISO: string): DateRange {
  const ref = parseISO(refDateISO);
  switch (period) {
    case "day":
      return rangeForPeriod("day", toISO(addDays(ref, -1)));
    case "week":
      return rangeForPeriod("week", toISO(addDays(ref, -7)));
    case "month": {
      const prevMonthRef = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1));
      return rangeForPeriod("month", toISO(prevMonthRef));
    }
    case "year":
      return rangeForPeriod("year", `${ref.getUTCFullYear() - 1}-01-01`);
  }
}

/** Moves the reference date one period forward/back, for the "< ... >" nav arrows. */
export function shiftReference(period: PeriodType, refDateISO: string, direction: 1 | -1): string {
  const ref = parseISO(refDateISO);
  switch (period) {
    case "day": {
      let next = addDays(ref, direction);
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
        next = addDays(next, direction);
      }
      return toISO(next);
    }
    case "week":
      return toISO(addDays(ref, direction * 7));
    case "month": {
      const next = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + direction, 1));
      return toISO(next);
    }
    case "year":
      return `${ref.getUTCFullYear() + direction}-01-01`;
  }
}

export function formatRangeLabel(period: PeriodType, range: DateRange): string {
  const start = parseISO(range.start);
  const end = parseISO(range.end);
  const md = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  switch (period) {
    case "day":
      return `${start.getUTCFullYear()}年 ${md(start)}（${["日", "月", "火", "水", "木", "金", "土"][start.getUTCDay()]}）`;
    case "week":
      return `${start.getUTCFullYear()}年 W${isoWeekNumber(start)}（${md(start)}〜${md(end)}）`;
    case "month":
      return `${start.getUTCFullYear()}年 ${start.getUTCMonth() + 1}月`;
    case "year":
      return `${start.getUTCFullYear()}年`;
  }
}

export function todayISO(now = new Date()): string {
  // The service operates on Japanese business days. `toISOString()` uses UTC,
  // which returns yesterday between 00:00 and 08:59 JST and can also make the
  // server render disagree with a browser in Japan. Format in the application
  // timezone explicitly so both environments choose the same reference date.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Validates a `ref` searchParam before it reaches parseISO/rangeForPeriod — an
 * unparseable date (e.g. `?ref=bad`) otherwise produces an Invalid Date that
 * throws "Invalid time value" once formatted, a 500 for user-controlled input. */
export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split("-").map(Number);
  const parsed = parseISO(s);

  // `new Date(Date.UTC(2026, 1, 31))` silently rolls over to March 3rd. A
  // finite Date check alone therefore accepts impossible calendar dates and
  // lets the original invalid string reach PostgreSQL, where it raises a 500.
  // Compare every component after parsing so only a real YYYY-MM-DD survives.
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** One point on the utilization/vacancy trend x-axis. `closed` marks a bucket
 * that's entirely a weekend/public holiday (single-day buckets only — a
 * month/year bucket spans multiple days, so it's never marked closed even if
 * it contains some). */
export type TrendBucket =
  | { kind: "hour"; hour: number; label: string; closed: boolean }
  | { kind: "date"; start: string; end: string; label: string; closed: boolean };

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
export const HOURS = Array.from({ length: 11 }, (_, i) => i + 9); // 9..19

/**
 * The x-axis buckets for a given period + range: hour-of-day for "day",
 * one bucket per weekday for "week", one per week for "month", one per
 * month for "year" — per the "週表示は日、月表示は週、年表示は月" rule.
 */
export function trendBuckets(period: PeriodType, range: DateRange): TrendBucket[] {
  if (period === "day") {
    const closed = isNonWorkingDay(range.start);
    return HOURS.map((h) => ({ kind: "hour", hour: h, label: String(h), closed }));
  }

  if (period === "week") {
    // Sat/Sun are dropped entirely (not just grayed) — the facility is never
    // open then, so there's nothing to plot. range.start is always a Monday
    // (see rangeForPeriod), so only the first 5 days are weekdays.
    const buckets: TrendBucket[] = [];
    let d = parseISO(range.start);
    for (let i = 0; i < 5; i++) {
      const iso = toISO(d);
      buckets.push({ kind: "date", start: iso, end: iso, label: WEEKDAY_LABELS[i], closed: isNonWorkingDay(iso) });
      d = addDays(d, 1);
    }
    return buckets;
  }

  if (period === "month") {
    const buckets: TrendBucket[] = [];
    let d = parseISO(range.start);
    const end = parseISO(range.end);
    let w = 1;
    while (d <= end) {
      const chunkEndTime = Math.min(addDays(d, 6).getTime(), end.getTime());
      const chunkEnd = new Date(chunkEndTime);
      buckets.push({ kind: "date", start: toISO(d), end: toISO(chunkEnd), label: `W${w}`, closed: false });
      d = addDays(chunkEnd, 1);
      w++;
    }
    return buckets;
  }

  // year: one bucket per calendar month
  const year = parseISO(range.start).getUTCFullYear();
  return Array.from({ length: 12 }, (_, i) => {
    const s = new Date(Date.UTC(year, i, 1));
    const e = new Date(Date.UTC(year, i + 1, 0));
    return { kind: "date" as const, start: toISO(s), end: toISO(e), label: MONTH_LABELS[i], closed: false };
  });
}
