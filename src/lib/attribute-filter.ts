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

/**
 * The trend chart's own dimension tab + checked values (lineAttr/lineValues)
 * double as the only filtering UI — checking a box both draws that value's
 * breakdown line AND narrows every stat/chart on the page to it. Since only
 * one dimension tab is ever active at a time, at most one of the three
 * dimensions is filtered at once; switching tabs (which already resets
 * lineValues) drops the filter along with it.
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
  const realValues = lineValues.filter((v) => v !== OVERALL_ATTRIBUTE_VALUE);
  if (realValues.length === 0) return DEFAULT_FILTER;

  const validValues =
    lineAttr === "age"
      ? realValues.filter((v) => VALID_AGE_BRACKETS.includes(v))
      : lineAttr === "gender"
        ? realValues.filter((v) => VALID_GENDERS.includes(v))
        : realValues.filter((v) => departments.includes(v));

  return {
    ageBracket: lineAttr === "age" ? validValues : [],
    gender: lineAttr === "gender" ? validValues : [],
    department: lineAttr === "department" ? validValues : [],
  };
}
