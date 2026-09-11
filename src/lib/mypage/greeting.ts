export type Greeting = {
  emoji: string;
  title: string;
  body: string;
};

/**
 * Two phrasing variants per time/day bucket (10 total) so the wording differs
 * across logins even within the same context, per feedback.
 */
const EVENING: Greeting[] = [
  {
    emoji: "🌙",
    title: "今日も一日お疲れさまでした",
    body: "長時間のデスクワーク、お疲れさまです。帰る前に少しリフレッシュしていきませんか？",
  },
  {
    emoji: "🌙",
    title: "今日もお疲れさまです",
    body: "一日の疲れ、帰る前に少しほぐしていきませんか？",
  },
];

const FRIDAY_AFTERNOON: Greeting[] = [
  {
    emoji: "🎉",
    title: "今週もお疲れさまでした",
    body: "週末を迎える前に、少し体をほぐしていきませんか？",
  },
  {
    emoji: "🎉",
    title: "今週も一週間お疲れさまでした",
    body: "週末前のひとときに、リフレッシュしていきませんか？",
  },
];

const MONDAY_MORNING: Greeting[] = [
  {
    emoji: "🌱",
    title: "今週も一週間よろしくお願いします",
    body: "週の始まりの肩こりに、朝のうちにリフレッシュしませんか？",
  },
  {
    emoji: "🌱",
    title: "今週も一週間頑張りましょう",
    body: "週明けの体の重さ、朝のうちにほぐしておきませんか？",
  },
];

const LUNCHTIME: Greeting[] = [
  {
    emoji: "🍃",
    title: "お昼休みにひと息",
    body: "午後の仕事に向けて、少し体をほぐしませんか？",
  },
  {
    emoji: "🍃",
    title: "お昼のひとときに",
    body: "午後も頑張れるように、少しリフレッシュしませんか？",
  },
];

const DEFAULT: Greeting[] = [
  {
    emoji: "🌿",
    title: "ちょっと休憩しませんか？",
    body: "本日、マッサージに空きがあります。お仕事の合間にリフレッシュしませんか？",
  },
  {
    emoji: "🌿",
    title: "気分転換はいかがですか？",
    body: "お仕事の合間に、少し体を休めてみませんか？",
  },
];

/**
 * Picks the candidate pool of contextual copy for the current day-of-week and
 * time-of-day. Rules are checked in order; the first match wins. Exported
 * separately from getGreeting so the bucket selection stays deterministic and
 * testable even though the final pick within a bucket is random.
 */
export function getGreetingPool(now: Date): Greeting[] {
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun .. 6=Sat

  if (hour >= 18) return EVENING;
  if (day === 5 && hour >= 14) return FRIDAY_AFTERNOON;
  if (day === 1 && hour < 12) return MONDAY_MORNING;
  if (hour >= 11 && hour < 14) return LUNCHTIME;
  return DEFAULT;
}

/** Picks a random variant from the current context's pool, so wording varies across logins. */
export function getGreeting(now: Date): Greeting {
  const pool = getGreetingPool(now);
  return pool[Math.floor(Math.random() * pool.length)];
}
