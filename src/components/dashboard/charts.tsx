import type {
  TrendPoint,
  VacancyPoint,
  TherapistUtilization,
  AttributeBucket,
  AttributeTrendSeries,
} from "@/lib/dashboard-data";

const Y_TICKS = [100, 75, 50, 25, 0];
/** Horizontal inset (% of the plot width) so the first/last points don't sit
 * flush against the panel edges. */
const X_PAD = 6;

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
 * reference line) is pinned to plain ink so it never collides with either. */
const VALUE_COLORS: Record<string, string> = {
  全体: "var(--color-ink)",
  男性: "var(--color-accent)",
  女性: "var(--color-destructive)",
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
              className="absolute top-0 bottom-0 border border-border bg-ink-faint/10 rounded"
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
  series: { values: number[]; color: string; dashed?: boolean }[];
  labels: string[];
  closed: boolean[];
}) {
  const max = Math.max(100, ...series.flatMap((s) => s.values));
  const xs = xPositions(labels.length);
  const toY = (v: number) => 100 - (v / max) * 100;
  const pathFor = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(2)},${toY(v).toFixed(2)}`).join(" ");

  return (
    <div className="flex flex-col grow">
      <div className="flex grow">
        {/* Y-axis labels — same 0/25/50/75/100 positions as the gridlines below */}
        <div className="relative w-9 shrink-0 h-[190px]">
          {Y_TICKS.map((t) => (
            <span
              key={t}
              className="mono absolute right-1.5 text-[10px] text-ink-faint -translate-y-1/2"
              style={{ top: `${100 - (t / max) * 100}%` }}
            >
              {Math.round((t / 100) * max)}%
            </span>
          ))}
        </div>

        <div className="relative grow h-[190px]">
          {/* Gridlines at the exact same % positions as the Y-axis labels and the plotted points */}
          {Y_TICKS.map((t) => (
            <div
              key={t}
              className={`absolute left-0 right-0 ${t === 0 ? "border-t border-border" : "border-t border-dashed border-border"}`}
              style={{ top: `${100 - (t / max) * 100}%` }}
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
              non-uniformly-stretched viewBox renders as an ellipse, not a circle. */}
          {series.map((s, si) =>
            s.values.map((v, i) => (
              <div
                key={`${si}-${i}`}
                className="absolute w-[7px] h-[7px] rounded-full -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${xs[i]}%`, top: `${toY(v)}%`, background: closed[i] ? "var(--color-border)" : s.color }}
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
  const series: { values: number[]; color: string; dashed?: boolean }[] = [
    { values: points.map((p) => p.currentRate), color: "var(--color-accent)" },
  ];
  if (showPrevious) {
    series.push({ values: points.map((p) => p.previousRate), color: "var(--color-ink-faint)", dashed: true });
  }
  return (
    <div className="flex flex-col grow">
      <div className="flex items-center gap-3 mb-2 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 rounded-sm bg-accent inline-block" />
          今期間
        </span>
        {showPrevious && (
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-sm bg-ink-faint inline-block" />
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
export function AttributeTrendChart({ series }: { series: AttributeTrendSeries[] }) {
  if (series.length === 0) return null;
  const labels = series[0].points.map((p) => p.label);
  const closed = series[0].points.map((p) => p.closed);
  const lineSeries = series.map((s, i) => ({
    values: s.points.map((p) => p.rate),
    color: colorForSeries(s.valueLabel, i),
    dashed: s.valueLabel === "全体",
  }));

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

export function VacancyChart({ points }: { points: VacancyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.vacantHours));

  return (
    <div className="flex flex-col grow px-[3%]">
      <div className="h-[150px] flex items-end gap-2 border-b border-border">
        {points.map((p, i) => (
          <div key={i} className="relative flex flex-col items-center justify-end gap-1.5 flex-1 min-w-0 h-full">
            {p.closed && <div className="absolute inset-0 -mx-1 border border-border bg-ink-faint/10 rounded" />}
            <span className="relative mono text-[10px] text-ink-faint whitespace-nowrap">{p.vacantHours}h</span>
            <div
              className={`relative w-full max-w-[26px] rounded-t ${p.closed ? "bg-ink-faint/25" : "bg-accent opacity-40"}`}
              style={{ height: `${(p.vacantHours / max) * 100}%` }}
            />
          </div>
        ))}
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

export function AttributeBarList({ items }: { items: AttributeBucket[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="text-xs w-16 shrink-0">{b.label}</span>
          <div className="grow h-2.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${b.rate}%` }} />
          </div>
          <span className="mono text-xs w-[30px] text-right">{b.rate}%</span>
        </div>
      ))}
    </div>
  );
}

export function AttributeBarGrid({ items }: { items: AttributeBucket[] }) {
  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((b) => (
        <div key={b.label} className="flex flex-col gap-1.5">
          <span className="text-xs text-ink-faint">{b.label}</span>
          <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${b.rate}%` }} />
          </div>
          <span className="mono text-[11px]">{b.rate}%</span>
        </div>
      ))}
    </div>
  );
}
