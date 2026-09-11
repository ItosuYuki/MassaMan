"use client";

import type { AvailabilityDay } from "@/lib/booking/actions";
import { formatTimeLabel, formatDateWithWeekday } from "@/lib/booking/schedule";

// "tooLate" (treatment would run past closing) renders identically to "unavailable" —
// same ✕/予約不可 — the two are only distinguished internally.
const STATUS_SYMBOL: Record<string, string> = {
  reserved: "✓",
  available: "◯",
  unavailable: "✕",
  tooLate: "✕",
};

const STATUS_LABEL: Record<string, string> = {
  reserved: "予約済み",
  available: "空き",
  unavailable: "予約不可",
  tooLate: "予約不可",
};

const DISABLED_STATUSES = new Set(["unavailable", "tooLate"]);

function slotClasses(status: string, isSelected: boolean, withBorder = true) {
  if (isSelected) {
    return withBorder
      ? "bg-accent-soft border border-accent text-accent-strong font-bold"
      : "bg-accent-soft text-accent-strong font-bold";
  }
  if (status === "reserved") return "bg-role-user-soft text-role-user";
  if (status === "unavailable" || status === "tooLate") return "bg-surface-2 text-ink-faint";
  return "bg-surface text-ink";
}

export function AvailabilityGrid(props: {
  days: AvailabilityDay[];
  selectedDate: string;
  selectedStartMinutes: number | null;
  durationMinutes: number;
  onSelectSlot: (date: string, startMinutes: number) => void;
}) {
  const { days, selectedDate, selectedStartMinutes, durationMinutes, onSelectSlot } = props;
  const selectedDay = days.find((d) => d.date === selectedDate);
  // PC grid highlights one 15-min row per ~15 minutes of the chosen treatment time
  // (5-15min -> 1 row, 20-30min -> 2 rows, 35-45min -> 3 rows), starting at the picked slot.
  const highlightRowCount = Math.ceil(durationMinutes / 15);
  const selectedDayIndex = days.findIndex((d) => d.date === selectedDate);
  const selectedTickIndex =
    selectedStartMinutes !== null
      ? (days[selectedDayIndex]?.slots.findIndex((s) => s.startMinutes === selectedStartMinutes) ?? -1)
      : -1;

  return (
    <div>
      <p className="mb-2 text-xs text-ink-faint">空き状況</p>
      <div className="mb-3 flex items-center gap-4 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1">
          <b className="text-role-user">✓</b>予約済み
        </span>
        <span className="flex items-center gap-1">
          <b>◯</b>空き
        </span>
        <span className="flex items-center gap-1">
          <b>✕</b>予約不可
        </span>
      </div>

      {/* Mobile: list for the selected day */}
      <div className="flex flex-col gap-2 sm:hidden">
        {selectedDay?.slots.map((slot) => {
          const isSelected = selectedStartMinutes === slot.startMinutes;
          return (
            <button
              key={slot.startMinutes}
              disabled={DISABLED_STATUSES.has(slot.status)}
              onClick={() => onSelectSlot(selectedDay.date, slot.startMinutes)}
              className={`grid grid-cols-[1fr_auto_1fr] items-center rounded-xl px-3.5 py-3 ${slotClasses(
                slot.status,
                isSelected
              )} disabled:cursor-not-allowed`}
            >
              <span className="mono justify-self-start text-sm">{formatTimeLabel(slot.startMinutes)}</span>
              <span className="justify-self-center text-[11px]">
                {STATUS_SYMBOL[slot.status]} {STATUS_LABEL[slot.status]}
              </span>
              <span />
            </button>
          );
        })}
      </div>

      {/* Desktop: full week grid */}
      <div className="relative hidden sm:grid sm:grid-cols-[56px_repeat(5,1fr)] sm:gap-1">
        {selectedTickIndex !== -1 && (
          <div
            className="pointer-events-none absolute inset-0 rounded-md border-2 border-accent-strong"
            style={{
              gridColumnStart: selectedDayIndex + 2,
              gridColumnEnd: selectedDayIndex + 3,
              gridRowStart: selectedTickIndex + 2,
              gridRowEnd: selectedTickIndex + 2 + highlightRowCount,
            }}
          />
        )}
        <div />
        {days.map((day) => (
          <div key={day.date} className="mono text-center text-[11px] text-ink-soft">
            {formatDateWithWeekday(day.date)}
          </div>
        ))}
        {days[0]?.slots.map((_, tickIndex) => (
          <div key={`row-${tickIndex}`} className="contents">
            <div className="mono flex items-center justify-end pr-2 text-[11px] text-ink-faint">
              {formatTimeLabel(days[0].slots[tickIndex].startMinutes)}
            </div>
            {days.map((day) => {
              const slot = day.slots[tickIndex];
              const isSelected =
                selectedDate === day.date &&
                selectedStartMinutes !== null &&
                slot.startMinutes >= selectedStartMinutes &&
                slot.startMinutes < selectedStartMinutes + highlightRowCount * 15;
              return (
                <button
                  key={`${day.date}-${slot.startMinutes}`}
                  disabled={DISABLED_STATUSES.has(slot.status)}
                  onClick={() => onSelectSlot(day.date, slot.startMinutes)}
                  className={`mono rounded-md py-1 text-[11px] ${slotClasses(
                    slot.status,
                    isSelected,
                    false
                  )} disabled:cursor-not-allowed`}
                >
                  {STATUS_SYMBOL[slot.status]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
