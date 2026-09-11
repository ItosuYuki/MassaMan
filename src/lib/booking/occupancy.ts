/** Fraction (0-1) of this week's bookable hours a therapist already has reservations in. */
export function computeOccupancyRate(params: {
  reservationCountInWeek: number;
  businessDaysPerWeek: number;
  hoursPerDay: number;
}): number {
  const totalSlots = params.businessDaysPerWeek * params.hoursPerDay;
  if (totalSlots === 0) return 0;
  return params.reservationCountInWeek / totalSlots;
}
