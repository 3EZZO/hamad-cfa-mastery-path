import { describe, expect, it } from "vitest";
import {
  EXAM_DATE,
  PROGRAM_START,
  daysUntilExam,
  getProgramWeek,
  getWeekDates,
  parseDateOnly,
} from "./dates";

describe("Project 202 calendar", () => {
  it("uses the agreed launch and exam dates", () => {
    expect(PROGRAM_START).toBe("2026-08-16");
    expect(EXAM_DATE).toBe("2027-02-27");
  });

  it("creates exact first and final week boundaries", () => {
    expect(getWeekDates(1)).toEqual({
      startDate: "2026-08-16",
      endDate: "2026-08-22",
    });
    expect(getWeekDates(28)).toEqual({
      startDate: "2027-02-21",
      endDate: "2027-02-27",
    });
  });

  it("assigns boundary dates to the correct program week", () => {
    expect(getProgramWeek(parseDateOnly("2026-08-15"))).toBe(0);
    expect(getProgramWeek(parseDateOnly("2026-08-16"))).toBe(1);
    expect(getProgramWeek(parseDateOnly("2026-08-22"))).toBe(1);
    expect(getProgramWeek(parseDateOnly("2026-08-23"))).toBe(2);
    expect(getProgramWeek(parseDateOnly("2027-02-27"))).toBe(28);
    expect(getProgramWeek(parseDateOnly("2027-02-28"))).toBe(29);
  });

  it("counts calendar days without time-of-day drift", () => {
    expect(daysUntilExam(parseDateOnly("2027-02-20"))).toBe(7);
    expect(daysUntilExam(parseDateOnly("2027-02-27"))).toBe(0);
  });
});
