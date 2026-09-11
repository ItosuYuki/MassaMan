import Link from "next/link";
import type { HistoryEntry } from "@/lib/booking/actions";
import { TreatmentHistoryList } from "./TreatmentHistoryList";

export function TreatmentHistoryCard({ history }: { history: HistoryEntry[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-ink-faint">施術履歴</p>
        <Link href="/history" className="text-[11px] font-medium text-accent">
          すべて見る
        </Link>
      </div>
      <TreatmentHistoryList history={history} />
    </div>
  );
}
