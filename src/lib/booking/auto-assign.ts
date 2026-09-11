export interface TherapistCandidate {
  id: string;
  gender: "male" | "female";
  isAvailable: boolean;
  occupancyRate: number;
}

/**
 * Picks the least-occupied available therapist matching the gender filter
 * (empty filter = no restriction), for load-balanced auto-assignment.
 * Ties break by ascending id so the result is deterministic.
 */
export function autoAssignTherapist(
  candidates: TherapistCandidate[],
  genderFilter: ("male" | "female")[]
): string | null {
  const eligible = candidates.filter(
    (c) => c.isAvailable && (genderFilter.length === 0 || genderFilter.includes(c.gender))
  );
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    if (a.occupancyRate !== b.occupancyRate) return a.occupancyRate - b.occupancyRate;
    return a.id < b.id ? -1 : 1;
  });

  return eligible[0].id;
}
