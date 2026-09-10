import { requireRole } from "@/lib/dal";
import { HeaderMenu } from "@/components/booking/HeaderMenu";
import { PageHeaderBrand } from "@/components/mypage/PageHeaderBrand";
import { TreatmentHistoryList } from "@/components/mypage/TreatmentHistoryList";
import { getMyReservationHistory } from "@/lib/booking/actions";

export default async function HistoryPage() {
  await requireRole("user");
  const history = await getMyReservationHistory(100);

  return (
    <main className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-4 sm:px-8">
        <PageHeaderBrand />
        <HeaderMenu />
      </header>

      <div className="mx-auto max-w-md p-5 sm:max-w-2xl sm:p-8">
        <p className="mb-3 text-xs text-ink-faint">施術履歴</p>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <TreatmentHistoryList history={history} />
        </div>
      </div>
    </main>
  );
}
