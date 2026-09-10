"use client";

import { formatIsoDate } from "@/lib/booking/schedule";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function isPastDate(date: Date, today: Date): boolean {
  return date < today;
}

export function DateStrip(props: {
  weekDates: Date[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canGoPrevWeek: boolean;
}) {
  const { weekDates, selectedDate, onSelectDate, onPrevWeek, onNextWeek, canGoPrevWeek } = props;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rangeLabel =
    weekDates.length > 0
      ? `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()}（月）〜${
          weekDates[weekDates.length - 1].getMonth() + 1
        }/${weekDates[weekDates.length - 1].getDate()}（金）`
      : "";

  return (
    <div>
      <div className="mb-2 text-xs text-ink-faint">日付を選択</div>

      {/* Mobile: horizontal scroll strip */}
      <div className="flex gap-2 overflow-x-auto sm:hidden">
        {weekDates.map((date) => {
          const iso = formatIsoDate(date);
          const isSelected = iso === selectedDate;
          const disabled = isPastDate(date, today);
          return (
            <button
              key={iso}
              disabled={disabled}
              onClick={() => onSelectDate(iso)}
              className={`flex min-w-11 flex-shrink-0 flex-col items-center gap-1 rounded-xl px-0 py-2 disabled:cursor-not-allowed disabled:opacity-40 ${
                isSelected ? "bg-accent text-white" : "bg-surface-2 text-ink-faint"
              }`}
            >
              <span className="text-xs">{WEEKDAY_LABELS[date.getDay()]}</span>
              <span className="mono text-lg font-bold">{date.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Week nav (both mobile and desktop) */}
      <div className="mt-3 flex items-center justify-between sm:mt-0">
        <button
          onClick={onPrevWeek}
          disabled={!canGoPrevWeek}
          aria-label="前の週"
          className="text-ink-soft disabled:cursor-not-allowed disabled:opacity-30"
        >
          ◀
        </button>
        <span className="mono text-xs text-ink-soft">{rangeLabel}</span>
        <button onClick={onNextWeek} aria-label="次の週" className="text-ink-soft">
          ▶
        </button>
      </div>
    </div>
  );
}
