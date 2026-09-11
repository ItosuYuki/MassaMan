import { formatTimeLabel, formatDateWithWeekday } from "@/lib/booking/schedule";
import type { Greeting } from "@/lib/mypage/greeting";
import type { OpenSlot } from "@/lib/booking/data";

export function RecommendationCard({ greeting, openSlots }: { greeting: Greeting; openSlots: OpenSlot[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink">
        {greeting.emoji} {greeting.title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{greeting.body}</p>

      {openSlots.length > 0 && (
        <p className="mono mt-3 text-sm text-accent-strong">
          {openSlots.map((s) => `${formatDateWithWeekday(s.date)} ${formatTimeLabel(s.startMinutes)}〜`).join(" / ")}
          <span className="ml-1.5 font-sans text-xs text-ink-faint">空きあり</span>
        </p>
      )}
    </div>
  );
}
