/**
 * Japanese public holidays for 2025-2026 (the mock data's date range), used to
 * gray out non-working days in the dashboard charts. Hardcoded rather than
 * computed: several holidays (the equinoxes, 振替休日/国民の休日 substitutions)
 * don't reduce to a simple rule, and this only needs to be reasonably accurate
 * for a sample-data prototype, not authoritative.
 */
const HOLIDAYS = new Set<string>([
  // 2025
  "2025-01-01", // 元日
  "2025-01-13", // 成人の日
  "2025-02-11", // 建国記念の日
  "2025-02-24", // 天皇誕生日 振替休日
  "2025-03-20", // 春分の日
  "2025-04-29", // 昭和の日
  "2025-05-03", // 憲法記念日
  "2025-05-05", // こどもの日
  "2025-05-06", // みどりの日 振替休日
  "2025-07-21", // 海の日
  "2025-08-11", // 山の日
  "2025-09-15", // 敬老の日
  "2025-09-23", // 秋分の日
  "2025-10-13", // スポーツの日
  "2025-11-03", // 文化の日
  "2025-11-24", // 勤労感謝の日 振替休日
  // 2026
  "2026-01-01", // 元日
  "2026-01-12", // 成人の日
  "2026-02-11", // 建国記念の日
  "2026-02-23", // 天皇誕生日
  "2026-03-20", // 春分の日
  "2026-04-29", // 昭和の日
  "2026-05-04", // みどりの日
  "2026-05-05", // こどもの日
  "2026-05-06", // 憲法記念日 振替休日
  "2026-07-20", // 海の日
  "2026-08-11", // 山の日
  "2026-09-21", // 敬老の日
  "2026-09-22", // 国民の休日
  "2026-09-23", // 秋分の日
  "2026-10-12", // スポーツの日
  "2026-11-03", // 文化の日
  "2026-11-23", // 勤労感謝の日
]);

export function isHoliday(dateISO: string): boolean {
  return HOLIDAYS.has(dateISO);
}

export function isNonWorkingDay(dateISO: string): boolean {
  const [y, m, d] = dateISO.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6 || isHoliday(dateISO);
}
