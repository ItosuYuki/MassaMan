"use client";

import { useState } from "react";
import { ToggleSwitch } from "./ToggleSwitch";

const TIMING_OPTIONS = [
  { key: "15min", label: "15分前" },
  { key: "30min", label: "30分前" },
  { key: "1hour", label: "1時間前" },
  { key: "2hour", label: "2時間前" },
];

export function NotificationSettingsCard() {
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [timings, setTimings] = useState<Record<string, boolean>>({
    "15min": false,
    "30min": true,
    "1hour": false,
    "2hour": false,
  });

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-3 text-xs text-ink-faint">通知設定</p>

      <div className="flex items-center justify-between text-sm text-ink">
        通知機能
        <ToggleSwitch checked={notificationsOn} onChange={setNotificationsOn} />
      </div>

      {notificationsOn && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {TIMING_OPTIONS.map((t) => (
            <div key={t.key} className="flex items-center justify-between text-xs text-ink-soft">
              {t.label}
              <ToggleSwitch
                checked={timings[t.key]}
                onChange={(checked) => setTimings((prev) => ({ ...prev, [t.key]: checked }))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
