"use client";

import { useState } from "react";
import { formatDateWithWeekday, formatTimeLabel } from "@/lib/booking/schedule";
import type { MyReservation } from "@/lib/booking/data";
import { ReservationDetailDialog } from "./ReservationDetailDialog";

export function CurrentReservationCard({
  reservations,
  children,
}: {
  reservations: MyReservation[];
  children?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<MyReservation | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-2 text-xs text-ink-faint">現在の予約</p>
      {reservations.length === 0 ? (
        <p className="text-lg text-ink-faint">現在の予約：なし</p>
      ) : (
        <div className="flex flex-col gap-3">
          {reservations.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className={`text-left ${i > 0 ? "border-t border-border pt-3" : ""}`}
            >
              <p className="mono text-xl font-bold text-accent-strong">
                {formatDateWithWeekday(r.date)} {formatTimeLabel(r.startMinutes)}〜
              </p>
              <div className="mt-2 grid gap-1 text-xs">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">施術者</span>
                  <span className="text-ink-soft">{r.therapistName}</span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">マッサージ室</span>
                  <span className="text-ink-soft">{r.roomName}</span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">施術時間</span>
                  <span className="text-ink-soft">{r.durationMinutes}分</span>
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {children && <div className="mt-4 border-t border-border pt-4">{children}</div>}

      {selected && <ReservationDetailDialog reservation={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
