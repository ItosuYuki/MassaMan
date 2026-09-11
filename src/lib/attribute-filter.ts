/** Pure, DB-independent from dashboard-data.ts on purpose — the parsing/
 * derivation logic here is unit-testable without a live Postgres connection. */

export type AttributeKind = "age" | "gender" | "department";

export const ALL_ATTRIBUTES: AttributeKind[] = ["age", "gender", "department"];
export const ATTRIBUTE_LABEL: Record<AttributeKind, string> = { age: "年代", gender: "性別", department: "部署" };

/** Sentinel value for the "全体" checkbox — not a real age/gender/department
 * key, so it never reaches a query as a filter value or a breakdown series. */
export const OVERALL_ATTRIBUTE_VALUE = "__all__";

/** Each field is the set of values to filter that dimension to — empty means
 * "no filter on this dimension". Multiple values are OR'd together (e.g.
 * ageBracket: ["20s","30s"] means 20代 or 30代). */
export type AttributeFilter = {
  ageBracket: string[];
  gender: string[];
  department: string[];
};

export const DEFAULT_FILTER: AttributeFilter = { ageBracket: [], gender: [], department: [] };

const VALID_AGE_BRACKETS = ["20s", "30s", "40s", "50s_plus"];
const VALID_GENDERS = ["male", "female"];

/** Removes unknown and duplicate values from the user-controlled query param.
 * Keeping this separate from filter derivation also lets chart selection and
 * descriptions use the exact same validated set. */
export function sanitizeLineValues(
  lineAttr: AttributeKind,
  lineValues: string[],
  departments: string[]
): string[] {
  const allowedValues =
    lineAttr === "age"
      ? VALID_AGE_BRACKETS
      : lineAttr === "gender"
        ? VALID_GENDERS
        : departments;

  return [
    ...new Set(
      lineValues.filter(
        (value) => value === OVERALL_ATTRIBUTE_VALUE || allowedValues.includes(value)
      )
    ),
  ];
}

/**
 * The trend chart's own dimension tab + checked values (lineAttr/lineValues)
 * double as the only filtering UI — checking a box both draws that value's
 * breakdown line AND narrows every stat/chart on the page to it. Since only
 * one dimension tab is ever active at a time, at most one of the three
 * dimensions is filtered at once; switching tabs (which already resets
 * lineValues) drops the filter along with it.
 *
 * 「全体」overrides that narrowing entirely: it is the admin explicitly asking
 * for the whole population, so with it checked the page keeps showing
 * unfiltered numbers and the other checked values only add their comparison
 * lines to the trend chart. Without this, checking 全体+20代 filtered the page
 * to 20代 and the 全体 line silently became the 20代 line drawn on top of
 * itself — the reference line the checkbox exists to provide disappeared, and
 * its value changed with every other box checked.
 *
 * Values are validated against an allow-list before reaching a query — same
 * reasoning as the old age/gender/dept searchParam validation: an
 * unrecognized age/gender fails the Postgres enum cast (500), and
 * `departments` (the live list from listDepartments()) guards department the
 * same way since valid names aren't statically known.
 */
export function attributeFilterFromLineSelection(
  lineAttr: AttributeKind,
  lineValues: string[],
  departments: string[]
): AttributeFilter {
  const sanitizedValues = sanitizeLineValues(lineAttr, lineValues, departments);
  if (sanitizedValues.includes(OVERALL_ATTRIBUTE_VALUE)) return DEFAULT_FILTER;

  const realValues = sanitizedValues;
  if (realValues.length === 0) return DEFAULT_FILTER;

  return {
    ageBracket: lineAttr === "age" ? realValues : [],
    gender: lineAttr === "gender" ? realValues : [],
    department: lineAttr === "department" ? realValues : [],
  };
}
