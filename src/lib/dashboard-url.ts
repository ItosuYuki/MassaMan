/** Builds a URL preserving the current search params, overridden by `changes`. */
export function withParams(
  basePath: string,
  current: Record<string, string | undefined>,
  changes: Record<string, string>
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v !== undefined) params.set(k, v);
  }
  for (const [k, v] of Object.entries(changes)) {
    params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Precomputes each checkbox's toggle-href server-side (a plain function can't
 * cross into a Client Component) for a multi-select param (e.g. "lines"). Zero
 * selected is a valid state (it means "show the plain trend, no breakdown"). */
export function attributeCheckboxOptions<T extends string>(
  all: readonly T[],
  selected: T[],
  labels: Record<T, string>,
  paramKey: string,
  basePath: string,
  params: Record<string, string | undefined>
): { value: T; label: string; checked: boolean; href: string }[] {
  return all.map((value) => {
    const checked = selected.includes(value);
    const next = checked ? selected.filter((v) => v !== value) : [...selected, value];
    return { value, label: labels[value], checked, href: withParams(basePath, params, { [paramKey]: next.join(",") }) };
  });
}

/** Same shape as attributeCheckboxOptions, but for value-level choices whose
 * set varies by the currently-active dimension tab (e.g. 20代/30代/... under
 * 年代 vs 男性/女性 under 性別) — so it takes `{value,label}` pairs directly
 * instead of a `readonly T[]` + `Record<T,string>` fixed to one dimension. */
export function valueCheckboxOptions(
  options: { value: string; label: string }[],
  selected: string[],
  paramKey: string,
  basePath: string,
  params: Record<string, string | undefined>
): { value: string; label: string; checked: boolean; href: string }[] {
  return options.map(({ value, label }) => {
    const checked = selected.includes(value);
    const next = checked ? selected.filter((v) => v !== value) : [...selected, value];
    return { value, label, checked, href: withParams(basePath, params, { [paramKey]: next.join(",") }) };
  });
}

/** Precomputes each tab's href for a single-select attribute param (e.g. "attr").
 * `resetKeys` are cleared alongside `paramKey` in every tab's href — used when
 * switching dimension tabs should also drop a now-stale value-level selection
 * (e.g. switching the trend-chart tab from 年代 to 性別 clears `lineValues`,
 * since "20代"/"30代" aren't valid checkboxes under 性別). */
export function attributeTabOptions<T extends string>(
  all: readonly T[],
  activeValue: T,
  labels: Record<T, string>,
  paramKey: string,
  basePath: string,
  params: Record<string, string | undefined>,
  resetKeys?: string[]
): { value: T; label: string; active: boolean; href: string }[] {
  return all.map((value) => ({
    value,
    label: labels[value],
    active: value === activeValue,
    href: withParams(basePath, params, {
      [paramKey]: value,
      ...Object.fromEntries((resetKeys ?? []).map((k) => [k, ""])),
    }),
  }));
}
