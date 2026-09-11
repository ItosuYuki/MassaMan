import { describe, expect, it } from "vitest";
import { formatDateWithWeekday, formatDateWithYearAndWeekday } from "@/lib/booking/schedule";

describe("booking date labels", () => {
  it("includes the year in history date labels", () => {
    expect(formatDateWithYearAndWeekday("2026-09-10")).toBe("2026/09/10（木）");
  });

  it("keeps the compact date label available for booking screens", () => {
    expect(formatDateWithWeekday("2026-09-10")).toBe("09/10（木）");
  });
});
