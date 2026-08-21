import rawPlan from "./plan.json";
import type {
  PlanSession,
  PlanTask,
  PlanWeek,
  SessionOverride,
  TrackerState,
} from "../types";
import { isTaskComplete } from "../lib/taskStatus";

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

export function getSessionTaskId(week: PlanWeek, session: PlanSession): string {
  const index = getWeekSessions(week).findIndex(
    (candidate) => candidate.number === session.number,
  );
  return `w${week.week}-session-${index + 1}`;
}

export function getPlanTasks(
  week: PlanWeek,
  sessionOverrides: Record<string, SessionOverride> = {},
): PlanTask[] {
  const weekPrefix = `w${week.week}`;
  const sessions = getWeekSessions(week).map(
    (session, index): PlanTask => {
      const override = sessionOverrides[String(session.number)];
      const isFridayException = override && override.date !== session.date;
      const cadenceLabel = isFridayException
        ? "Friday 09:00 exception"
        : session.label;
      return {
        id: `${weekPrefix}-session-${index + 1}`,
        label: session.title,
        detail: `Session ${String(session.number).padStart(2, "0")} | ${cadenceLabel} | ${override?.date ?? session.date} | ${session.durationMinutes} minutes`,
        kind: "session",
        optional: false,
      };
    },
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
    ...independent,
    ...sessions,
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

export function getWeekProgressForState(
  week: PlanWeek,
  tracker: TrackerState,
): number {
  const tasks = getRequiredTasks(week);
  if (!tasks.length) return 0;
  const complete = tasks.filter((task) => isTaskComplete(task, tracker)).length;
  return Math.round((complete / tasks.length) * 100);
}

export function getOverallProgressForState(tracker: TrackerState): number {
  const tasks = PLAN.flatMap(getRequiredTasks);
  if (!tasks.length) return 0;
  const complete = tasks.filter((task) => isTaskComplete(task, tracker)).length;
  return Math.round((complete / tasks.length) * 100);
}
