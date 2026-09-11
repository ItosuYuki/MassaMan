import type {
  TrendPoint,
  ShiftBreakdownPoint,
  TherapistUtilization,
  AttributeBucket,
  AttributeTrendSeries,
  AttributeKind,
} from "@/lib/dashboard-data";
import { ALL_ATTRIBUTES, ATTRIBUTE_LABEL } from "@/lib/dashboard-data";

const Y_TICKS = [100, 75, 50, 25, 0];
/** Horizontal inset (% of the plot width) so the first/last points don't sit
 * flush against the panel edges. */
const X_PAD = 6;
/** Vertical inset (% of the plot height), mirroring X_PAD — without it, a
 * point at exactly 0% or 100% sits flush against the plot's top/bottom edge,
 * and since the marker is centered ON that edge (-translate-y-1/2), half of
 * it renders past the edge where the plot's own `overflow-hidden` clips it. */
const Y_PAD = 4;

const LINE_COLORS = [
  "var(--color-accent)",
  "var(--color-star)",
  "var(--color-role-therapist)",
  "var(--color-amber)",
  "var(--color-role-user)",
];

/** 男性/女性 always get the same two colors regardless of what else is checked
 * alongside 性別 — role-user (also blue-family) read too similar to accent for
 * a 2-line comparison, so 女性 is pinned to the destructive red instead of
 * cycling through LINE_COLORS by position. 全体 (the optional whole-population
 * reference line) gets role-admin: it is drawn ALONGSIDE the per-value lines,
 * so it needs a color no dimension's first value can take — accent is already
 * 20代/男性/開発部, and sharing it made the reference line invisible. */
const VALUE_COLORS: Record<string, string> = {
  全体: "var(--color-role-admin)",
  男性: "var(--color-accent)",
  女性: "var(--color-destructive)",
  未回答: "var(--color-amber)",
  "20代": "var(--color-accent)",
  "30代": "var(--color-star)",
  "40代": "var(--color-role-therapist)",
  "50代以上": "var(--color-amber)",
  開発部: "var(--color-accent)",
  営業部: "var(--color-star)",
  総務部: "var(--color-role-therapist)",
  その他: "var(--color-amber)",
};

function colorForSeries(valueLabel: string, index: number): string {
  return VALUE_COLORS[valueLabel] ?? LINE_COLORS[index % LINE_COLORS.length];
}

function xPositions(n: number): number[] {
  if (n <= 1) return [50];
  const span = 100 - 2 * X_PAD;
  return Array.from({ length: n }, (_, i) => X_PAD + (i * span) / (n - 1));
}

/**
 * Shares its layout (a fixed w-9 spacer + a `grow` content column) with the
 * chart plot above it, so the two use the exact same containing-block width —
 * `left:X%` on an absolutely-positioned child is resolved against the padding
 * box of its own container, so two differently-padded siblings never actually
 * line up even at "the same" percentage. Matching structure is what makes them
 * line up here.
 */
function XAxisRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex mt-1.5">
      <div className="w-9 shrink-0" />
      <div className="relative grow h-4">{children}</div>
    </div>
  );
}

function XAxisLabels({ labels, closed }: { labels: string[]; closed: boolean[] }) {
  const xs = xPositions(labels.length);
  return (
    <XAxisRow>
      {labels.map((l, i) => (
        <span
          key={i}
          className={`mono text-[10px] absolute -translate-x-1/2 whitespace-nowrap ${closed[i] ? "text-ink-faint/40" : "text-ink-faint"}`}
          style={{ left: `${xs[i]}%` }}
        >
          {l}
        </span>
      ))}
    </XAxisRow>
  );
}

function ClosedDayBoxes({ xs, closed }: { xs: number[]; closed: boolean[] }) {
  const slot = xs.length > 1 ? (100 - 2 * X_PAD) / (xs.length - 1) : 100;
  return (
    <>
      {xs.map(
        (x, i) =>
          closed[i] && (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-ink-faint/10"
              style={{ left: `${x - slot / 2}%`, width: `${slot}%` }}
            />
          )
      )}
    </>
  );
}

