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
 * reference line) is pinned to the default blue accent. */
const VALUE_COLORS: Record<string, string> = {
  全体: "var(--color-series-overall)",
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

/** Renders its own legend in the same spot AttributeTrendChart does (right
 * after the panel's description paragraph, before the chart) so the legend
 * never jumps position when the admin toggles the attribute checkboxes. */
export function UtilizationTrendChart({ points, showPrevious }: { points: TrendPoint[]; showPrevious: boolean }) {
  const series: { values: (number | null)[]; color: string; dashed?: boolean }[] = [
    { values: points.map((p) => p.currentRate), color: "var(--color-series-overall)" },
  ];
  if (showPrevious) {
    series.push({ values: points.map((p) => p.previousRate), color: "var(--color-series-overall)", dashed: true });
  }
  return (
    <div className="flex flex-col grow">
      <div className="flex items-center gap-3 mb-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 rounded-sm inline-block" style={{ background: "var(--color-series-overall)" }} />
          今期間
        </span>
        {showPrevious && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-sm inline-block" style={{ background: "var(--color-series-overall)" }} />
            前期間
          </span>
        )}
      </div>
      <LineChart series={series} labels={points.map((p) => p.label)} closed={points.map((p) => p.closed)} />
    </div>
  );
}

/** Multiple attribute-value lines overlaid for direct comparison (e.g. 男性 vs
 * 女性), each against its OWN group's headcount — see getUtilizationTrendByAttribute. */
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
            <span className="w-2.5 h-0.5 rounded-sm inline-block" style={{ background: colorForSeries(s.valueLabel, i) }} />
            {s.valueLabel}
          </span>
        ))}
      </div>
      <LineChart series={lineSeries} labels={labels} closed={closed} />
    </div>
  );
}

/** 施術時間 (booked) stacked with 空き時間 (vacant) into one bar per bucket —
 * a 空き時間-only bar told only half the story (vacant relative to what?);
 * stacking both onto the shift-time axis they actually share answers that. */
export function ShiftBreakdownChart({ points }: { points: ShiftBreakdownPoint[] }) {
  const max = Math.max(
    1,
    ...points.flatMap((p) => (p.bookedHours === null || p.vacantHours === null ? [] : [p.bookedHours + p.vacantHours]))
  );

  return (
    <div className="flex flex-col grow">
      <div className="flex items-center gap-3 mb-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--color-accent)" }} />
          施術時間
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--color-accent)", opacity: 0.35 }} />
          空き時間
        </span>
      </div>
      <div className="flex flex-col grow px-[3%]">
        <div className="h-[150px] flex items-end gap-2 border-b border-border overflow-hidden">
          {points.map((p, i) => {
            // Round the sum too — adding two already-rounded-to-0.1 floats
            // (e.g. 18.1 + 18.0) can itself land on a binary float that isn't
            // exactly 36.1, printing as "36.099999999999994".
            const total =
              p.bookedHours !== null && p.vacantHours !== null
                ? Math.round((p.bookedHours + p.vacantHours) * 10) / 10
                : null;
            return (
              <div key={i} className="relative flex flex-col items-center justify-end gap-1.5 flex-1 min-w-0 h-full">
                {p.closed && <div className="absolute inset-0 -mx-1 bg-ink-faint/10" />}
                {total !== null && (
                  <span className="relative mono text-[10px] text-ink-faint w-full text-center truncate">{total}h</span>
                )}
                {total !== null && total > 0 && (
                  <div
                    className="relative w-full max-w-[26px] rounded-t overflow-hidden flex flex-col"
                    style={{ height: `${(total / max) * 100}%` }}
                  >
                    <div
                      style={{
                        height: `${(p.vacantHours! / total) * 100}%`,
                        background: p.closed ? "var(--color-ink-faint)" : "var(--color-accent)",
                        opacity: p.closed ? 0.25 : 0.35,
                      }}
                    />
                    <div
                      style={{
                        height: `${(p.bookedHours! / total) * 100}%`,
                        background: p.closed ? "var(--color-ink-faint)" : "var(--color-accent)",
                        opacity: p.closed ? 0.25 : 1,
                      }}
                    />
                  </div>
                )}
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
