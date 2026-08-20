import { describe, expect, it } from "vitest";
import {
  EXAM_DATE,
  PROGRAM_START,
  daysUntilExam,
  getProgramWeek,
  getWeekDates,
  isValidDateOnly,
  parseDateOnly,
} from "./dates";

describe("Project 202 calendar", () => {
  it("distinguishes real date-only values from JavaScript rollover dates", () => {
    expect(isValidDateOnly("2026-08-19")).toBe(true);
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(isValidDateOnly("19-08-2026")).toBe(false);
  });

  it("uses the agreed launch and exam dates", () => {
    expect(PROGRAM_START).toBe("2026-08-23");
    expect(EXAM_DATE).toBe("2027-02-27");
  });

  it("creates exact first and final week boundaries", () => {
    expect(getWeekDates(1)).toEqual({
      startDate: "2026-08-23",
      endDate: "2026-08-29",
    });
    expect(getWeekDates(27)).toEqual({
      startDate: "2027-02-21",
      endDate: "2027-02-27",
    });
  });

  it("assigns boundary dates to the correct program week", () => {
    expect(getProgramWeek(parseDateOnly("2026-08-22"))).toBe(0);
    expect(getProgramWeek(parseDateOnly("2026-08-23"))).toBe(1);
    expect(getProgramWeek(parseDateOnly("2026-08-29"))).toBe(1);
    expect(getProgramWeek(parseDateOnly("2026-08-30"))).toBe(2);
    expect(getProgramWeek(parseDateOnly("2027-02-27"))).toBe(27);
    expect(getProgramWeek(parseDateOnly("2027-02-28"))).toBe(28);
  });

  it("counts calendar days without time-of-day drift", () => {
    expect(daysUntilExam(parseDateOnly("2027-02-20"))).toBe(7);
    expect(daysUntilExam(parseDateOnly("2027-02-27"))).toBe(0);
  });
});
