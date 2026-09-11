"use client";

import { useEffect, useState } from "react";
import { ToggleSwitch } from "./ToggleSwitch";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  type ReminderMinutes,
} from "@/lib/notifications/actions";

const TIMING_OPTIONS: { minutes: ReminderMinutes; label: string }[] = [
  { minutes: 15, label: "15分前" },
  { minutes: 30, label: "30分前" },
  { minutes: 60, label: "1時間前" },
  { minutes: 120, label: "2時間前" },
];

export function NotificationSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState<ReminderMinutes[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMyNotificationPreferences().then((prefs) => {
      setEnabled(prefs.enabled);
      setReminderMinutes(prefs.reminderMinutes);
      setLoaded(true);
    });
  }, []);

  function save(next: { enabled: boolean; reminderMinutes: ReminderMinutes[] }) {
    setEnabled(next.enabled);
    setReminderMinutes(next.reminderMinutes);
    updateMyNotificationPreferences(next);
  }

  function toggleMinutes(minutes: ReminderMinutes, checked: boolean) {
    const next = checked
      ? [...reminderMinutes, minutes]
      : reminderMinutes.filter((m) => m !== minutes);
    save({ enabled, reminderMinutes: next });
  }

  if (!loaded) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="mb-3 text-xs text-ink-faint">通知設定</p>

      <div className="flex items-center justify-between text-sm text-ink">
        通知機能
        <ToggleSwitch checked={enabled} onChange={(checked) => save({ enabled: checked, reminderMinutes })} />
      </div>

      {enabled && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {TIMING_OPTIONS.map((t) => (
            <div key={t.minutes} className="flex items-center justify-between text-xs text-ink-soft">
              {t.label}
              <ToggleSwitch
                checked={reminderMinutes.includes(t.minutes)}
                onChange={(checked) => toggleMinutes(t.minutes, checked)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
