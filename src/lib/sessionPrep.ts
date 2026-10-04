import { mockModuleById, mockModuleCode, mockModulesForCatalog } from "../data/mockModules";
import { READING_INDEX } from "../data/readings";
import type { MockAttempt } from "./mockTestContent";
import type { ModuleStanding, PracticeAnswerFact } from "./tutorInsights";

/**
 * Agenda for the next tutoring session: what happened since the last one,
 * where to focus, what is overdue and what this session teaches. Pure; the
 * console renders it and copies it as plain text.
 */

export interface SessionPrep {
  session: { number: number; date: string; title: string };
  /** Date of the previous session (YYYY-MM-DD), when there was one. */
  since: string | null;
  results: Array<{ code: string; title: string; score: number | null }>;
  practice: { answered: number; accuracy: number | null };
  focus: ModuleStanding[];
  overdue: string[];
  readings: string[];
  tests: Array<{ id: string; code: string; title: string; state: "unpublished" | "to-take" | "taken"; score: number | null }>;
}

function localMidnight(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!).getTime();
}

export function buildSessionPrep(input: {
  session: { number: number; date: string; title: string; readings: readonly string[] };
  since: string | null;
  attempts: readonly MockAttempt[];
  answers: readonly PracticeAnswerFact[];
  standings: readonly ModuleStanding[];
  overdueTestIds: readonly string[];
  publishedTestIds: ReadonlySet<string>;
}): SessionPrep {
  const sinceMs = input.since ? localMidnight(input.since) : -Infinity;
  const finished = input.attempts.filter((attempt) => attempt.status !== "active");
  const results = finished
    .filter((attempt) => (attempt.submittedAtMs ?? 0) >= sinceMs)
    .sort((left, right) => (left.submittedAtMs ?? 0) - (right.submittedAtMs ?? 0))
    .flatMap((attempt) => {
      const module = mockModuleById(attempt.moduleId);
      return module ? [{ code: mockModuleCode(module), title: module.title, score: attempt.score }] : [];
    });
  const recent = input.answers.filter((answer) => answer.answeredAtMs >= sinceMs);
  const correct = recent.filter((answer) => answer.correct).length;
  return {
    session: { number: input.session.number, date: input.session.date, title: input.session.title },
    since: input.since,
    results,
    practice: { answered: recent.length, accuracy: recent.length ? correct / recent.length : null },
    focus: input.standings.filter((standing) => standing.weak).slice(0, 3),
    overdue: input.overdueTestIds.map((id) => { const module = mockModuleById(id); return module ? mockModuleCode(module) : id; }),
    readings: input.session.readings.map((id) => {
      const entry = READING_INDEX.get(id);
      return entry ? `Module ${entry.number} · ${entry.title}` : id;
    }),
    tests: mockModulesForCatalog(input.session.readings).map((module) => {
      const attempt = finished.find((entry) => entry.moduleId === module.id);
      return {
        id: module.id,
        code: mockModuleCode(module),
        title: module.title,
        state: attempt ? "taken" : input.publishedTestIds.has(module.id) ? "to-take" : "unpublished",
        score: attempt?.score ?? null,
      };
    }),
  };
}

const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);

/** Plain-text agenda for notes or a message. */
export function sessionPrepText(prep: SessionPrep, dateLabel: string): string {
  const lines = [`Session ${String(prep.session.number).padStart(2, "0")} · ${dateLabel} · ${prep.session.title}`, ""];
  lines.push(prep.since ? `Since the last session (${prep.since}):` : "So far:");
  lines.push(prep.results.length
    ? `- Tests: ${prep.results.map((result) => `${result.code} ${result.score === null ? "ungraded" : `${result.score}/8`}`).join(", ")}`
    : "- Tests: none taken");
  lines.push(`- Practice: ${prep.practice.answered} answered${prep.practice.answered ? `, ${percent(prep.practice.accuracy)} correct` : ""}`);
  if (prep.focus.length) {
    lines.push("", "Focus:");
    for (const standing of prep.focus) {
      const parts = [standing.test && standing.test.score !== null ? `test ${standing.test.score}/8` : "", standing.practiceAnswered ? `practice ${percent(standing.practiceAccuracy)}` : ""].filter(Boolean);
      lines.push(`- ${standing.label}${parts.length ? ` (${parts.join(", ")})` : ""}`);
    }
  }
  if (prep.overdue.length) lines.push("", `Overdue tests: ${prep.overdue.join(", ")}`);
  if (prep.readings.length) {
    lines.push("", "This session:");
    for (const reading of prep.readings) lines.push(`- ${reading}`);
  }
  if (prep.tests.length) {
    lines.push("", `Module tests: ${prep.tests.map((test) => `${test.code} ${test.state === "taken" ? (test.score === null ? "taken" : `${test.score}/8`) : test.state === "to-take" ? "to take" : "not published"}`).join(", ")}`);
  }
  return lines.join("\n");
}
