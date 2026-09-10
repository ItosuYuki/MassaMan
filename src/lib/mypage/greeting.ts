export type Greeting = {
  emoji: string;
  title: string;
  body: string;
};

/**
 * Picks contextual copy for the mypage recommendation card based on the current
 * day-of-week and time-of-day. Rules are checked in order; the first match wins.
 */
export function getGreeting(now: Date): Greeting {
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun .. 6=Sat

  if (hour >= 18) {
    return {
      emoji: "🌙",
      title: "今日も一日お疲れさまでした",
      body: "長時間のデスクワーク、お疲れさまです。帰る前に少しリフレッシュしていきませんか？",
    };
  }

  if (day === 5 && hour >= 14) {
    return {
      emoji: "🎉",
      title: "今週もお疲れさまでした",
      body: "週末を迎える前に、少し体をほぐしていきませんか？",
    };
  }

  if (day === 1 && hour < 12) {
    return {
      emoji: "🌱",
      title: "今週も一週間よろしくお願いします",
      body: "週の始まりの肩こりに、朝のうちにリフレッシュしませんか？",
    };
  }

  if (hour >= 11 && hour < 14) {
    return {
      emoji: "🍃",
      title: "お昼休みにひと息",
      body: "午後の仕事に向けて、少し体をほぐしませんか？",
    };
  }

  return {
    emoji: "🌿",
    title: "ちょっと休憩しませんか？",
    body: "本日、マッサージに空きがあります。お仕事の合間にリフレッシュしませんか？",
  };
}
