import { describe, expect, it } from "vitest";
import { getPlanTasks, getSessionTopic, getWeekSessions, MIXED_CURRICULUM_TOPIC, PLAN, TOPICS } from "./plan";
import { EXAM_DATE, getWeekDates, PROGRAM_START } from "../lib/dates";
import program from "./program.json";
import { READING_CATALOG } from "./readings";

const sessions = PLAN.flatMap(getWeekSessions);

describe("canonical 25-week official 2027 plan", () => {
  it("contains exactly 25 sequential Sunday-Saturday weeks", () => {
    expect(PLAN).toHaveLength(25);
    expect(PLAN.map((week) => week.week)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(PLAN[0]?.startDate).toBe(PROGRAM_START);
    expect(PLAN.at(-1)?.endDate).toBe(EXAM_DATE);
    for (const week of PLAN) {
      expect({ startDate: week.startDate, endDate: week.endDate }).toEqual(
        getWeekDates(week.week),
      );
    }
  });

  it("begins the split first session on 18 September and preserves exam day", () => {
    expect(program.programStart).toBe("2026-09-06");
    expect(program.firstTutorSession).toBe("2026-09-18");
    expect(program.examAppointment).toBe("2027-02-27");
    expect(sessions[0]).toMatchObject({
      date: "2026-09-19",
      deliveryDates: [program.firstTutorSession, "2026-09-19"],
    });
    expect(sessions.at(-1)?.date).toBe("2027-02-20");
    expect(PLAN.at(-1)?.session1).toBeUndefined();
  });

  it("uses 23 checkpoints in Weeks 2-24 with a split first session", () => {
    expect(sessions).toHaveLength(23);
    expect(sessions.map((session) => session.number)).toEqual(
      Array.from({ length: 23 }, (_, index) => index + 1),
    );
    expect(getWeekSessions(PLAN[0]!)).toHaveLength(0);
    for (const week of PLAN.slice(1, 24)) {
      const weekSessions = getWeekSessions(week);
      expect(weekSessions).toHaveLength(1);
      expect(weekSessions[0]).toMatchObject({
        day: "Saturday",
        label: week.week === 2
          ? "Friday-Saturday split checkpoint"
          : "Saturday 09:00 checkpoint",
        durationMinutes: week.week <= 4 ? 150 : 120,
        requirement: "required",
        date: week.endDate,
      });
    }
    expect(getWeekSessions(PLAN[24]!)).toHaveLength(0);
    expect(program.tutoringRhythm).toMatchObject({
      time: "09:00",
      timeZone: "Asia/Riyadh",
      checkpointWeeks: 23,
      independentExamWeek: 1,
      totalSessions: 23,
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
    expect(getPlanTasks(PLAN[24]!).some((task) => task.kind === "session")).toBe(
      false,
    );
    expect(getPlanTasks(PLAN[0]!)[0]?.kind).toBe("independent");
    expect(
      getPlanTasks(PLAN[1]!).findIndex((task) => task.kind === "session"),
    ).toBeGreaterThan(0);
  });

  it("covers all ten curriculum topics", () => {
    const covered = new Set(PLAN.flatMap((week) => week.topics));
    for (const topic of TOPICS) expect(covered.has(topic)).toBe(true);
  });

  it("contains seven mock campaigns with the final two combined before taper", () => {
    const mockWeeks = PLAN.filter(
      (week) => /^Mock \d$/.test(week.mockMilestone?.label ?? ""),
    );
    expect(mockWeeks.map((week) => week.mockMilestone?.label)).toEqual([
      "Mock 1",
      "Mock 2",
      "Mock 3",
      "Mock 4",
      "Mock 5",
      "Mock 7",
    ]);
    expect(mockWeeks.map((week) => week.week)).toEqual([
      19, 20, 21, 22, 23, 24,
    ]);
    expect(mockWeeks.map((week) => week.mockMilestone?.targetScore)).toEqual([
      60, 63, 65, 67, 69, 72,
    ]);
    expect(PLAN.at(-1)?.mockMilestone?.label).toBe("Exam execution gate");
    expect(PLAN[23]?.focus).toContain("Mock 6, Mock 7");
    expect(PLAN[19]?.focus).toContain("deep repair");
    expect(PLAN[19]?.independentStudy.join(" ")).toContain("delayed retests");
    expect(program.examDayChecklist).toHaveLength(3);
    expect(program.administrativeMilestones.at(-1)).toMatchObject({
      date: "2027-02-27",
      label: "Hamad's exam appointment",
    });
    expect(PLAN.at(-1)?.independentStudy.join(" ")).not.toContain(
      "next checkpoint",
    );
  });

  it("files every session week under its first curriculum topic, or the mixed label for mock weeks", () => {
    const byWeek = (week: number) => getSessionTopic(PLAN.find((item) => item.week === week)!);
    expect(byWeek(2)).toBe("Quantitative Methods");
    // Two-topic weeks take the first listed area.
    expect(byWeek(4)).toBe("Quantitative Methods");
    expect(byWeek(5)).toBe("Economics");
    expect(byWeek(17)).toBe("Portfolio Management");
    expect(byWeek(18)).toBe("Ethical and Professional Standards");
    expect(byWeek(19)).toBe(MIXED_CURRICULUM_TOPIC);
    expect(byWeek(24)).toBe(MIXED_CURRICULUM_TOPIC);
    // Every session week resolves to a curriculum area or the mixed label; never something else.
    for (const week of PLAN.filter((item) => getWeekSessions(item).length)) {
      const topic = getSessionTopic(week);
      expect([...TOPICS, MIXED_CURRICULUM_TOPIC]).toContain(topic);
      if (topic === MIXED_CURRICULUM_TOPIC) expect(week.topics).toEqual([MIXED_CURRICULUM_TOPIC]);
    }
  });
});
