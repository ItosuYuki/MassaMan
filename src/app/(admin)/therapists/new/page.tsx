import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { AdminSidebar } from "@/components/dashboard/dashboard-shell";
import { TherapistRegistrationForm } from "@/components/admin/therapist-registration-form";
import { getTherapistRegistrationOptions } from "@/lib/therapist-management";

export default async function NewTherapistPage() {
  const session = await requireRole("admin");
  const { rooms } = await getTherapistRegistrationOptions();

  return (
    <div className="min-h-dvh flex bg-bg">
      <AdminSidebar adminName={session.name} active="therapists" />
      <main className="grow min-w-0 overflow-y-auto px-8 py-7">
        <div className="mb-5 flex items-center gap-3">
          <Link href="/therapists" className="text-xs text-ink-faint hover:text-ink">← マッサージ師管理に戻る</Link>
        </div>
        <div className="mb-5">
          <h1 className="text-xl">新しいマッサージ師を登録</h1>
          <p className="mt-1 text-xs text-ink-faint">管理者がアカウントとプロフィールを登録します。</p>
        </div>
        <TherapistRegistrationForm rooms={rooms} />
      </main>
    </div>
  );
}
