"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withParams } from "@/lib/dashboard-url";
import { shiftReference, todayISO, type PeriodType } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const PRESETS: { label: string; period: PeriodType }[] = [
  { label: "今日", period: "day" },
  { label: "今週", period: "week" },
  { label: "今月", period: "month" },
  { label: "今年", period: "year" },
];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Range-nav box (prev/next + label) plus a shadcn/ui Popover+Calendar
 * date-picker — opened by clicking the calendar icon — with quick
 * 今日/今週/今月/今年 presets, replacing "step one period at a time" as the
 * only way to move the date (see PR #16 review: 日付切り替えのコストが重い).
 *
 * The popover's own content follows the active period tab instead of always
 * being a day grid: picking a specific DAY doesn't make sense when the page
 * is already showing a whole month or year at a time, so period="month"
 * shows a 12-month grid and period="year" shows a grid of years via a plain
 * button grid, while period="day"/"week" use the shadcn Calendar component
 * for individual-day selection. */
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
  const [open, setOpen] = useState(false);
  const ref = parseISO(refDate);
  const [viewYear, setViewYear] = useState(ref.getFullYear());
  const [viewMonth, setViewMonth] = useState(ref.getMonth());

  const mode: "day" | "month" | "year" = period === "month" ? "month" : period === "year" ? "year" : "day";

  const go = (changes: Record<string, string>) => {
    router.push(withParams(basePath, params, changes), { scroll: false });
    setOpen(false);
  };

  const openPicker = (nextOpen: boolean) => {
    if (nextOpen) {
      setViewYear(ref.getFullYear());
      setViewMonth(ref.getMonth());
    }
    setOpen(nextOpen);
  };

  const yearWindowStart = viewYear - 5;
  const yearCells = Array.from({ length: 12 }, (_, i) => yearWindowStart + i);
  const todayIso = todayISO();
  const today = parseISO(todayIso);

  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between gap-2 bg-surface-2 border border-border rounded-[10px] px-3.5 py-2 text-[13px] text-ink-soft w-[300px]">
        <button
          type="button"
          onClick={() => go({ ref: shiftReference(period, refDate, -1) })}
          aria-label="前の期間"
          className="shrink-0 text-ink-soft hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="mono whitespace-nowrap">{rangeLabel}</span>
        <button
          type="button"
          onClick={() => go({ ref: shiftReference(period, refDate, 1) })}
          aria-label="次の期間"
          className="shrink-0 text-ink-soft hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <div className="w-px h-4 bg-border shrink-0" />
        <Popover open={open} onOpenChange={openPicker}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="日付を選択" className="shrink-0 text-ink-faint hover:text-ink">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M8 3v4M16 3v4M3 10h18" />
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[280px]">
            <div className="flex items-center justify-center gap-1.5 flex-wrap mb-3">
              {PRESETS.filter((p) => p.period === period).map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => go({ period: p.period, ref: todayISO() })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="h-px bg-border -mx-3.5 mb-3" />

            {mode === "day" && (
              <Calendar
                mode="single"
                month={new Date(viewYear, viewMonth, 1)}
                onMonthChange={(d) => {
                  setViewYear(d.getFullYear());
                  setViewMonth(d.getMonth());
                }}
                selected={ref}
                onSelect={(d) => d && go({ ref: toISO(d) })}
              />
            )}

            {mode === "month" && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <Button type="button" variant="ghost" size="icon" onClick={() => setViewYear((y) => y - 1)} aria-label="前の年" className="h-7 w-7 p-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </Button>
                  <span className="mono text-xs">{viewYear}年</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setViewYear((y) => y + 1)} aria-label="次の年" className="h-7 w-7 p-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {MONTH_LABELS.map((label, i) => {
                    const isSelected = viewYear === ref.getFullYear() && i === ref.getMonth();
                    const isThisMonth = viewYear === today.getFullYear() && i === today.getMonth();
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => go({ ref: toISO(new Date(viewYear, i, 1)) })}
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
                  <Button type="button" variant="ghost" size="icon" onClick={() => setViewYear((y) => y - 12)} aria-label="前の期間" className="h-7 w-7 p-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </Button>
                  <span className="mono text-xs">
                    {yearWindowStart}年 - {yearWindowStart + 11}年
                  </span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setViewYear((y) => y + 12)} aria-label="次の期間" className="h-7 w-7 p-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {yearCells.map((y) => {
                    const isSelected = y === ref.getFullYear();
                    const isThisYear = y === today.getFullYear();
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
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
