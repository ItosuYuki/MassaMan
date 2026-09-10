"use client";

import { useState } from "react";

const STEPS = [
  "「予約を追加」から予約画面を開きます",
  "予約したい日付と時間を選びます",
  "施術者（自動／男性／女性）と施術時間を選びます",
  "内容を確認して「はい」を押せば予約完了です",
];

export function FirstTimeGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border bg-surface px-5 py-3 sm:px-8">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm text-ink"
      >
        <span>🔰 初めてのご利用の方へ</span>
        <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ol className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-ink-soft">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="mono flex-shrink-0 font-bold text-accent-strong">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
