"use client";

import { useState } from "react";

const STEPS = [
  { title: "① 予約を追加", body: "「予約を追加」から予約画面を開きます。" },
  { title: "② 日時を選択", body: "希望する日付と時間を選びます。" },
  { title: "③ 施術内容を選択", body: "施術者（自動・男性・女性）と施術時間を選びます。" },
  { title: "④ 内容を確認して予約完了", body: "予約内容を確認し、「はい」を押すと予約完了です！" },
];

export function FirstTimeGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border bg-surface px-5 py-3 sm:px-8">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm font-medium text-ink"
      >
        <span>🔰 初めてのご利用の方へ</span>
        <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-ink-soft">マッサージの予約はかんたん4ステップ！</p>
          {STEPS.map((step) => (
            <div key={step.title}>
              <p className="text-xs font-bold text-accent-strong">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{step.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
