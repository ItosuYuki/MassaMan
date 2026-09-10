"use client";

import type { AvailabilityDay } from "@/lib/booking/actions";
import { formatTimeLabel } from "@/lib/booking/schedule";

const STATUS_SYMBOL: Record<string, string> = {
  reserved: "✓",
  available: "◯",
  unavailable: "✕",
};

const STATUS_LABEL: Record<string, string> = {
  reserved: "予約済み",
  available: "空き",
  unavailable: "予約不可",
};

function slotClasses(status: string, isSelected: boolean) {
  if (isSelected) return "bg-accent-soft border border-accent text-accent-strong font-bold";
  if (status === "reserved") return "bg-role-user-soft text-role-user";
  if (status === "unavailable") return "bg-surface-2 text-ink-faint";
  return "bg-surface text-ink";
}

export function AvailabilityGrid(props: {
  days: AvailabilityDay[];
  selectedDate: string;
  selectedStartMinutes: number | null;
  onSelectSlot: (date: string, startMinutes: number) => void;
}) {
  const { days, selectedDate, selectedStartMinutes, onSelectSlot } = props;
  const selectedDay = days.find((d) => d.date === selectedDate);

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
              disabled={slot.status === "unavailable"}
              onClick={() => onSelectSlot(selectedDay.date, slot.startMinutes)}
              className={`flex items-center justify-between rounded-xl px-3.5 py-3 ${slotClasses(
                slot.status,
                isSelected
              )} disabled:cursor-not-allowed`}
            >
              <span className="mono text-sm">{formatTimeLabel(slot.startMinutes)}</span>
              <span className="text-[11px]">
                {STATUS_SYMBOL[slot.status]} {STATUS_LABEL[slot.status]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop: full week grid */}
      <div className="hidden sm:grid sm:grid-cols-[56px_repeat(5,1fr)] sm:gap-1">
        <div />
        {days.map((day) => (
          <div key={day.date} className="mono text-center text-[11px] text-ink-soft">
            {day.date.slice(5).replace("-", "/")}
          </div>
        ))}
        {days[0]?.slots.map((_, tickIndex) => (
          <div key={`row-${tickIndex}`} className="contents">
            <div className="mono flex items-center justify-end pr-2 text-[11px] text-ink-faint">
              {formatTimeLabel(days[0].slots[tickIndex].startMinutes)}
            </div>
            {days.map((day) => {
              const slot = day.slots[tickIndex];
              const isSelected = selectedDate === day.date && selectedStartMinutes === slot.startMinutes;
              return (
                <button
                  key={`${day.date}-${slot.startMinutes}`}
                  disabled={slot.status === "unavailable"}
                  onClick={() => onSelectSlot(day.date, slot.startMinutes)}
                  className={`mono rounded-md py-1 text-[11px] ${slotClasses(
                    slot.status,
                    isSelected
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
