"use client";

import type { AvailabilityDay } from "@/lib/booking/actions";

const STATUS_SYMBOL: Record<string, string> = {
  reserved: "✓",
  available: "◯",
  full: "✕",
};

const STATUS_LABEL: Record<string, string> = {
  reserved: "予約済み",
  available: "空き",
  full: "埋まってる",
};

function slotClasses(status: string, isSelected: boolean) {
  if (isSelected) return "bg-accent-soft border border-accent text-accent-strong font-bold";
  if (status === "reserved") return "bg-role-user-soft text-role-user";
  if (status === "full") return "bg-surface-2 text-ink-faint";
  return "bg-surface text-ink";
}

export function AvailabilityGrid(props: {
  days: AvailabilityDay[];
  selectedDate: string;
  selectedHour: number | null;
  onSelectSlot: (date: string, hour: number) => void;
}) {
  const { days, selectedDate, selectedHour, onSelectSlot } = props;
  const selectedDay = days.find((d) => d.date === selectedDate);

  return (
    <div>
      <p className="mb-2 text-xs text-ink-faint">空き状況（他の人の予約者名は表示されません）</p>
      <div className="mb-3 flex items-center gap-4 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1">
          <b className="text-role-user">✓</b>予約済み
        </span>
        <span className="flex items-center gap-1">
          <b>◯</b>空き
        </span>
        <span className="flex items-center gap-1">
          <b>✕</b>埋まってる
        </span>
      </div>

      {/* Mobile: list for the selected day */}
      <div className="flex flex-col gap-2 sm:hidden">
        {selectedDay?.slots.map((slot) => {
          const isSelected = selectedHour === slot.hour;
          return (
            <button
              key={slot.hour}
              disabled={slot.status === "full"}
              onClick={() => onSelectSlot(selectedDay.date, slot.hour)}
              className={`flex items-center justify-between rounded-xl px-3.5 py-3 ${slotClasses(
                slot.status,
                isSelected
              )} disabled:cursor-not-allowed`}
            >
              <span className="mono text-sm">{slot.hour}:00</span>
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
            {day.date.slice(5)}
          </div>
        ))}
        {days[0]?.slots.map((_, hourIndex) => (
          <div key={`row-${hourIndex}`} className="contents">
            <div className="mono flex items-center justify-end pr-2 text-[11px] text-ink-faint">
              {days[0].slots[hourIndex].hour}:00
            </div>
            {days.map((day) => {
              const slot = day.slots[hourIndex];
              const isSelected = selectedDate === day.date && selectedHour === slot.hour;
              return (
                <button
                  key={`${day.date}-${slot.hour}`}
                  disabled={slot.status === "full"}
                  onClick={() => onSelectSlot(day.date, slot.hour)}
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
