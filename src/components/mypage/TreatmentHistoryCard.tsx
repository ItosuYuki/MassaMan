"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateWithWeekday, formatTimeLabel } from "@/lib/booking/schedule";
import { submitReview, type HistoryEntry } from "@/lib/booking/actions";
import { ReviewDialog } from "./ReviewDialog";

export function TreatmentHistoryCard({ history }: { history: HistoryEntry[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<HistoryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmitReview(rating: number, comment: string) {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitReview(target.id, rating, comment);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setTarget(null);
        router.refresh();
      } catch {
        setError("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-3 text-xs text-ink-faint">施術履歴</p>
      {history.length === 0 ? (
        <p className="text-sm text-ink-faint">施術履歴はまだありません</p>
      ) : (
        <div className="flex flex-col gap-3">
          {history.map((r, i) => (
            <div key={r.id} className={i > 0 ? "border-t border-border pt-3" : ""}>
              <p className="mono text-sm font-medium text-ink">
                {formatDateWithWeekday(r.date)} {formatTimeLabel(r.startMinutes)}〜
              </p>
              <p className="text-[11px] text-ink-faint">
                施術時間 {r.durationMinutes}分・担当 {r.therapistName}（{r.therapistSpecialty}）
              </p>
              {r.note && <p className="mt-1 text-[11px] text-ink-soft">メモ: {r.note}</p>}

              {r.review ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-star">
                  {"★".repeat(r.review.rating)}
                  {"☆".repeat(5 - r.review.rating)}
                  {r.review.comment && <span className="text-ink-faint">「{r.review.comment}」</span>}
                </p>
              ) : (
                <button
                  onClick={() => {
                    setError(null);
                    setTarget(r);
                  }}
                  className="mt-1.5 text-xs font-medium text-accent"
                >
                  レビューを書く
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {target && (
        <ReviewDialog
          therapistName={target.therapistName}
          pending={isPending}
          error={error}
          onSubmit={handleSubmitReview}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
