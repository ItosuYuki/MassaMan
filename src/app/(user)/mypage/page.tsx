import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireRole } from "@/lib/dal";
import { AppSidebar } from "@/components/app-sidebar";
import { FirstTimeGuide } from "@/components/mypage/FirstTimeGuide";
import { CurrentReservationCard } from "@/components/mypage/CurrentReservationCard";
import { RecommendationCard } from "@/components/mypage/RecommendationCard";
import { NotificationSettingsCard } from "@/components/notification-settings-card";
import { TreatmentHistoryCard } from "@/components/mypage/TreatmentHistoryCard";
import { getMyReservations, getMyReservationHistory, getUpcomingOpenSlots } from "@/lib/booking/data";
import { getNotificationCardSettings } from "@/lib/notification-settings";
import { getGreeting } from "@/lib/mypage/greeting";

export default async function MyPage() {
  const session = await requireRole("user");

  const [reservations, history, openSlots, notificationSettings] = await Promise.all([
    getMyReservations(5),
    getMyReservationHistory(5),
    getUpcomingOpenSlots(2),
    getNotificationCardSettings(session.employeeId, "user"),
  ]);
  const greeting = getGreeting(new Date());
  const hasReservation = reservations.length > 0;
  const initial = session.name.trim().charAt(0) || "?";

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <AppSidebar role="user" name={session.name} activePath="/mypage" />
      <main className="grow overflow-y-auto pb-20 sm:pb-0">
        <FirstTimeGuide />

        <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:max-w-2xl sm:p-8">
          <section className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 sm:hidden" aria-label="アカウント情報">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-role-user-soft text-sm font-medium text-role-user">
              {initial}
            </div>
            <div className="min-w-0 grow">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="mt-0.5 text-[11px] text-ink-faint">利用者</p>
            </div>
            <form action={logout}>
              <button type="submit" className="px-1 py-2 text-xs text-destructive">
                ログアウト
              </button>
            </form>
          </section>

          <CurrentReservationCard reservations={reservations}>
            {!hasReservation && <RecommendationCard greeting={greeting} openSlots={openSlots} />}
          </CurrentReservationCard>

          <Link
            href="/booking"
            className="flex h-12 items-center justify-center rounded-xl bg-accent text-sm font-medium text-white"
          >
            予約を追加
          </Link>

          <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2">
            <NotificationSettingsCard role="user" settings={notificationSettings} />
            <TreatmentHistoryCard history={history} />
          </div>
        </div>
      </main>
    </div>
  );
}
