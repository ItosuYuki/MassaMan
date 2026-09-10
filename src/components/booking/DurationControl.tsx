"use client";

const MOBILE_CHIPS = [15, 30, 45];
const MIN_DURATION = 5;
const MAX_DURATION = 45;
const STEP = 5;

export function DurationControl(props: { durationMinutes: number; onChange: (minutes: number) => void }) {
  const { durationMinutes, onChange } = props;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-ink-faint">施術時間</span>
        <span className="mono text-base font-bold text-accent-strong">
          {durationMinutes}
          <span className="text-[11px] font-normal text-ink-faint">分</span>
        </span>
      </div>

      {/* Mobile: chips, 30/45 only */}
      <div className="flex gap-2 sm:hidden">
        {MOBILE_CHIPS.map((minutes) => (
          <button
            key={minutes}
            onClick={() => onChange(minutes)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              durationMinutes === minutes ? "border-accent bg-accent text-white" : "border-border text-ink-soft"
            }`}
          >
            {minutes}分
          </button>
        ))}
      </div>

      {/* Desktop: 5-45 min slider, 5-minute steps */}
      <div className="hidden sm:block">
        <input
          type="range"
          min={MIN_DURATION}
          max={MAX_DURATION}
          step={STEP}
          value={durationMinutes}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-ink-faint">
          <span>{MIN_DURATION}分</span>
          <span>
            {MAX_DURATION}分（{STEP}分刻み）
          </span>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        施術時間は最大{MAX_DURATION}分です。施術後の15分は片付けのため、他の方はこの時間帯を予約できません。
      </p>
    </div>
  );
}
