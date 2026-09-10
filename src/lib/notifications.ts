import "server-only";

import { and, eq, gte } from "drizzle-orm";
import { notificationDeliveries, notificationSettings, reservations, slackConnections, therapistProfiles, users } from "@/db/schema";
import { db } from "@/lib/db";
import { postSlackDm } from "@/lib/slack";

type ReservationEvent = {
  id: string;
  userId: string;
  therapistId: string;
  reservationDate: string;
  startTime: string;
  status: "confirmed" | "cancelled";
};

type NotificationPayload = {
  userId: string;
  reservationId?: string;
  eventType: string;
  title: string;
  body: string;
};

const dateTimeLabel = (date: string, time: string) => `${date.replaceAll("-", "/")} ${time.slice(0, 5)}`;

async function deliver(payload: NotificationPayload) {
  const settings = await db
    .select({
      channel: notificationSettings.channel,
      enabled: notificationSettings.enabled,
      reservationCreatedEnabled: notificationSettings.reservationCreatedEnabled,
      reservationCancelledEnabled: notificationSettings.reservationCancelledEnabled,
      reminderEnabled: notificationSettings.reminderEnabled,
      slackUserId: slackConnections.slackUserId,
    })
    .from(notificationSettings)
    .leftJoin(slackConnections, eq(slackConnections.userId, notificationSettings.userId))
    .where(and(eq(notificationSettings.userId, payload.userId), eq(notificationSettings.enabled, true)));

  const isEnabledForEvent = (setting: typeof settings[number]) =>
    payload.eventType === "reservation_created" ? setting.reservationCreatedEnabled
      : payload.eventType === "reservation_cancelled" ? setting.reservationCancelledEnabled
        : setting.reminderEnabled;

  await Promise.all(settings.filter(isEnabledForEvent).map(async ({ channel, slackUserId }) => {
    if (channel === "in_app") {
      await db.insert(notificationDeliveries).values({ ...payload, channel, sentAt: new Date() });
      return;
    }

    if (channel === "email" && process.env.EMAIL_WEBHOOK_URL) {
      await postWebhook(process.env.EMAIL_WEBHOOK_URL, { ...payload, channel });
    }
    if (channel === "slack" && slackUserId) {
      await postSlackDm(slackUserId, `${payload.title}\n${payload.body}`);
    }

    // 外部サービスへの送信結果も同じ履歴に残す。Webhook未設定時は送信待ちとして記録しない。
    if ((channel === "email" && process.env.EMAIL_WEBHOOK_URL) || (channel === "slack" && slackUserId)) {
      await db.insert(notificationDeliveries).values({ ...payload, channel, sentAt: new Date() });
    }
  }));
}

async function postWebhook(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`通知Webhookへの送信に失敗しました (${response.status})`);
}

async function getReservationEvent(reservationId: string): Promise<ReservationEvent | null> {
  const row = await db.query.reservations.findFirst({
    columns: { id: true, userId: true, therapistId: true, reservationDate: true, startTime: true, status: true },
    where: eq(reservations.id, reservationId),
  });
  if (!row || (row.status !== "confirmed" && row.status !== "cancelled")) return null;
  return { ...row, status: row.status as "confirmed" | "cancelled" };
}

async function notifyTherapist(event: ReservationEvent, eventType: "reservation_created" | "reservation_cancelled") {
  const therapist = await db
    .select({ userId: users.id })
    .from(therapistProfiles)
    .innerJoin(users, eq(users.id, therapistProfiles.userId))
    .where(eq(therapistProfiles.id, event.therapistId))
    .limit(1);
  const recipient = therapist[0];
  if (!recipient) return;

  await deliver({
    userId: recipient.userId,
    reservationId: event.id,
    eventType,
    title: eventType === "reservation_created" ? "新しい予約があります" : "予約がキャンセルされました",
    body: `${dateTimeLabel(event.reservationDate, event.startTime)} の予約を確認してください。`,
  });
}

async function notifyUser(event: ReservationEvent, eventType: "reservation_created" | "reservation_cancelled") {
  await deliver({
    userId: event.userId,
    reservationId: event.id,
    eventType,
    title: eventType === "reservation_created" ? "予約が完了しました" : "予約をキャンセルしました",
    body: `${dateTimeLabel(event.reservationDate, event.startTime)} の予約情報を確認してください。`,
  });
}

/** 予約作成後に呼び出す。マッサージ師へSlack通知を送る。 */
export async function notifyReservationCreated(reservationId: string) {
  const event = await getReservationEvent(reservationId);
  if (event?.status === "confirmed") {
    await Promise.all([notifyUser(event, "reservation_created"), notifyTherapist(event, "reservation_created")]);
  }
}

/** キャンセル処理の完了後に呼び出す。マッサージ師へSlack通知を送る。 */
export async function notifyReservationCancelled(reservationId: string) {
  const event = await getReservationEvent(reservationId);
  if (event?.status === "cancelled") {
    await Promise.all([notifyUser(event, "reservation_cancelled"), notifyTherapist(event, "reservation_cancelled")]);
  }
}

/** 定期実行ジョブから呼び出し、期限になった利用者の予約リマインドを送る。 */
export async function sendDueReservationReminders(now = new Date()) {
  const candidates = await db
    .select({
      reservation: reservations,
      minutesBefore: notificationSettings.minutesBefore,
    })
    .from(reservations)
    .innerJoin(notificationSettings, and(eq(notificationSettings.userId, reservations.userId), eq(notificationSettings.channel, "in_app"), eq(notificationSettings.enabled, true)))
    .where(and(eq(reservations.status, "confirmed"), gte(reservations.reservationDate, now.toISOString().slice(0, 10))));

  let sent = 0;
  for (const candidate of candidates) {
    const appointment = new Date(`${candidate.reservation.reservationDate}T${candidate.reservation.startTime}+09:00`);
    const reminderAt = new Date(appointment.getTime() - candidate.minutesBefore * 60_000);
    if (reminderAt <= now && appointment > now) {
      const alreadySent = await db.query.notificationDeliveries.findFirst({
        columns: { id: true },
        where: and(
          eq(notificationDeliveries.reservationId, candidate.reservation.id),
          eq(notificationDeliveries.eventType, "reservation_reminder"),
        ),
      });
      if (alreadySent) continue;
      await deliver({
        userId: candidate.reservation.userId,
        reservationId: candidate.reservation.id,
        eventType: "reservation_reminder",
        title: "予約リマインド",
        body: `${dateTimeLabel(candidate.reservation.reservationDate, candidate.reservation.startTime)} に予約があります。`,
      });
      sent += 1;
    }
  }
  return sent;
}
