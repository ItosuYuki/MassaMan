import { describe, expect, it } from "vitest";
import { autoAssignTherapist, type TherapistCandidate } from "./auto-assign";

const base: TherapistCandidate[] = [
  { id: "t1", gender: "male", isAvailable: true, occupancyRate: 0.5 },
  { id: "t2", gender: "female", isAvailable: true, occupancyRate: 0.2 },
  { id: "t3", gender: "male", isAvailable: false, occupancyRate: 0.1 },
];

describe("autoAssignTherapist", () => {
  it("picks the available candidate with the lowest occupancy rate", () => {
    expect(autoAssignTherapist(base, [])).toBe("t2");
  });

  it("respects the gender filter", () => {
    expect(autoAssignTherapist(base, ["male"])).toBe("t1"); // t3 excluded (unavailable)
  });

  it("excludes unavailable candidates even with no gender filter", () => {
    const onlyUnavailable: TherapistCandidate[] = [
      { id: "t4", gender: "male", isAvailable: false, occupancyRate: 0 },
    ];
    expect(autoAssignTherapist(onlyUnavailable, [])).toBeNull();
  });

  it("breaks ties by ascending id", () => {
    const tied: TherapistCandidate[] = [
      { id: "b", gender: "male", isAvailable: true, occupancyRate: 0.3 },
      { id: "a", gender: "male", isAvailable: true, occupancyRate: 0.3 },
    ];
    expect(autoAssignTherapist(tied, [])).toBe("a");
  });

  it("returns null when no candidates remain after filtering", () => {
    expect(autoAssignTherapist(base, ["female"])).toBe("t2");
    expect(autoAssignTherapist([], [])).toBeNull();
  });
});
