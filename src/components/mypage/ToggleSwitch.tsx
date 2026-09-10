"use client";

export function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors ${
        checked ? "border-accent bg-accent" : "border-border bg-surface-2"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
