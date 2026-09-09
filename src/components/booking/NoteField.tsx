"use client";

export function NoteField(props: { note: string; onChange: (note: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-xs text-ink-faint" htmlFor="booking-note">
        施術してほしい部位・伝えたいこと（任意）
      </label>
      <textarea
        id="booking-note"
        value={props.note}
        onChange={(e) => props.onChange(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-border bg-surface p-3 text-sm leading-relaxed text-ink-soft"
        placeholder="例）肩と首の張りが強いです。デスクワーク中心なので重点的にお願いしたいです。"
      />
    </div>
  );
}
