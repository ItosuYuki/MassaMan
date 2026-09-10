import { Suspense } from "react";
import { requireRole } from "@/lib/dal";
import { BookingClient } from "./BookingClient";
import { HeaderMenu } from "@/components/booking/HeaderMenu";

export default async function BookingPage() {
  await requireRole("user");

  return (
    <main className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-4 sm:px-8">
        <h1 className="text-lg">予約</h1>
        <HeaderMenu />
      </header>
      <Suspense>
        <BookingClient />
      </Suspense>
    </main>
  );
}
