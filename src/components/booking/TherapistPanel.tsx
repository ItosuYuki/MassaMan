"use client";

export type TherapistMode = "auto" | "male" | "female";

const MODES: { key: TherapistMode; label: string }[] = [
  { key: "auto", label: "自動" },
  { key: "male", label: "男性" },
  { key: "female", label: "女性" },
];

export function TherapistPanel(props: {
  mode: TherapistMode;
  onChangeMode: (mode: TherapistMode) => void;
  hasEligibleTherapist: boolean;
  slotSelected: boolean;
}) {
  const { mode, onChangeMode, hasEligibleTherapist, slotSelected } = props;

  return (
    <div>
      <div className="mb-2 text-xs text-ink-faint">施術者</div>
      <div className="flex gap-2">
        {MODES.map((m) => {
          const isPicked = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => onChangeMode(m.key)}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                isPicked ? "border-accent bg-accent text-white font-medium" : "border-border text-ink-soft"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "auto" && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber">
          空いている施術者の中から、システムが自動で選択します。
          <br />
          施術者の指定がない場合におすすめです。
        </p>
      )}

      {slotSelected && !hasEligibleTherapist && (
        <p className="mt-2 text-xs text-destructive">この条件に合う施術者が空いていません。別の枠か条件を選んでください。</p>
      )}
    </div>
  );
}
