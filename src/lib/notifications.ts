import "server-only";

import { and, eq, gte } from "drizzle-orm";
import { notificationDeliveries, notificationSettings, reservations, rooms, slackConnections, therapistProfiles, users } from "@/db/schema";
import { db } from "@/lib/db";
import { postSlackDm } from "@/lib/slack";
import { createSlackNotificationContent, type SlackNotificationContent } from "@/lib/slack-notification-message";

type ReservationEvent = {
  id: string;
  userId: string;
  therapistUserId: string;
  therapistName: string;
  roomName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled";
};

type NotificationPayload = {
  userId: string;
  reservationId?: string;
  eventType: string;
  title: string;
  body: string;
  slack?: SlackNotificationContent;
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
    const { slack, ...defaultContent } = payload;
    const channelPayload = channel === "slack" && slack
      ? { ...defaultContent, ...slack }
      : defaultContent;

    if (channel === "in_app") {
      await db.insert(notificationDeliveries).values({ ...channelPayload, channel, sentAt: new Date() });
      return;
    }

    if (channel === "email" && process.env.EMAIL_WEBHOOK_URL) {
      await postWebhook(process.env.EMAIL_WEBHOOK_URL, { ...channelPayload, channel });
    }
    if (channel === "slack" && slackUserId) {
      await postSlackDm(slackUserId, `${channelPayload.title}\n${channelPayload.body}`);
    }

    // 外部サービスへの送信結果も同じ履歴に残す。Webhook未設定時は送信待ちとして記録しない。
    if ((channel === "email" && process.env.EMAIL_WEBHOOK_URL) || (channel === "slack" && slackUserId)) {
      await db.insert(notificationDeliveries).values({ ...channelPayload, channel, sentAt: new Date() });
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
  const row = (await db
    .select({
      id: reservations.id,
      userId: reservations.userId,
      therapistUserId: therapistProfiles.userId,
      therapistName: users.name,
      roomName: rooms.name,
      reservationDate: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      status: reservations.status,
    })
    .from(reservations)
    .innerJoin(therapistProfiles, eq(therapistProfiles.id, reservations.therapistId))
    .innerJoin(users, eq(users.id, therapistProfiles.userId))
    .leftJoin(rooms, eq(rooms.id, reservations.roomId))
    .where(eq(reservations.id, reservationId))
    .limit(1))[0];
  if (!row || (row.status !== "confirmed" && row.status !== "cancelled")) return null;
  return { ...row, roomName: row.roomName ?? "未定", status: row.status as "confirmed" | "cancelled" };
}

async function notifyTherapist(event: ReservationEvent, eventType: "reservation_created" | "reservation_cancelled") {
  await deliver({
    userId: event.therapistUserId,
    reservationId: event.id,
    eventType,
    title: eventType === "reservation_created" ? "新しい予約があります" : "予約がキャンセルされました",
    body: `${dateTimeLabel(event.reservationDate, event.startTime)} の予約を確認してください。`,
    slack: createSlackNotificationContent({
      recipient: "therapist",
      eventType,
      reservationDate: event.reservationDate,
      startTime: event.startTime,
      endTime: event.endTime,
      therapistName: event.therapistName,
      roomName: event.roomName,
    }),
  });
}

async function notifyUser(event: ReservationEvent, eventType: "reservation_created" | "reservation_cancelled") {
  await deliver({
    userId: event.userId,
    reservationId: event.id,
    eventType,
    title: eventType === "reservation_created" ? "予約が完了しました" : "予約をキャンセルしました",
    body: `${dateTimeLabel(event.reservationDate, event.startTime)} の予約情報を確認してください。`,
    slack: createSlackNotificationContent({
      recipient: "user",
      eventType,
      reservationDate: event.reservationDate,
      startTime: event.startTime,
      endTime: event.endTime,
      therapistName: event.therapistName,
      roomName: event.roomName,
    }),
  });
}

async function notifyReminder(
  event: ReservationEvent,
  recipient: "user" | "therapist",
  recipientUserId: string,
  minutesBefore: number
) {
  await deliver({
    userId: recipientUserId,
    reservationId: event.id,
    eventType: "reservation_reminder",
    title: "予約リマインド",
    body: `${dateTimeLabel(event.reservationDate, event.startTime)} に予約があります。`,
    slack: createSlackNotificationContent({
      recipient,
      eventType: "reservation_reminder",
      minutesBefore,
      reservationDate: event.reservationDate,
      startTime: event.startTime,
      endTime: event.endTime,
      therapistName: event.therapistName,
      roomName: event.roomName,
    }),
  });
}

/** 予約作成後に呼び出し、利用者と担当施術者へ通知を送る。 */
export async function notifyReservationCreated(reservationId: string) {
  const event = await getReservationEvent(reservationId);
  if (event?.status === "confirmed") {
    await Promise.all([notifyUser(event, "reservation_created"), notifyTherapist(event, "reservation_created")]);
  }
}

/** キャンセル処理の完了後に呼び出し、利用者と担当施術者へ通知を送る。 */
export async function notifyReservationCancelled(reservationId: string) {
  const event = await getReservationEvent(reservationId);
  if (event?.status === "cancelled") {
    await Promise.all([notifyUser(event, "reservation_cancelled"), notifyTherapist(event, "reservation_cancelled")]);
  }
}

/** 定期実行ジョブから呼び出し、期限になった予約リマインドを両受信者へ送る。 */
export async function sendDueReservationReminders(now = new Date()) {
  const upcomingReservation = and(
    eq(reservations.status, "confirmed"),
    gte(reservations.reservationDate, now.toISOString().slice(0, 10))
  );
  const enabledReminder = and(
    eq(notificationSettings.enabled, true),
    eq(notificationSettings.reminderEnabled, true)
  );
  const [userCandidates, therapistCandidates] = await Promise.all([
    db
      .select({
        reservationId: reservations.id,
        recipientUserId: reservations.userId,
        reservationDate: reservations.reservationDate,
        startTime: reservations.startTime,
        minutesBefore: notificationSettings.minutesBefore,
      })
      .from(reservations)
      .innerJoin(notificationSettings, and(
        eq(notificationSettings.userId, reservations.userId),
        eq(notificationSettings.channel, "in_app"),
        enabledReminder
      ))
      .where(upcomingReservation),
    db
      .select({
        reservationId: reservations.id,
        recipientUserId: therapistProfiles.userId,
        reservationDate: reservations.reservationDate,
        startTime: reservations.startTime,
        minutesBefore: notificationSettings.minutesBefore,
      })
      .from(reservations)
      .innerJoin(therapistProfiles, eq(therapistProfiles.id, reservations.therapistId))
      .innerJoin(notificationSettings, and(
        eq(notificationSettings.userId, therapistProfiles.userId),
        eq(notificationSettings.channel, "slack"),
        enabledReminder
      ))
      .where(upcomingReservation),
  ]);
  const candidates = [
    ...userCandidates.map((candidate) => ({ ...candidate, recipient: "user" as const })),
    ...therapistCandidates.map((candidate) => ({ ...candidate, recipient: "therapist" as const })),
  ];

  let sent = 0;
  for (const candidate of candidates) {
    const appointment = new Date(`${candidate.reservationDate}T${candidate.startTime}+09:00`);
    const reminderAt = new Date(appointment.getTime() - candidate.minutesBefore * 60_000);
    if (reminderAt <= now && appointment > now) {
      const alreadySent = await db.query.notificationDeliveries.findFirst({
        columns: { id: true },
        where: and(
          eq(notificationDeliveries.reservationId, candidate.reservationId),
          eq(notificationDeliveries.userId, candidate.recipientUserId),
          eq(notificationDeliveries.eventType, "reservation_reminder"),
        ),
      });
      if (alreadySent) continue;
      const event = await getReservationEvent(candidate.reservationId);
      if (!event || event.status !== "confirmed") continue;
      await notifyReminder(
        event,
        candidate.recipient,
        candidate.recipientUserId,
        candidate.minutesBefore
      );
      sent += 1;
    }
  }
  return sent;
}
