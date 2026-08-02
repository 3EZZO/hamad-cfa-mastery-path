import { describe, expect, it } from "vitest";
import { getPlanTasks, PLAN, TOPICS } from "./plan";
import { EXAM_DATE, getWeekDates, PROGRAM_START } from "../lib/dates";
import program from "./program.json";
import { READING_CATALOG } from "./readings";

describe("canonical 29-week plan", () => {
  it("contains exactly 29 sequential weeks", () => {
    expect(PLAN).toHaveLength(29);
    expect(PLAN.map((week) => week.week)).toEqual(
      Array.from({ length: 29 }, (_, index) => index + 1),
    );
  });

  it("uses the same dates as the program metadata", () => {
    expect(program.programStart).toBe(PROGRAM_START);
    expect(program.examAppointment).toBe(EXAM_DATE);
    expect(program.examWindow.startDate).toBe("2027-02-22");
    expect(program.examWindow.endDate).toBe("2027-02-28");
  });

  it("covers launch through exam day without date gaps", () => {
    expect(PLAN[0]?.startDate).toBe(PROGRAM_START);
    expect(PLAN.at(-1)?.endDate).toBe(EXAM_DATE);

    for (const week of PLAN) {
      expect({ startDate: week.startDate, endDate: week.endDate }).toEqual(
        getWeekDates(week.week),
      );
    }
  });

  it("provides two required tutor sessions plus a planned third session weekly", () => {
    for (const week of PLAN) {
      expect(week.session1.requirement).toBe("required");
      expect(week.session2.requirement).toBe("required");
      expect(["required", "flex"]).toContain(week.session3.requirement);
      expect(week.session1.durationMinutes).toBeGreaterThanOrEqual(45);
      expect(week.session2.durationMinutes).toBeGreaterThanOrEqual(45);
      expect(week.outcomes.length).toBeGreaterThanOrEqual(3);
      expect(week.independentStudy.length).toBeGreaterThanOrEqual(3);
      expect(week.questionTarget).toBeGreaterThan(0);
      expect(week.masteryGate.length).toBeGreaterThan(20);
    }
  });

  it("numbers every planned session consecutively across all 29 weeks", () => {
    const sessions = PLAN.flatMap((week) => [
      week.session1,
      week.session2,
      week.session3,
    ]);
    expect(sessions).toHaveLength(87);
    expect(sessions.map((session) => session.number)).toEqual(
      Array.from({ length: 87 }, (_, index) => index + 1),
    );
  });

  it("keeps reading references inside the centralized audited catalog", () => {
    const readingIds = new Set(
      READING_CATALOG.readings.map((reading) => reading.id),
    );
    for (const session of PLAN.flatMap((week) => [
      week.session1,
      week.session2,
      week.session3,
    ])) {
      expect(Array.isArray(session.readings)).toBe(true);
      for (const id of session.readings) expect(readingIds.has(id)).toBe(true);
    }
  });

  it("keeps task ids stable and unique", () => {
    const ids = PLAN.flatMap(getPlanTasks).map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all ten curriculum topics", () => {
    const covered = new Set(PLAN.flatMap((week) => week.topics));
    for (const topic of TOPICS) expect(covered.has(topic)).toBe(true);
  });

  it("contains an escalating seven-mock campaign and an exam-week taper", () => {
    const scoredMocks = PLAN.flatMap((week) =>
      week.mockMilestone?.label.startsWith("Full-length Mock")
        ? [week.mockMilestone.targetScore]
        : [],
    );
    expect(scoredMocks).toEqual([60, 63, 65, 67, 69, 70, 72]);
    expect(PLAN.at(-1)?.mockMilestone?.targetScore).toBeNull();
    expect(PLAN.at(-1)?.questionTarget).toBeLessThan(100);
  });

  it("makes diagnostic, gate, and mock third sessions required", () => {
    for (const week of PLAN) {
      const mustBeRequired = week.week === 1 || (week.week >= 20 && week.week <= 28);
      expect(week.session3.requirement).toBe(mustBeRequired ? "required" : "flex");
    }
  });
});
