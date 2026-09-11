import Link from "next/link";
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

  return (
    <div className="flex min-h-dvh bg-bg">
      <AppSidebar role="user" name={session.name} activePath="/mypage" />
      <main className="grow overflow-y-auto">
        <FirstTimeGuide />

        <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:max-w-2xl sm:p-8">
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
