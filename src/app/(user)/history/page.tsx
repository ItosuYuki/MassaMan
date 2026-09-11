import { requireRole } from "@/lib/dal";
import { AppSidebar } from "@/components/app-sidebar";
import { TreatmentHistoryList } from "@/components/mypage/TreatmentHistoryList";
import { getMyReservationHistory } from "@/lib/booking/data";

export default async function HistoryPage() {
  const session = await requireRole("user");
  const history = await getMyReservationHistory(100);

  return (
    <div className="flex min-h-dvh bg-bg">
      <AppSidebar role="user" name={session.name} activePath="/history" />
      <main className="grow overflow-y-auto">
        <div className="mx-auto max-w-md p-5 sm:max-w-2xl sm:p-8">
          <p className="mb-3 text-xs text-ink-faint">施術履歴</p>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <TreatmentHistoryList history={history} />
          </div>
        </div>
      </main>
    </div>
  );
}
