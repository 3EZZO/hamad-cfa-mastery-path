import { PHASES, PLAN } from "../data/plan";
import type { MockScore, TrackerState } from "../types";
import { weakMockSections, type MockSectionSummary } from "./mockSections";

/**
 * Where the programme is, in the terms Home changes shape for. The plan's
 * phases (plan.json) are, in order: curriculum coverage, the coverage close
 * and integration gate, the mock and repair campaign, and taper.
 */
export type PlanPhase = "pre" | "coverage" | "integration" | "mock" | "taper" | "post";

const PHASE_ORDER: PlanPhase[] = ["coverage", "integration", "mock", "taper"];

export function getPlanPhase(week: number): PlanPhase {
  if (week < 1) return "pre";
  if (week > PLAN.length) return "post";
  const index = PHASES.indexOf(PLAN[week - 1].phase);
  return PHASE_ORDER[index] ?? "coverage";
}

export interface MockMilestone {
  label: string;
  target: number;
  week: number;
  startDate: string;
  endDate: string;
}

export interface MockCampaignStatus {
  /** The next planned full mock not yet recorded, from this week on. */
  nextMock: MockMilestone | null;
  latest: (Pick<MockScore, "label" | "score" | "date"> & { target: number | null }) | null;
  /** Sections of the latest mock clearly under its target, weakest first. */
  weakSections: MockSectionSummary[];
}

const MOCK_WEEKS: MockMilestone[] = PLAN.flatMap((week) =>
  week.mockMilestone?.targetScore != null
    ? [{ label: week.mockMilestone.label, target: week.mockMilestone.targetScore, week: week.week, startDate: week.startDate, endDate: week.endDate }]
    : [],
);

function sameLabel(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function milestoneFor(mock: MockScore): MockMilestone | null {
  if (mock.milestoneWeek != null) {
    const exact = MOCK_WEEKS.find((milestone) => milestone.week === mock.milestoneWeek);
    if (exact) return exact;
  }
  return MOCK_WEEKS.find((milestone) => sameLabel(milestone.label, mock.label)) ?? null;
}

export function mockCampaignStatus(tracker: TrackerState, week: number): MockCampaignStatus {
  const recorded = new Set(
    tracker.mockScores.flatMap((mock) => {
      const milestone = milestoneFor(mock);
      return milestone ? [milestone.week] : [];
    }),
  );
  const nextMock = MOCK_WEEKS.find((milestone) => milestone.week >= week && !recorded.has(milestone.week)) ?? null;
  const latestScore = [...tracker.mockScores].sort((left, right) => left.date.localeCompare(right.date)).at(-1);
  const target = latestScore ? milestoneFor(latestScore)?.target ?? null : null;
  return {
    nextMock,
    latest: latestScore ? { label: latestScore.label, score: latestScore.score, date: latestScore.date, target } : null,
    weakSections: latestScore ? weakMockSections(latestScore, target ?? 72).slice(0, 3) : [],
  };
}
