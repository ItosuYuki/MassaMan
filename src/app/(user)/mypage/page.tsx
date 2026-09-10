import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { HeaderMenu } from "@/components/booking/HeaderMenu";
import { PageHeaderBrand } from "@/components/mypage/PageHeaderBrand";
import { FirstTimeGuide } from "@/components/mypage/FirstTimeGuide";
import { CurrentReservationCard } from "@/components/mypage/CurrentReservationCard";
import { RecommendationCard } from "@/components/mypage/RecommendationCard";
import { NotificationSettingsCard } from "@/components/mypage/NotificationSettingsCard";
import { TreatmentHistoryCard } from "@/components/mypage/TreatmentHistoryCard";
import { getMyReservations, getMyReservationHistory, getUpcomingOpenSlots } from "@/lib/booking/actions";
import { getGreeting } from "@/lib/mypage/greeting";

export default async function MyPage() {
  await requireRole("user");

  const [reservations, history, openSlots] = await Promise.all([
    getMyReservations(5),
    getMyReservationHistory(5),
    getUpcomingOpenSlots(2),
  ]);
  const greeting = getGreeting(new Date());
  const hasReservation = reservations.length > 0;

  return (
    <main className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-4 sm:px-8">
        <PageHeaderBrand title="マイページ" />
        <HeaderMenu />
      </header>

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
          <NotificationSettingsCard />
          <TreatmentHistoryCard history={history} />
        </div>
      </div>
    </main>
  );
}
