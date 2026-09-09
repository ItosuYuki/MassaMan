import { requireRole } from "@/lib/dal";
import { BookingClient } from "./BookingClient";

export default async function BookingPage() {
  await requireRole("user");

  return (
    <main className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface px-5 py-4 sm:px-8">
        <h1 className="text-lg">予約する</h1>
        <p className="mt-0.5 text-xs text-ink-faint">マッサージ室は施術者に応じて自動的に決まります</p>
      </header>
      <BookingClient />
    </main>
  );
}
