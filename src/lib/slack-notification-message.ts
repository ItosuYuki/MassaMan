export type SlackNotificationContent = {
  title: string;
  body: string;
};

type ReservationDetails = {
  reservationDate: string;
  startTime: string;
  endTime: string;
  therapistName: string;
  roomName: string;
};

type SlackNotificationInput = ReservationDetails & {
  recipient: "user" | "therapist";
} & (
    | { eventType: "reservation_created" }
    | { eventType: "reservation_cancelled" }
    | { eventType: "reservation_reminder"; minutesBefore: number }
  );

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

function appointmentLabel(reservationDate: string, startTime: string, endTime: string) {
  const [year, month, day] = reservationDate.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}月${day}日（${weekday}）${startTime.slice(0, 5)}〜${endTime.slice(0, 5)}`;
}

export function createSlackNotificationContent(input: SlackNotificationInput): SlackNotificationContent {
  const dateTime = appointmentLabel(input.reservationDate, input.startTime, input.endTime);

  if (input.recipient === "user") {
    if (input.eventType === "reservation_created") {
      return {
        title: "✅ マッサージ予約が完了しました",
        body: `\n日時：${dateTime}\n担当施術者：${input.therapistName}\n場所：${input.roomName}`,
      };
    }
    if (input.eventType === "reservation_cancelled") {
      return {
        title: "❎予約をキャンセルしました",
        body: `\n以下の予約はキャンセル済みです。\n\n日時：${dateTime}\n担当施術者：${input.therapistName}`,
      };
    }
    return {
      title: "🔔 マッサージ予約のお知らせ",
      body: `\n日時：${dateTime}\n担当施術者：${input.therapistName}\n場所：${input.roomName}\n\nマッサージの予約時刻の${input.minutesBefore}分前になりました。`,
    };
  }

  if (input.eventType === "reservation_created") {
    return {
      title: "✅ 予約がされました",
      body: `日時：${dateTime}\n場所：${input.roomName}`,
    };
  }
  if (input.eventType === "reservation_cancelled") {
    return {
      title: "❎予約がキャンセルされました",
      body: `以下の予約はキャンセル済みです。\n日時：${dateTime}`,
    };
  }
  return {
    title: "🔔 マッサージ予約のお知らせ",
    body: `日時：${dateTime}\n場所：${input.roomName}\nマッサージの予約時刻の${input.minutesBefore}分前になりました。`,
  };
}
