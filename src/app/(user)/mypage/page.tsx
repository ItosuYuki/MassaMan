import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { HeaderMenu } from "@/components/booking/HeaderMenu";
import { LogoBadge } from "@/components/mypage/LogoBadge";
import { FirstTimeGuide } from "@/components/mypage/FirstTimeGuide";
import { CurrentReservationCard } from "@/components/mypage/CurrentReservationCard";
import { RecommendationCard } from "@/components/mypage/RecommendationCard";
import { getMyReservations, getTodaysOpenSlots } from "@/lib/booking/actions";
import { getGreeting } from "@/lib/mypage/greeting";

export default async function MyPage() {
  await requireRole("user");

  const [reservations, openSlots] = await Promise.all([getMyReservations(5), getTodaysOpenSlots(2)]);
  const greeting = getGreeting(new Date());
  const hasReservation = reservations.length > 0;

  return (
    <main className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <LogoBadge size={32} />
          <h1 className="text-lg">マイページ</h1>
        </div>
        <HeaderMenu />
      </header>

      <FirstTimeGuide />

      <div className="mx-auto flex max-w-md flex-col gap-5 p-5 sm:p-8">
        <CurrentReservationCard reservations={reservations} />
        {!hasReservation && <RecommendationCard greeting={greeting} openSlots={openSlots} />}

        <Link
          href="/booking"
          className="flex h-12 items-center justify-center rounded-xl bg-accent text-sm font-medium text-white"
        >
          予約を追加
        </Link>
      </div>
    </main>
  );
}
