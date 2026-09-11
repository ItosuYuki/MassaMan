import { isValidISODate, todayISO, type PeriodType } from "@/lib/period";
import { type AttributeKind, OVERALL_ATTRIBUTE_VALUE } from "@/lib/attribute-filter";

export type SearchParamValue = string | string[] | undefined;

/** Next.js returns an array when a scalar search parameter is repeated. Use
 * the first occurrence consistently rather than relying on an incorrect
 * string-only page prop type. */
export function firstSearchParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePeriod(value: SearchParamValue): PeriodType {
  const candidate = firstSearchParam(value);
  return candidate === "day" || candidate === "week" || candidate === "month" || candidate === "year"
    ? candidate
    : "week";
}

export function parseLineAttr(value: SearchParamValue): AttributeKind {
  const candidate = firstSearchParam(value);
  return candidate === "age" || candidate === "gender" || candidate === "department" ? candidate : "age";
}

/** Multi-select values can arrive comma-separated, as repeated params, or as a
 * mixture of both. Flatten and deduplicate all three forms. */
export function parseLineValues(value: SearchParamValue): string[] {
  const values = Array.isArray(value) ? value : [value ?? ""];
  return [...new Set(values.flatMap((item) => item.split(",")).filter(Boolean))];
}

/** The overview page defaults comparison ON (a bare page load should show
 * context), while the per-therapist drill-down defaults it OFF (extra
 * detail the admin opts into) — pass the page's own default explicitly
 * rather than picking one for both routes. */
export function parseCompare(value: SearchParamValue, defaultValue = false): boolean {
  const candidate = firstSearchParam(value);
  if (candidate === "1") return true;
  if (candidate === "0") return false;
  return defaultValue;
}

export function parseReferenceDate(value: SearchParamValue, fallback = todayISO()): string {
  const candidate = firstSearchParam(value);
  return candidate && isValidISODate(candidate) ? candidate : fallback;
}

export const TREND_HEADING: Record<PeriodType, string> = {
  day: "時間帯別 利用率",
  week: "曜日別 利用率",
  month: "週別 利用率",
  year: "月別 利用率",
};

export const SHIFT_BREAKDOWN_UNIT = "単位：時間";

/** Keyed on whether any ATTRIBUTE line is actually drawn, not on whether any
 * box is checked: with only 「全体」checked the chart is a single
 * whole-population line, so the breakdown wording would describe a breakdown
 * that isn't on screen. */
export function trendDescription(lineValues: string[]): string {
  return lineValues.some((v) => v !== OVERALL_ATTRIBUTE_VALUE)
    ? "全体の稼働時間のうち、各属性の予約が占める内訳です（合計すると全体利用率になります）"
    : "予約枠がどれくらい埋まっているか（稼働時間に対する割合）の推移です";
}
