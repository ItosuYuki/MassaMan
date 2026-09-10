"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { withParams } from "@/lib/dashboard-url";
import { shiftReference, todayISO, type PeriodType } from "@/lib/period";

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const PRESETS: { label: string; period: PeriodType }[] = [
  { label: "今日", period: "day" },
  { label: "今週", period: "week" },
  { label: "今月", period: "month" },
  { label: "今年", period: "year" },
];

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Range-nav box (prev/next + label) plus a calendar popover — opened by
 * clicking the range label — with quick 今日/今週/今月/今年 presets and a
 * grid for jumping straight to an arbitrary date, replacing "step one period
 * at a time" as the only way to move the date.
 *
 * The grid's own granularity follows the active period tab instead of always
 * being a day grid: picking a specific DAY doesn't make sense when the page
 * is already showing a whole month or year at a time, so period="month"
 * shows a 12-month grid and period="year" shows a grid of years — only
 * period="day"/"week" show individual days.
 *
 * The popover is rendered through a portal into document.body and positioned
 * with `position: fixed` from the trigger box's own measured rect, rather
 * than `absolute` inside this component's normal DOM position — an
 * `absolute` popover only escapes ITS OWN stacking context, and still
 * inherits whatever a distant ancestor does (a clipped `overflow`, a
 * `transform`, a lower `z-index` stacking context) with no reliable way to
 * audit every ancestor between here and the page root. The portal sidesteps
 * that whole class of "renders but isn't visible" failure. */
export function DatePicker({
  period,
  refDate,
  rangeLabel,
  basePath,
  params,
}: {
  period: PeriodType;
  refDate: string;
  rangeLabel: string;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const ref = parseISO(refDate);
  const [viewYear, setViewYear] = useState(ref.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(ref.getUTCMonth());

  const mode: "day" | "month" | "year" = period === "month" ? "month" : period === "year" ? "year" : "day";

  const measure = () => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const go = (changes: Record<string, string>) => {
    router.push(withParams(basePath, params, changes), { scroll: false });
    setOpen(false);
  };

  const openPicker = () => {
    setViewYear(ref.getUTCFullYear());
    setViewMonth(ref.getUTCMonth());
    measure();
    setOpen(true);
  };

  const stepMonth = (dir: 1 | -1) => {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
  const startWeekday = (firstOfMonth.getUTCDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const dayCells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (dayCells.length % 7 !== 0) dayCells.push(null);

  const yearWindowStart = viewYear - 5;
  const yearCells = Array.from({ length: 12 }, (_, i) => yearWindowStart + i);

  const todayIso = todayISO();
  const today = parseISO(todayIso);

  return (
    <div className="shrink-0">
      <div
        ref={boxRef}
        className="flex items-center justify-between gap-2 bg-surface-2 border border-border rounded-[10px] px-3.5 py-2 text-[13px] text-ink-soft w-[300px]"
      >
        <button
          type="button"
          onClick={() => go({ ref: shiftReference(period, refDate, -1) })}
          aria-label="前の期間"
          className="shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4C5C6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="mono whitespace-nowrap">{rangeLabel}</span>
        <button
          type="button"
          onClick={() => go({ ref: shiftReference(period, refDate, 1) })}
          aria-label="次の期間"
          className="shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4C5C6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div className="w-px h-4 bg-border shrink-0" />
        {/* Dedicated calendar-icon trigger — the range label alone didn't read
            as clickable, so date selection gets its own explicit button. */}
        <button
          type="button"
          onClick={openPicker}
          aria-label="日付を選択"
          className="shrink-0 text-ink-faint hover:text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
        </button>
      </div>

      {open &&
        coords &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 w-[280px] bg-surface border border-border rounded-xl p-3.5"
              style={{ top: coords.top, right: coords.right }}
            >
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {PRESETS.filter((p) => p.period === period).map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => go({ period: p.period, ref: todayISO() })}
                    className="px-2.5 py-1 rounded-lg text-[11px] text-ink-soft bg-bg hover:bg-surface-2"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="h-px bg-border -mx-3.5 mb-3" />

              {mode === "day" && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => stepMonth(-1)} aria-label="前の月" className="p-1 text-ink-faint hover:text-ink">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <span className="mono text-xs">
                      {viewYear}年 {viewMonth + 1}月
                    </span>
                    <button type="button" onClick={() => stepMonth(1)} aria-label="次の月" className="p-1 text-ink-faint hover:text-ink">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center">
                    {WEEKDAY_LABELS.map((w) => (
                      <span key={w} className="text-[10px] text-ink-faint">
                        {w}
                      </span>
                    ))}
                    {dayCells.map((day, i) => {
                      if (day === null) return <span key={i} />;
                      const iso = toISO(new Date(Date.UTC(viewYear, viewMonth, day)));
                      const isSelected = iso === refDate;
                      const isToday = iso === todayIso;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => go({ ref: iso })}
                          className={`mono text-[11px] w-7 h-7 rounded-full mx-auto ${
                            isSelected
                              ? "bg-role-admin text-white"
                              : isToday
                                ? "text-accent font-medium"
                                : "text-ink-soft hover:bg-surface-2"
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {mode === "month" && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="前の年" className="p-1 text-ink-faint hover:text-ink">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <span className="mono text-xs">{viewYear}年</span>
                    <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label="次の年" className="p-1 text-ink-faint hover:text-ink">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MONTH_LABELS.map((label, i) => {
                      const isSelected = viewYear === ref.getUTCFullYear() && i === ref.getUTCMonth();
                      const isThisMonth = viewYear === today.getUTCFullYear() && i === today.getUTCMonth();
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => go({ ref: toISO(new Date(Date.UTC(viewYear, i, 1))) })}
                          className={`mono text-[11px] py-2 rounded-lg ${
                            isSelected
                              ? "bg-role-admin text-white"
                              : isThisMonth
                                ? "text-accent font-medium"
                                : "text-ink-soft hover:bg-surface-2"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {mode === "year" && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => setViewYear((y) => y - 12)} aria-label="前の期間" className="p-1 text-ink-faint hover:text-ink">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <span className="mono text-xs">
                      {yearWindowStart}年 - {yearWindowStart + 11}年
                    </span>
                    <button type="button" onClick={() => setViewYear((y) => y + 12)} aria-label="次の期間" className="p-1 text-ink-faint hover:text-ink">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {yearCells.map((y) => {
                      const isSelected = y === ref.getUTCFullYear();
                      const isThisYear = y === today.getUTCFullYear();
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => go({ ref: `${y}-01-01` })}
                          className={`mono text-[11px] py-2 rounded-lg ${
                            isSelected
                              ? "bg-role-admin text-white"
                              : isThisYear
                                ? "text-accent font-medium"
                                : "text-ink-soft hover:bg-surface-2"
                          }`}
                        >
                          {y}年
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
