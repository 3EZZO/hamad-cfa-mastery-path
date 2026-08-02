import rawPlan from "./plan.json";
import type { PlanSession, PlanTask, PlanWeek } from "../types";

export const TOPICS = [
  "Ethical and Professional Standards",
  "Quantitative Methods",
  "Economics",
  "Financial Statement Analysis",
  "Corporate Issuers",
  "Equity Investments",
  "Fixed Income",
  "Derivatives",
  "Alternative Investments",
  "Portfolio Management",
] as const;

export const PLAN = rawPlan as PlanWeek[];

export const PHASES = Array.from(new Set(PLAN.map((week) => week.phase)));

export function getWeekSessions(week: PlanWeek): PlanSession[] {
  return [week.session1, week.session2, week.session3].filter(
    (session): session is PlanSession => Boolean(session),
  );
}

export function getPlanTasks(week: PlanWeek): PlanTask[] {
  const weekPrefix = `w${week.week}`;
  const sessions = getWeekSessions(week).map(
    (session, index): PlanTask => ({
      id: `${weekPrefix}-session-${index + 1}`,
      label: session.title,
      detail: `Session ${String(session.number).padStart(2, "0")} | ${session.label} | ${session.date} | ${session.durationMinutes} minutes`,
      kind: "session",
      optional: false,
    }),
  );

  const independent = week.independentStudy.map(
    (item, index): PlanTask => ({
      id: `${weekPrefix}-independent-${index + 1}`,
      label: item,
      detail: "Independent study",
      kind: "independent",
      optional: false,
    }),
  );

  return [
    ...sessions,
    ...independent,
    {
      id: `${weekPrefix}-evidence-gate`,
      label: week.masteryGate,
      detail: "Weekly evidence gate",
      kind: "evidence",
      optional: false,
    },
  ];
}

export function getRequiredTasks(week: PlanWeek): PlanTask[] {
  return getPlanTasks(week).filter((task) => !task.optional);
}

export function getWeekProgress(
  week: PlanWeek,
  completions: Record<string, boolean>,
): number {
  const tasks = getRequiredTasks(week);
  if (!tasks.length) return 0;
  const complete = tasks.filter((task) => completions[task.id]).length;
  return Math.round((complete / tasks.length) * 100);
}

export function getOverallProgress(
  completions: Record<string, boolean>,
): number {
  const tasks = PLAN.flatMap(getRequiredTasks);
  if (!tasks.length) return 0;
  const complete = tasks.filter((task) => completions[task.id]).length;
  return Math.round((complete / tasks.length) * 100);
}
