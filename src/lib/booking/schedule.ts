export const BUSINESS_DAYS = [1, 2, 3, 4, 5] as const; // Mon-Fri (Date.getDay())
export const BUSINESS_HOURS = { start: 9, end: 20 } as const;

export function getHourSlots(): number[] {
  const slots: number[] = [];
  for (let h = BUSINESS_HOURS.start; h <= BUSINESS_HOURS.end; h++) slots.push(h);
  return slots;
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Mon-Fri dates of the business week containing `anchor`. */
export function getWeekDates(anchor: Date): Date[] {
  const day = anchor.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diffToMonday);

  return BUSINESS_DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
