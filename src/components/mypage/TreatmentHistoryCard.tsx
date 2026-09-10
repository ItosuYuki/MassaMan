import { formatDateWithWeekday, formatTimeLabel } from "@/lib/booking/schedule";
import type { MyReservation } from "@/lib/booking/actions";

export function TreatmentHistoryCard({ history }: { history: MyReservation[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-3 text-xs text-ink-faint">施術履歴</p>
      {history.length === 0 ? (
        <p className="text-sm text-ink-faint">施術履歴はまだありません</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {history.map((r, i) => (
            <div key={r.id} className={i > 0 ? "border-t border-border pt-2.5" : ""}>
              <p className="mono text-sm font-medium text-ink">
                {formatDateWithWeekday(r.date)} {formatTimeLabel(r.startMinutes)}〜
              </p>
              <p className="text-[11px] text-ink-faint">施術時間 {r.durationMinutes}分</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
