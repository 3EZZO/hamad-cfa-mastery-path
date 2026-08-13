import { describe, expect, it } from "vitest";
import { getPlanTasks, getWeekSessions, PLAN, TOPICS } from "./plan";
import { EXAM_DATE, getWeekDates, PROGRAM_START } from "../lib/dates";
import program from "./program.json";
import { READING_CATALOG } from "./readings";

const sessions = PLAN.flatMap(getWeekSessions);

describe("canonical 28-week official 2027 plan", () => {
  it("contains exactly 28 sequential weeks", () => {
    expect(PLAN).toHaveLength(28);
    expect(PLAN.map((week) => week.week)).toEqual(
      Array.from({ length: 28 }, (_, index) => index + 1),
    );
  });

  it("uses the program window and begins tutoring on Wednesday 19 August", () => {
    expect(program.programStart).toBe(PROGRAM_START);
    expect(program.firstTutorSession).toBe("2026-08-19");
    expect(program.examAppointment).toBe(EXAM_DATE);
    expect(program.examWindow.startDate).toBe("2027-02-22");
    expect(program.examWindow.endDate).toBe("2027-02-28");
    expect(sessions[0]?.date).toBe(program.firstTutorSession);
  });

  it("covers the Sunday-Saturday program weeks without date gaps", () => {
    expect(PLAN[0]?.startDate).toBe(PROGRAM_START);
    expect(PLAN.at(-1)?.endDate).toBe(EXAM_DATE);
    for (const week of PLAN) {
      expect({ startDate: week.startDate, endDate: week.endDate }).toEqual(
        getWeekDates(week.week),
      );
      for (const session of getWeekSessions(week)) {
        expect(session.date >= week.startDate).toBe(true);
        expect(session.date <= week.endDate).toBe(true);
      }
    }
  });

  it("uses two meetings in most weeks and three in twelve intensive weeks", () => {
    const threeSessionWeeks = PLAN.filter(
      (week) => getWeekSessions(week).length === 3,
    ).map((week) => week.week);
    const twoSessionWeeks = PLAN.filter(
      (week) => getWeekSessions(week).length === 2,
    ).map((week) => week.week);

    expect(threeSessionWeeks).toEqual([
      2, 3, 4, 6, 9, 11, 13, 14, 15, 16, 26, 27,
    ]);
    expect(twoSessionWeeks).toHaveLength(16);
    expect(program.tutoringRhythm.standardWeeks).toBe(16);
    expect(program.tutoringRhythm.intensiveWeeks).toBe(12);
  });

  it("uses Monday-Wednesday-Saturday for intensive weeks and Wednesday-Saturday otherwise", () => {
    for (const week of PLAN.slice(0, -1)) {
      const days = getWeekSessions(week).map((session) => session.day);
      expect(days).toEqual(
        week.session3
          ? ["Monday", "Wednesday", "Saturday"]
          : ["Wednesday", "Saturday"],
      );
    }
    expect(getWeekSessions(PLAN.at(-1)!).map((session) => session.day)).toEqual([
      "Wednesday",
      "Friday",
    ]);
  });

  it("numbers all 68 tutoring sessions consecutively", () => {
    expect(sessions).toHaveLength(68);
    expect(sessions.map((session) => session.number)).toEqual(
      Array.from({ length: 68 }, (_, index) => index + 1),
    );
    for (const session of sessions) {
      expect(session.requirement).toBe("required");
      expect(session.durationMinutes).toBeGreaterThanOrEqual(45);
    }
  });

  it("starts with official Quant Module 1 and then follows the official module sequence", () => {
    const assignedInSessionOrder = sessions.flatMap(
      (session) => session.readings,
    );
    const officialOrder = READING_CATALOG.readings.map((reading) => reading.id);
    expect(assignedInSessionOrder).toEqual(officialOrder);
    expect(READING_CATALOG.readings[0]?.title).toBe(
      "Returns of Financial Assets and Instruments",
    );
    expect(sessions[0]?.title).toContain("Quant Module 1");
  });

  it("keeps task ids stable and unique", () => {
    const ids = PLAN.flatMap((week) => getPlanTasks(week)).map(
      (task) => task.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all ten curriculum topics", () => {
    const covered = new Set(PLAN.flatMap((week) => week.topics));
    for (const topic of TOPICS) expect(covered.has(topic)).toBe(true);
  });

  it("contains seven independent full-mock campaigns and an exam-week taper", () => {
    const mockLabels = PLAN.map((week) => week.mockMilestone?.label).filter(
      (label) => /^Mock \d$/.test(label ?? ""),
    );
    expect(mockLabels).toEqual([
      "Mock 1",
      "Mock 2",
      "Mock 3",
      "Mock 4",
      "Mock 5",
      "Mock 6",
      "Mock 7",
    ]);
    expect(
      PLAN.map((week) => week.mockMilestone)
        .filter((milestone) => /^Mock \d$/.test(milestone?.label ?? ""))
        .map((milestone) => milestone?.targetScore),
    ).toEqual([60, 63, 65, 67, 69, 70, 72]);
    expect(PLAN.at(-1)?.questionTarget).toBeLessThan(100);
    expect(getWeekSessions(PLAN.at(-1)!)[1]?.date).toBe("2027-02-26");
  });
});
