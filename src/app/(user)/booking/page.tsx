import { requireRole } from "@/lib/dal";
import { BookingClient } from "./BookingClient";

export default async function BookingPage() {
  await requireRole("user");

  return (
    <main className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface px-5 py-4 sm:px-8">
        <h1 className="text-lg">予約</h1>
      </header>
      <BookingClient />
    </main>
  );
}
