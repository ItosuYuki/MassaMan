import { Suspense } from "react";
import { requireRole } from "@/lib/dal";
import { AppSidebar } from "@/components/app-sidebar";
import { BookingClient } from "./BookingClient";

export default async function BookingPage() {
  const session = await requireRole("user");

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <AppSidebar role="user" name={session.name} activePath="/booking" />
      <main className="grow overflow-y-auto pb-20 sm:pb-0">
        <Suspense>
          <BookingClient />
        </Suspense>
      </main>
    </div>
  );
}
