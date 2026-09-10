"use client";

import { useActionState } from "react";
import { disconnectSlackAction } from "@/app/actions/slack";
import { saveNotificationSettings, type NotificationSettingsActionState } from "@/app/actions/notifications";
import type { NotificationCardSettings } from "@/lib/notification-settings";

const TIMING_OPTIONS = [5, 10, 15, 30, 60, 120];

export function NotificationSettingsCard({ role, settings }: { role: "user" | "therapist"; settings: NotificationCardSettings }) {
  const [state, formAction, pending] = useActionState<NotificationSettingsActionState, FormData>(
    saveNotificationSettings,
    {}
  );
  const isUser = role === "user";

  return (
    <form action={formAction} className="w-full rounded-[14px] border border-border bg-surface px-[18px] py-4">
      <h3 className="mb-0.5 text-sm">{isUser ? "予約リマインド通知" : "予約・キャンセル通知"}</h3>

      <div className="mb-2 rounded-lg bg-accent-soft px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-accent-strong">Slack通知</div>
            <div className="mt-0.5 text-[11px] text-ink-faint">
              {settings.slackConnection ? `連携済み（${settings.slackConnection.slackUserId}）` : "Slackから個人DMを受け取る"}
            </div>
          </div>
          {settings.slackConnection ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-accent">✓ 連携済み</span>
              <button formAction={disconnectSlackAction} type="submit" className="text-[11px] text-destructive underline">解除</button>
            </div>
          ) : (
            <a href="/api/slack/connect" className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-accent-strong">
              Slackと連携する
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 py-[11px]">
        <div>
          <div className="text-[13px]">通知</div>
          <div className="mt-0.5 text-[11px] text-ink-faint">
            {isUser ? "アプリ内通知 + メール" : "Slack個人DM"}
          </div>
        </div>
        <label className="relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center">
          <input name="enabled" type="checkbox" defaultChecked={settings.enabled} className="peer sr-only" />
          <span className="absolute inset-0 rounded-[11px] border border-border bg-surface-2 transition peer-checked:border-accent peer-checked:bg-accent" />
          <span className="absolute left-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition peer-checked:left-[18px]" />
          <span className="sr-only">通知を{settings.enabled ? "無効" : "有効"}にする</span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border py-[11px]">
        <div>
          <div className="text-[13px]">通知タイミング</div>
          <div className="mt-0.5 text-[11px] text-ink-faint">予約時刻の何分前に届けるか</div>
        </div>
        <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
          <select name="minutesBefore" defaultValue={settings.minutesBefore} disabled={pending} className="mono cursor-pointer appearance-none bg-transparent text-[13px] font-bold text-accent-strong outline-none">
            {TIMING_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes}</option>)}
          </select>
          <span className="text-xs text-ink-faint">分前</span>
        </label>
      </div>

      <div className="border-t border-border py-2">
        <div className="mb-1.5 text-[11px] font-medium text-ink-soft">通知するイベント</div>
        {[
          ["reservationCreatedEnabled", "予約完了・新規予約"],
          ["reservationCancelledEnabled", "キャンセル"],
          ["reminderEnabled", "予約前リマインド"],
        ].map(([name, label]) => (
          <label key={name} className="flex items-center gap-2 py-1 text-xs text-ink-soft">
            <input name={name} type="checkbox" defaultChecked={settings[name as keyof typeof settings] as boolean} className="h-3.5 w-3.5 accent-accent" />
            {label}
          </label>
        ))}
      </div>

      <button type="submit" disabled={pending} className="mt-1 h-9 w-full rounded-lg bg-accent text-xs font-medium text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60">
        {pending ? "保存中…" : state.saved ? "保存しました" : "設定を保存"}
      </button>
      {state.error && <p role="alert" className="mt-2 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
