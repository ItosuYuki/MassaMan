"use client";

import { useState } from "react";
import { formatDateWithWeekday, formatTimeLabel } from "@/lib/booking/schedule";
import type { MyReservation } from "@/lib/booking/actions";
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
              <p className="text-xs text-ink-faint">施術時間 {r.durationMinutes}分</p>
            </button>
          ))}
        </div>
      )}

      {children && <div className="mt-4 border-t border-border pt-4">{children}</div>}

      {selected && <ReservationDetailDialog reservation={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
