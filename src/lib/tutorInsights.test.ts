import { describe, expect, it } from "vitest";
import type { MockAttempt } from "./mockTestContent";
import { buildSessionPrep, sessionPrepText } from "./sessionPrep";
import { moduleStandings, paceReport, suggestActions, type PracticeAnswerFact } from "./tutorInsights";

const DAY = 24 * 60 * 60 * 1000;
// Thursday of plan week 5 (starts Sunday 4 October 2026).
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime();

function attempt(moduleId: string, score: number | null, submittedAtMs = NOW - DAY): MockAttempt {
  return { id: `s_${moduleId}`, moduleId, status: "submitted", score, submittedAtMs, incidents: [] } as unknown as MockAttempt;
}

function answers(moduleId: string, correct: number, wrong: number, atMs = NOW - DAY): PracticeAnswerFact[] {
  return [
    ...Array.from({ length: correct }, () => ({ moduleId, correct: true, answeredAtMs: atMs })),
    ...Array.from({ length: wrong }, () => ({ moduleId, correct: false, answeredAtMs: atMs })),
  ];
}

describe("moduleStandings", () => {
  it("blends the test score with practice accuracy and lists the weakest first", () => {
    const standings = moduleStandings(
      [attempt("e03-fiscal-policy", 4), attempt("e04-monetary-policy", 8), attempt("e05-introduction-to-geopolitics", null)],
      [...answers("m014-fiscal", 9, 1), ...answers("m015-monetary", 2, 8), ...answers("m016-geo", 1, 1)],
    );
    expect(standings.map((standing) => standing.catalogId.slice(-4))).toEqual(["m014", "m015"]);
    // Fiscal: 0.6 × 4/8 + 0.4 × 0.9 = 0.66; monetary: 0.6 × 1 + 0.4 × 0.2 = 0.68.
    expect(standings[0]).toMatchObject({ test: { code: "EC3", score: 4 }, practiceAnswered: 10, weak: true });
    expect(standings[0]!.strength).toBeCloseTo(0.66);
    expect(standings[1]!.strength).toBeCloseTo(0.68);
    expect(standings[0]!.label).toMatch(/^Module 14 · /);
  });

  it("uses practice alone once enough questions are answered", () => {
    const standings = moduleStandings([], [...answers("m019-fx", 2, 4), ...answers("m020-x", 1, 0)]);
    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({ test: null, practiceAccuracy: 2 / 6, weak: true });
  });
});

describe("paceReport and suggestions", () => {
  const published = new Set(["m01-rates-and-returns", "e03-fiscal-policy", "e06-international-trade", "e08-exchange-rate-calculations"]);

  it("counts plan tests due by this week, practice this week and the exam countdown", () => {
    const pace = paceReport({
      week: 5, nowMs: NOW, examDate: "2027-02-27", publishedTestIds: published,
      attempts: [attempt("m01-rates-and-returns", 7)],
      answers: [...answers("m017-x", 20, 0, NOW - 2 * DAY), ...answers("m010-x", 5, 0, NOW - 6 * DAY)],
    });
    expect(pace).toMatchObject({
      week: 5,
      testsDone: 1,
      practiceThisWeek: 20,
      practiceTarget: 220,
      daysSinceLastPractice: 2,
    });
    expect(pace.testsBehind).toEqual(["e03-fiscal-policy", "e06-international-trade", "e08-exchange-rate-calculations"]);
    expect(pace.weekElapsed).toBeCloseTo(4.5 / 7);
    expect(pace.daysToExam).toBe(142);

    const suggestions = suggestActions(pace, moduleStandings([attempt("e03-fiscal-policy", 3)], []));
    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(["tests-behind", "practice-behind", "weak-cfa-2027-outline-m014"]);
    expect(suggestions[0]!.text).toBe("3 tests from the plan not taken yet (EC3, EC6, EC8)");
    expect(suggestions[2]!.action).toEqual({ type: "open-test", moduleId: "e03-fiscal-policy" });
  });

  it("flags idle practice when the week's pace is fine", () => {
    const pace = paceReport({
      week: 5, nowMs: new Date(2026, 9, 4, 20).getTime(), examDate: "2027-02-27", publishedTestIds: new Set(),
      attempts: [], answers: answers("m010-x", 3, 0, NOW - 8 * DAY),
    });
    expect(suggestActions(pace, []).map((suggestion) => suggestion.text)).toEqual(["No practice for 4 days"]);
  });

  it("has nothing to say before the plan starts", () => {
    const pace = paceReport({ week: 0, nowMs: NOW, examDate: "2027-02-27", publishedTestIds: published, attempts: [], answers: [] });
    expect(pace).toMatchObject({ testsDue: [], practiceTarget: 0, daysSinceLastPractice: null });
    expect(suggestActions(pace, [])).toEqual([]);
  });
});

describe("buildSessionPrep", () => {
  it("collects results since the last session, focus, overdue and this session's tests", () => {
    const prep = buildSessionPrep({
      session: { number: 6, date: "2026-10-10", title: "Economics II", readings: ["cfa-2027-outline-m018", "cfa-2027-outline-m019"] },
      since: "2026-10-03",
      attempts: [attempt("e03-fiscal-policy", 4, NOW - DAY), attempt("m01-rates-and-returns", 7, NOW - 30 * DAY), attempt("e08-exchange-rate-calculations", 6, NOW - DAY)],
      answers: [...answers("m014-fiscal", 6, 2, NOW - DAY), ...answers("m014-fiscal", 1, 1, NOW - 30 * DAY)],
      standings: moduleStandings([attempt("e03-fiscal-policy", 4)], []),
      overdueTestIds: ["e06-international-trade"],
      publishedTestIds: new Set(["e08-exchange-rate-calculations", "e07-capital-flows-fx-market"]),
    });
    expect(prep.results.map((result) => result.code)).toEqual(["EC3", "EC8"]);
    expect(prep.practice).toEqual({ answered: 8, accuracy: 0.75 });
    expect(prep.focus.map((standing) => standing.test?.code)).toEqual(["EC3"]);
    expect(prep.overdue).toEqual(["EC6"]);
    expect(prep.tests.map((test) => [test.code, test.state, test.score])).toEqual([["EC7", "to-take", null], ["EC8", "taken", 6]]);

    const text = sessionPrepText(prep, "Sat 10 Oct");
    expect(text.split("\n")[0]).toBe("Session 06 · Sat 10 Oct · Economics II");
    expect(text).toContain("- Tests: EC3 4/8, EC8 6/8");
    expect(text).toContain("- Practice: 8 answered, 75% correct");
    expect(text).toContain("Overdue tests: EC6");
    expect(text).toContain("Module tests: EC7 to take, EC8 6/8");
  });
});
