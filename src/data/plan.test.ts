import { describe, expect, it } from "vitest";
import { getPlanTasks, getWeekSessions, PLAN, TOPICS } from "./plan";
import { EXAM_DATE, getWeekDates, PROGRAM_START } from "../lib/dates";
import program from "./program.json";
import { READING_CATALOG } from "./readings";

const sessions = PLAN.flatMap(getWeekSessions);

describe("canonical 26-week official 2027 plan", () => {
  it("contains exactly 26 sequential Sunday-Saturday weeks", () => {
    expect(PLAN).toHaveLength(26);
    expect(PLAN.map((week) => week.week)).toEqual(
      Array.from({ length: 26 }, (_, index) => index + 1),
    );
    expect(PLAN[0]?.startDate).toBe(PROGRAM_START);
    expect(PLAN.at(-1)?.endDate).toBe(EXAM_DATE);
    for (const week of PLAN) {
      expect({ startDate: week.startDate, endDate: week.endDate }).toEqual(
        getWeekDates(week.week),
      );
    }
  });

  it("begins tutoring Saturday 5 September and preserves exam day", () => {
    expect(program.programStart).toBe("2026-08-30");
    expect(program.firstTutorSession).toBe("2026-09-05");
    expect(program.examAppointment).toBe("2027-02-27");
    expect(sessions[0]?.date).toBe(program.firstTutorSession);
    expect(sessions.at(-1)?.date).toBe("2027-02-20");
    expect(PLAN.at(-1)?.session1).toBeUndefined();
  });

  it("uses one Saturday checkpoint in Weeks 1-25 with the 150-minute opening masterclass", () => {
    expect(sessions).toHaveLength(25);
    expect(sessions.map((session) => session.number)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    for (const week of PLAN.slice(0, 25)) {
      const weekSessions = getWeekSessions(week);
      expect(weekSessions).toHaveLength(1);
      expect(weekSessions[0]).toMatchObject({
        day: "Saturday",
        label: "Saturday 09:00 checkpoint",
        durationMinutes: week.week === 1 ? 150 : 120,
        requirement: "required",
        date: week.endDate,
      });
    }
    expect(getWeekSessions(PLAN[25]!)).toHaveLength(0);
    expect(program.tutoringRhythm).toMatchObject({
      time: "09:00",
      timeZone: "Asia/Riyadh",
      checkpointWeeks: 25,
      independentExamWeek: 1,
      totalSessions: 25,
    });
  });

  it("retains the 6,630-question evidence target", () => {
    expect(PLAN.reduce((total, week) => total + week.questionTarget, 0)).toBe(
      6_630,
    );
    expect(PLAN.at(-1)?.questionTarget).toBeLessThan(100);
  });

  it("assigns all modules independently in official order", () => {
    const assignedInCheckpointOrder = sessions.flatMap(
      (session) => session.readings,
    );
    const officialOrder = READING_CATALOG.readings.map((reading) => reading.id);
    expect(assignedInCheckpointOrder).toEqual(officialOrder);
    expect(READING_CATALOG.readings[0]?.title).toBe(
      "Returns of Financial Assets and Instruments",
    );
    expect(sessions[0]?.title).toContain("Quant Masterclass I");

    const moduleTasks = PLAN.flatMap((week) => week.independentStudy).filter(
      (task) => task.startsWith("Study official 2027 Module "),
    );
    expect(moduleTasks).toHaveLength(102);
    expect(moduleTasks[0]).toContain("Module 001");
    expect(moduleTasks.at(-1)).toContain("Module 102");
  });

  it("keeps task ids stable and unique, including exam week without a session", () => {
    const ids = PLAN.flatMap((week) => getPlanTasks(week)).map(
      (task) => task.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(getPlanTasks(PLAN[25]!).some((task) => task.kind === "session")).toBe(
      false,
    );
    expect(getPlanTasks(PLAN[0]!)[0]?.kind).toBe("independent");
    expect(
      getPlanTasks(PLAN[0]!).findIndex((task) => task.kind === "session"),
    ).toBeGreaterThan(0);
  });

  it("covers all ten curriculum topics", () => {
    const covered = new Set(PLAN.flatMap((week) => week.topics));
    for (const topic of TOPICS) expect(covered.has(topic)).toBe(true);
  });

  it("contains seven independent full-mock campaigns and an exam-week taper", () => {
    const mockWeeks = PLAN.filter(
      (week) => /^Mock \d$/.test(week.mockMilestone?.label ?? ""),
    );
    expect(mockWeeks.map((week) => week.mockMilestone?.label)).toEqual([
      "Mock 1",
      "Mock 2",
      "Mock 3",
      "Mock 4",
      "Mock 5",
      "Mock 6",
      "Mock 7",
    ]);
    expect(mockWeeks.map((week) => week.week)).toEqual([
      18, 19, 21, 22, 23, 24, 25,
    ]);
    expect(mockWeeks.map((week) => week.mockMilestone?.targetScore)).toEqual([
      60, 63, 65, 67, 69, 70, 72,
    ]);
    expect(PLAN.at(-1)?.mockMilestone?.label).toBe("Exam execution gate");
    expect(program.examDayChecklist).toHaveLength(3);
    expect(program.administrativeMilestones.at(-1)).toMatchObject({
      date: "2027-02-27",
      label: "Hamad's exam appointment",
    });
    expect(PLAN.at(-1)?.independentStudy.join(" ")).not.toContain(
      "next checkpoint",
    );
  });
});
