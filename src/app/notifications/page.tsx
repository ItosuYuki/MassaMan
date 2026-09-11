import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationSettingsCard } from "@/components/notification-settings-card";
import { verifySession } from "@/lib/dal";
import { getNotificationCardSettings } from "@/lib/notification-settings";

export default async function NotificationsPage() {
  const session = await verifySession();
  if (session.role === "admin") {
    return (
      <div className="flex h-dvh overflow-hidden bg-bg">
        <AppSidebar role="admin" name={session.name} activePath="/notifications" />
        <main className="grow overflow-y-auto mx-auto w-full max-w-2xl px-5 py-8 sm:px-8">
          <Link href="/dashboard" className="text-xs text-ink-faint hover:text-accent">← ダッシュボードへ戻る</Link>
          <h1 className="mt-4 text-2xl">通知設定</h1>
          <div className="mt-5 rounded-[14px] border border-border bg-surface p-5 text-sm leading-relaxed text-ink-soft">
            管理者アカウントの個人Slack通知設定はありません。予約通知は利用者・マッサージ師の設定に従って送信されます。
          </div>
        </main>
      </div>
    );
  }
  const role = session.role;
  const settings = await getNotificationCardSettings(session.employeeId, role);
  const backPath = role === "user" ? "/booking" : "/schedule";

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <AppSidebar role={role} name={session.name} activePath="/notifications" />
      <main className="grow overflow-y-auto mx-auto w-full max-w-2xl px-5 py-8 sm:px-8">
        <Link href={backPath} className="text-xs text-ink-faint hover:text-accent">← 戻る</Link>
        <h1 className="mt-4 text-2xl">通知設定</h1>
        <p className="mt-2 mb-5 text-sm text-ink-faint">予約に関する通知とSlack連携を設定できます。</p>
        <NotificationSettingsCard role={role} settings={settings} />
      </main>
    </div>
  );
}
