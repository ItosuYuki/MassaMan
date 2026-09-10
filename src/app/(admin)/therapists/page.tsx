import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { AdminSidebar } from "@/components/dashboard/dashboard-shell";
import { listTherapistManagementItems, listTherapistReviews } from "@/lib/therapist-management";

function RatingStars({ rating, size = "normal" }: { rating: number | null; size?: "normal" | "small" }) {
  if (rating === null) return <span className="text-xs text-ink-faint">—</span>;

  return (
    <span className={`text-star tracking-[1px] ${size === "small" ? "text-xs" : "text-[13px]"}`} aria-label={`${rating.toFixed(1)}点`}>
      {[0, 1, 2, 3, 4].map((index) => <span key={index}>{index < Math.round(rating) ? "★" : "☆"}</span>)}
    </span>
  );
}

function statusClass(status: string): string {
  return status === "勤務中" || status === "勤務予定"
    ? "bg-accent-soft text-accent-strong"
    : "bg-surface-2 text-ink-faint";
}

export default async function TherapistManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ therapist?: string }>;
}) {
  const session = await requireRole("admin");
  const therapists = await listTherapistManagementItems();
  const requestedId = (await searchParams).therapist;
  const selected = therapists.find((therapist) => therapist.therapistId === requestedId) ?? therapists[0];
  const reviews = selected ? await listTherapistReviews(selected.therapistId) : [];

  return (
    <div className="min-h-dvh flex bg-bg">
      <AdminSidebar adminName={session.name} active="therapists" />

      <main className="grow min-w-0 overflow-y-auto px-8 py-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl">マッサージ師管理</h1>
              <span className="rounded-full bg-role-admin-soft px-2.5 py-1 text-[11px] font-medium text-role-admin">管理者専用</span>
            </div>
            <p className="mt-1 text-xs text-ink-faint">在籍{therapists.length}名 / 稼働状況・満足度・口コミをまとめて確認できます</p>
          </div>
          <Link href="/therapists/new" className="shrink-0 rounded-[10px] bg-role-admin px-4 py-2.5 text-xs font-medium text-white">
            + 新しいマッサージ師を登録
          </Link>
        </div>

        <section className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface px-5 py-4">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[1.6fr_1.4fr_1fr_.9fr_.9fr_.9fr] items-center gap-2.5 px-1 pb-2.5">
              <span className="text-[11px] text-ink-faint">氏名</span>
              <span className="text-[11px] text-ink-faint">稼働率 <span className="text-[10px]">（直近30日）</span></span>
              <span className="text-[11px] text-ink-faint">満足度</span>
              <span className="text-[11px] text-ink-faint">口コミ件数</span>
              <span className="text-[11px] text-ink-faint">状態</span>
              <span aria-hidden="true" />
            </div>

            {therapists.length === 0 ? (
              <div className="border-t border-border py-10 text-center text-xs text-ink-faint">登録されているマッサージ師はいません。</div>
            ) : (
              therapists.map((therapist, index) => {
                const isSelected = therapist.therapistId === selected?.therapistId;
                return (
                  <div
                    key={therapist.therapistId}
                    className={`grid grid-cols-[1.6fr_1.4fr_1fr_.9fr_.9fr_.9fr] items-center gap-2.5 px-1 py-3 ${
                      index > 0 ? "border-t border-border" : ""
                    } ${isSelected ? "rounded-[10px] bg-role-admin-soft px-3" : ""}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-medium ${isSelected ? "bg-white text-role-admin" : "bg-surface-2 text-ink-soft"}`}>
                        {therapist.initial}
                      </div>
                      <span className={`text-[13px] ${isSelected ? "font-medium" : ""}`}>{therapist.name}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="h-[9px] flex-1 overflow-hidden rounded-[5px] bg-surface-2">
                        <div className="h-full rounded-[5px] bg-role-admin" style={{ width: `${therapist.utilizationRate}%` }} />
                      </div>
                      <span className="mono w-[34px] text-right text-xs">{therapist.utilizationRate}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RatingStars rating={therapist.satisfaction} />
                      <span className="mono text-[11px] text-ink-faint">{therapist.satisfaction === null ? "—" : therapist.satisfaction.toFixed(1)}</span>
                    </div>
                    <span className="text-[13px]">{therapist.reviewCount}件</span>
                    <span className={`w-fit rounded-full px-2.5 py-[3px] text-[10px] font-medium ${statusClass(therapist.workStatus)}`}>{therapist.workStatus}</span>
                    <Link
                      href={`/therapists?therapist=${encodeURIComponent(therapist.therapistId)}`}
                      className={`w-fit rounded-lg px-2.5 py-[5px] text-[11px] font-medium ${isSelected ? "bg-role-admin text-white" : "bg-surface-2 text-ink-soft"}`}
                    >
                      口コミを見る
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {selected && (
          <section className="mt-4 rounded-2xl border border-border bg-surface px-5 py-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm">{selected.name} さんへの口コミ（{selected.reviewCount}件）</h2>
              <span className="text-[11px] text-ink-faint">投稿者は所属部署のみ表示（匿名性を保持）</span>
            </div>
            {reviews.length === 0 ? (
              <p className="border-t border-border mt-2.5 pt-8 pb-5 text-center text-xs text-ink-faint">まだ口コミはありません。</p>
            ) : (
              <div className="mt-2.5">
                {reviews.map((review) => (
                  <article key={review.id} className="flex flex-col gap-1 border-t border-border px-0.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <RatingStars rating={review.rating} size="small" />
                      <span className="text-xs text-ink-soft">{review.departmentName}</span>
                      <span className="mono text-[11px] text-ink-faint">{review.dateLabel}</span>
                    </div>
                    {review.comment && <p className="text-xs text-ink">{review.comment}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
