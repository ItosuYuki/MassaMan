"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/dal";
import { disconnectSlack } from "@/lib/slack";
import { getNotificationUserId } from "@/lib/notification-settings";

export async function disconnectSlackAction() {
  const session = await verifySession();
  if (session.role !== "user" && session.role !== "therapist") return;
  await disconnectSlack(await getNotificationUserId(session.employeeId));
  revalidatePath(session.role === "user" ? "/booking" : "/schedule");
}
