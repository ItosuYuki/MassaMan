"use client";

import type { TherapistOption } from "@/lib/booking/actions";
import type { Gender } from "@/lib/booking/mock-data";

export function TherapistPanel(props: {
  candidates: TherapistOption[];
  genderFilter: Gender[];
  onToggleGenderFilter: (gender: Gender) => void;
  selectedTherapistId: string | null;
  onSelectTherapist: (id: string) => void;
}) {
  const { candidates, genderFilter, onToggleGenderFilter, selectedTherapistId, onSelectTherapist } = props;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-ink-faint">施術者</span>
        <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-[11px] font-medium text-amber">
          自動選択（負荷分散を考慮）
        </span>
      </div>

      <div className="mb-2 flex items-center gap-4">
        <span className="flex-shrink-0 text-[11px] text-ink-faint">性別で絞り込み</span>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={genderFilter.includes("male")}
            onChange={() => onToggleGenderFilter("male")}
          />
          男性
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <input
            type="checkbox"
            checked={genderFilter.includes("female")}
            onChange={() => onToggleGenderFilter("female")}
          />
          女性
        </label>
      </div>

      {candidates.length > 0 && candidates.every((c) => !c.isAvailable) && (
        <p className="mb-2 text-xs text-destructive">条件に合う施術者がいません。絞り込みを変更してください。</p>
      )}

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {candidates.map((c) => {
          const isPicked = selectedTherapistId === c.id;
          return (
            <button
              key={c.id}
              disabled={!c.isAvailable}
              onClick={() => onSelectTherapist(c.id)}
              className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
                isPicked ? "border-accent bg-accent-soft" : "border-border"
              }`}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 font-heading text-sm text-accent-strong">
                {c.name.slice(0, 1)}
              </div>
              <div className="flex-grow">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {c.name}
                  {c.isAutoRecommended && (
                    <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-medium text-amber">
                      自動選択
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-faint">{c.specialty}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