function LineChart({
  series,
  labels,
  closed,
}: {
  series: { values: (number | null)[]; color: string; dashed?: boolean }[];
  labels: string[];
  closed: boolean[];
}) {
  const max = Math.max(100, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const xs = xPositions(labels.length);
  const toY = (v: number) => Y_PAD + (1 - v / max) * (100 - 2 * Y_PAD);
  const pathFor = (values: (number | null)[]) => {
    let path = "";
    values.forEach((v, i) => {
      if (v === null) return;
      const previous = i > 0 ? values[i - 1] : null;
      path += `${previous === null ? "M" : "L"}${xs[i].toFixed(2)},${toY(v).toFixed(2)} `;
    });
    return path.trim();
  };

  return (
    <div className="flex flex-col grow">
      <div className="flex grow">
        {/* Y-axis labels — same 0/25/50/75/100 positions as the gridlines below */}
        <div className="relative w-9 shrink-0 h-[190px]">
          {Y_TICKS.map((t) => (
            <span
              key={t}
              className="mono absolute right-1.5 text-[10px] text-ink-faint -translate-y-1/2"
              style={{ top: `${toY((t / 100) * max)}%` }}
            >
              {Math.round((t / 100) * max)}%
            </span>
          ))}
        </div>

        <div className="relative grow h-[190px] overflow-hidden">
          {/* Gridlines at the exact same % positions as the Y-axis labels and the plotted points */}
          {Y_TICKS.map((t) => (
            <div
              key={t}
              className={`absolute left-0 right-0 ${t === 0 ? "border-t border-border" : "border-t border-dashed border-border"}`}
              style={{ top: `${toY((t / 100) * max)}%` }}
            />
          ))}

          <ClosedDayBoxes xs={xs} closed={closed} />

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
            {series.map((s, i) => (
              <path
                key={i}
                d={pathFor(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray={s.dashed ? "4,3" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Point markers as plain HTML circles (fixed px size) — an SVG <circle> inside a
              non-uniformly-stretched viewBox renders as an ellipse, not a circle.
              `closed` is derived from the CURRENT range's buckets only (see
              getUtilizationTrend) — it doesn't know whether the PREVIOUS
              period's same bucket was itself closed, so the dashed/previous
              series always keeps its real color rather than graying out on
              what might just be this period's holiday. */}
          {series.map((s, si) =>
            s.values.map((v, i) => v !== null && (
              <div
                key={`${si}-${i}`}
                className="absolute w-[7px] h-[7px] rounded-full -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${xs[i]}%`,
                  top: `${toY(v)}%`,
                  background: closed[i] && !s.dashed ? "var(--color-border)" : s.color,
                }}
              />
            ))
          )}
        </div>
      </div>

      <XAxisLabels labels={labels} closed={closed} />
    </div>
  );
}

/** A dashed swatch is drawn as a dotted border rather than a solid bar so the
 * legend actually distinguishes the 前期間 line from the 今期間 one — they
 * share a color, and the dash is the only thing telling them apart. */
function LegendSwatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <span className="w-2.5 inline-block border-t-2 border-dotted" style={{ borderColor: color }} />
  ) : (
    <span className="w-2.5 h-0.5 rounded-sm inline-block" style={{ background: color }} />
  );
}

/** Renders its own legend in the same spot AttributeTrendChart does (right
 * after the panel's description paragraph, before the chart) so the legend
 * never jumps position when the admin toggles the attribute checkboxes. */
export function UtilizationTrendChart({ points, showPrevious }: { points: TrendPoint[]; showPrevious: boolean }) {
  const series: { values: (number | null)[]; color: string; dashed?: boolean }[] = [
    { values: points.map((p) => p.currentRate), color: "var(--color-accent)" },
  ];
  if (showPrevious) {
    series.push({ values: points.map((p) => p.previousRate), color: "var(--color-accent)", dashed: true });
  }
  return (
    <div className="flex flex-col grow">
      <div className="flex items-center gap-3 mb-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <LegendSwatch color="var(--color-accent)" />
          今期間
        </span>
        {showPrevious && (
          <span className="flex items-center gap-1.5">
            <LegendSwatch color="var(--color-accent)" dashed />
            前期間
          </span>
        )}
      </div>
      <LineChart series={series} labels={points.map((p) => p.label)} closed={points.map((p) => p.closed)} />
    </div>
  );
}

/** Multiple attribute-value lines overlaid for direct comparison (e.g. 男性 vs
 * 女性), each the slice of the overall occupancy rate attributable to that
 * value — same shift-minute denominator for every line, so the lines of one
 * dimension sum back to the 全体 line. See getUtilizationTrendByAttribute. */
export function AttributeTrendChart({ series, showPrevious }: { series: AttributeTrendSeries[]; showPrevious: boolean }) {
  if (series.length === 0) return null;
  const labels = series[0].points.map((p) => p.label);
  const closed = series[0].points.map((p) => p.closed);
  const lineSeries = series.flatMap((s, i) => {
    const color = colorForSeries(s.valueLabel, i);
    return [
      { values: s.points.map((p) => p.rate), color },
      ...(showPrevious && s.points.some((p) => p.previousRate !== null)
        ? [{ values: s.points.map((p) => p.previousRate), color, dashed: true }]
        : []),
    ];
  });

  return (
    <div className="flex flex-col grow">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        {series.map((s, i) => (
          <span key={s.valueLabel} className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <LegendSwatch color={colorForSeries(s.valueLabel, i)} />
            {s.valueLabel}
          </span>
        ))}
        {lineSeries.some((s) => s.dashed) && (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <LegendSwatch color="var(--color-ink-faint)" dashed />
            前期間
          </span>
        )}
      </div>
      <LineChart series={lineSeries} labels={labels} closed={closed} />
    </div>
  );
}

/** 稼働時間 (booked, cleanup buffer included — occupied room time, not pure
 * treatment time) stacked with 空き時間 (vacant) into one bar per bucket —
 * a 空き時間-only bar told only half the story (vacant relative to what?);
 * stacking both onto the shift-time axis they actually share answers that. */
// Layout constants for the bar column below (all pixels, matching the row's
// fixed h-[150px]). The bar's height is computed from these fixed constants
// rather than from a percentage of a flex container that also holds the
// labels — otherwise two equal `total`s could render at different heights
// depending on how many labels happen to surround each one, since flexbox's
// shrink-to-fit reacts to sibling content.
const TOTAL_LABEL_RESERVE_PX = 18; // matching the h-[18px] total-value row above the chart area
const CHART_AREA_PX = 150 - TOTAL_LABEL_RESERVE_PX;
const LABEL_SLOT_PX = 19; // one segment label's rendered footprint (~16px) plus a small gap
const BAR_AREA_PX = CHART_AREA_PX - 2 * LABEL_SLOT_PX; // headroom for up to 2 stacked segment labels

export function ShiftBreakdownChart({ points }: { points: ShiftBreakdownPoint[] }) {
  const max = Math.max(1, ...points.flatMap((p) => (p.totalHours === null ? [] : [p.totalHours])));

  return (
    <div className="flex flex-col grow">
      <div className="flex items-center gap-3 mb-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--color-accent)" }} />
          稼働時間
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block border border-border"
            style={{ background: "var(--color-surface-2)" }}
          />
          空き時間
        </span>
      </div>
      <div className="flex flex-col grow px-[3%]">
        <div className="h-[150px] flex items-end gap-2 border-b border-border overflow-hidden">
          {points.map((p, i) => {
            // `total` drives the bar's height and MUST come from the true
            // available-minutes figure (totalHours), not from bookedHours +
            // vacantHours — those two are each independently rounded to the
            // nearest 0.1h for their own labels, so their sum can drift from
            // the real total by up to ~0.1h (e.g. 0.8h + 0.3h even though the
            // real split was 0.75h/0.25h out of a true 1.0h total).
            const total = p.totalHours;
            // The two segments' labels are already-rounded values (see above),
            // so they don't necessarily add up to `total` — split the bar by
            // their OWN sum instead, so the two colored rects still always
            // fill exactly 100% of the bar's box regardless of that drift.
            const labelSum = (p.bookedHours ?? 0) + (p.vacantHours ?? 0);
            // The bar's own height is a pure function of (total, max) in FIXED
            // pixels, not a flex/percentage size — if it were a percentage of a
            // flex container that also holds the labels, two equal `total`s could
            // render at different heights depending on how many labels happen to
            // surround each one (flexbox's shrink-to-fit kicking in differently
            // per column). BAR_AREA_PX reserves enough headroom above the tallest
            // possible bar for up to two stacked segment labels (see below) so
            // labels are never clipped by the row's overflow-hidden.
            const barPx = total ? (total / max) * BAR_AREA_PX : 0;
            const vacantPx = labelSum ? ((p.vacantHours ?? 0) / labelSum) * barPx : 0;
            const bookedPx = labelSum ? ((p.bookedHours ?? 0) / labelSum) * barPx : 0;
            const vacantShown = !p.closed && total !== null && total > 0 && p.vacantHours !== null && p.vacantHours > 0;
            const bookedShown = !p.closed && total !== null && total > 0 && p.bookedHours !== null && p.bookedHours > 0;
            // 稼働時間's label normally floats directly above its own segment (the
            // vacant/booked boundary). But when 空き時間 is too thin to leave room
            // for it there, it would land on top of 空き時間's own label above the
            // bar — so in that case it stacks above 空き時間's label instead,
            // guaranteeing the two labels never overlap regardless of how thin
            // either segment is.
            const bookedStacked = bookedShown && vacantPx < LABEL_SLOT_PX;
            return (
              <div key={i} className="relative flex flex-col flex-1 min-w-0 h-full">
                {p.closed && <div className="absolute inset-0 -mx-1 bg-ink-faint/10" />}
                <div className="h-[18px] flex items-center justify-center">
                  {total !== null && (
                    <span className="relative mono text-[10px] text-ink-faint max-w-full text-center truncate">{total}h</span>
                  )}
                </div>
                <div className="relative w-full" style={{ height: `${CHART_AREA_PX}px` }}>
                  {total !== null && total > 0 && (
                    <div
                      className="absolute left-1/2 bottom-0 w-full max-w-[26px] -translate-x-1/2"
                      style={{ height: `${barPx}px` }}
                    >
                      {/* Colored segments live in their own clipped layer so the
                          rounded top corner still clips cleanly even though labels
                          are free to spill outside the bar's own box. */}
                      <div className="absolute inset-0 rounded-t overflow-hidden flex flex-col border border-border">
                        <div
                          style={{
                            height: `${labelSum ? ((p.vacantHours ?? 0) / labelSum) * 100 : 0}%`,
                            background: p.closed ? "var(--color-ink-faint)" : "var(--color-surface-2)",
                            opacity: p.closed ? 0.25 : 1,
                          }}
                        />
                        <div
                          className="border-t border-border"
                          style={{
                            height: `${labelSum ? ((p.bookedHours ?? 0) / labelSum) * 100 : 0}%`,
                            background: p.closed ? "var(--color-ink-faint)" : "var(--color-accent)",
                            opacity: p.closed ? 0.25 : 1,
                          }}
                        />
                      </div>
                      {bookedShown && !bookedStacked && (
                        <span
                          className="absolute left-1/2 -translate-x-1/2 mono text-[9px] leading-[14px] whitespace-nowrap rounded border bg-surface px-1"
                          style={{ bottom: `${bookedPx + 2}px`, borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                        >
                          {p.bookedHours}h
                        </span>
                      )}
                    </div>
                  )}
                  {vacantShown && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 mono text-[9px] leading-[14px] whitespace-nowrap rounded border border-border bg-surface px-1"
                      style={{ bottom: `${barPx + 2}px`, color: "var(--color-ink-soft)" }}
                    >
                      {p.vacantHours}h
                    </span>
                  )}
                  {bookedStacked && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 mono text-[9px] leading-[14px] whitespace-nowrap rounded border bg-surface px-1"
                      style={{
                        bottom: `${barPx + (vacantShown ? LABEL_SLOT_PX : 0) + 2}px`,
                        borderColor: "var(--color-accent)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {p.bookedHours}h
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Same flex-1 + gap-2 columns as the bar row above, so each label lands
            directly under its own bar instead of drifting due to a mismatched gap. */}
        <div className="flex gap-2 mt-1.5">
          {points.map((p, i) => (
            <span
              key={i}
              className={`mono text-[10px] flex-1 min-w-0 text-center truncate ${p.closed ? "text-ink-faint/40" : "text-ink-faint"}`}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TherapistBarList({ items }: { items: TherapistUtilization[] }) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((t) => (
        <div key={t.therapistId} className="flex items-center gap-3">
          <span className="text-[13px] w-[76px] shrink-0 truncate">{t.name}</span>
          <div className="grow h-2.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-role-admin" style={{ width: `${t.rate}%` }} />
          </div>
          <span className="mono text-xs w-8 text-right">{t.rate}%</span>
        </div>
      ))}
    </div>
  );
}

/** One dimension's buckets (e.g. 年代's 20代/30代/40代/50代以上) as a single
 * horizontal bar, segmented by each value's share instead of one separate bar
 * per value — reads as "how the dimension splits" at a glance rather than as
 * N independent percentages. Segment colors reuse colorForSeries, the same
 * mapping the trend chart's per-value lines use, so a value is the same color
 * everywhere on the page. Segments sum to ~100% (denominator is everyone who
 * used it, per getAttributeUtilization) — short of it only when a user has no
 * value on file for this dimension (e.g. no age bracket recorded). */
export function AttributeStackedBar({ items }: { items: AttributeBucket[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-3 rounded-full bg-surface-2 overflow-hidden">
        {items.map(
          (b, i) =>
            b.rate > 0 && (
              <div key={b.label} style={{ width: `${b.rate}%`, background: colorForSeries(b.label, i) }} />
            )
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((b, i) => (
          <span key={b.label} className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span
              className="w-2 h-2 rounded-full inline-block shrink-0"
              style={{ background: colorForSeries(b.label, i) }}
            />
            {b.label}
            <span className="mono text-ink-faint">{b.rate}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 年代/性別/部署 shown together as stacked sub-sections instead of behind a
 * dimension tab switcher — seeing only one attribute's ratio at a time hid the
 * other two, and the ask was to see how usage splits across all of them. */
export function AttributeBarSections({ buckets }: { buckets: Record<AttributeKind, AttributeBucket[]> }) {
  return (
    <div className="flex flex-col gap-5">
      {ALL_ATTRIBUTES.map((a) => (
        <div key={a}>
          <h4 className="text-[11px] text-ink-faint mb-2">{ATTRIBUTE_LABEL[a]}</h4>
          <AttributeStackedBar items={buckets[a]} />
        </div>
      ))}
    </div>
  );
}
