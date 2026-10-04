import { getPlanTasks, PLAN } from "../data/plan";
import type { PlanTask, TrackerState } from "../types";
import type { PracticeIntent } from "./practiceIntents";
import { PRACTICE_INTENTS } from "./practiceIntents";
import { isRetestDue } from "./retests";
import { listOverdueWork } from "./risk";
import { getTaskStatus } from "./taskStatus";
import { testsForWeek } from "./weekTests";

/**
 * Today: one ordered list of the day's work, built from what is already
 * known — the tracker (plan tasks, Mistake Review), the device's practice
 * review state and the module tests still to take. Pure; the Home card and
 * its tests render whatever this returns.
 */

export type TodayItemKind = "overdue" | "moduleTest" | "retest" | "review" | "task";

/** What pressing an item does. Kept semantic so the shell decides which view hosts it. */
export type TodayAction =
  | { type: "week"; week: number }
  | { type: "practice"; intent: PracticeIntent }
  | { type: "moduleTest"; moduleId: string }
  | { type: "mistakes" };

export interface TodayItem {
  id: string;
  kind: TodayItemKind;
  title: string;
  detail: string;
  /** Known duration only (timed tests, question sets); null when the plan gives none. */
  minutes: number | null;
  action: TodayAction;
  /** The plan task behind an overdue/task item; sessions complete only through tutor approval. */
  task?: PlanTask;
}

export interface TodayPendingModuleTest {
  moduleId: string;
  title: string;
  /** ISO date or date-time from the tutor's reminder; null when none was set. */
  deadline: string | null;
  /** Started and not yet submitted: resume before anything else. */
  inProgress?: boolean;
}

export interface TodayQueueInput {
  tracker: TrackerState;
  /** Program week from getProgramWeek: 0 before launch, TOTAL_WEEKS + 1 after the exam. */
  week: number;
  /** YYYY-MM-DD. */
  today: string;
  /** Questions whose spaced-review date has arrived; null when practice data is unavailable. */
  dueReviews?: number | null;
  /** Published module tests not yet submitted; null when their status is unavailable. */
  pendingModuleTests?: TodayPendingModuleTest[] | null;
}

export const TODAY_LIMITS = {
  overdue: 3,
  weekTasks: 3,
} as const;

export const TODAY_MINUTES = {
  moduleTest: 12,
  retest: 5,
  reviewQuestion: 1.5,
} as const;

const REVIEW_SET = PRACTICE_INTENTS.review.count;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/** Sessions waiting on the tutor are not the student's next step. */
function isWaitingOnTutor(task: PlanTask, tracker: TrackerState): boolean {
  return task.kind === "session" && getTaskStatus(task, tracker) === "requested";
}

function taskItem(task: PlanTask, week: number, kind: "overdue" | "task", detail: string): TodayItem {
  return {
    id: `${kind}-${task.id}`,
    kind,
    title: task.label,
    detail,
    minutes: null,
    action: { type: "week", week },
    task,
  };
}

/** In progress first, then the soonest deadline, then this week's tests, then the rest. */
function byDeadline(weekIds: ReadonlySet<string>) {
  return (left: TodayPendingModuleTest, right: TodayPendingModuleTest): number => {
    if (Boolean(left.inProgress) !== Boolean(right.inProgress)) return left.inProgress ? -1 : 1;
    if (left.deadline && right.deadline) return left.deadline.localeCompare(right.deadline);
    if (left.deadline) return -1;
    if (right.deadline) return 1;
    return Number(weekIds.has(right.moduleId)) - Number(weekIds.has(left.moduleId));
  };
}

export function buildTodayQueue({
  tracker,
  week,
  today,
  dueReviews = null,
  pendingModuleTests = null,
}: TodayQueueInput): TodayItem[] {
  if (week > PLAN.length) return [];
  const items: TodayItem[] = [];

  // Module tests always lead: they are compulsory, timed and single-attempt.
  const weekIds = new Set(testsForWeek(week).map((module) => module.id));
  const pending = [...(pendingModuleTests ?? [])].sort(byDeadline(weekIds));
  if (pending.length) {
    const next = pending[0];
    const more = pending.length - 1;
    items.push({
      id: `module-test-${next.moduleId}`,
      kind: "moduleTest",
      title: `Module test: ${next.title}`,
      detail: [
        next.inProgress ? "In progress · resume now" : next.deadline ? `Due ${next.deadline.slice(0, 10)}` : "One attempt · 12 minutes",
        !next.inProgress && weekIds.has(next.moduleId) ? "This week's topic" : "",
        more ? `${more} more ${plural(more, "test")} waiting` : "",
      ].filter(Boolean).join(" · "),
      minutes: TODAY_MINUTES.moduleTest,
      action: { type: "moduleTest", moduleId: next.moduleId },
    });
  }

  const overdue = week >= 1
    ? listOverdueWork(tracker, today).filter(({ task }) => !isWaitingOnTutor(task, tracker))
    : [];
  const overdueIds = new Set(overdue.map(({ task }) => task.id));
  overdue.slice(0, TODAY_LIMITS.overdue).forEach(({ task, week: taskWeek, dueDate }) => {
    items.push(taskItem(task, taskWeek, "overdue", `Overdue since ${dueDate} · week ${taskWeek}`));
  });

  const dueRetests = tracker.errorEntries.filter((entry) => isRetestDue(entry, today)).length;
  if (dueRetests) {
    items.push({
      id: "retests",
      kind: "retest",
      title: `${dueRetests} mistake ${plural(dueRetests, "retest")} due`,
      detail: "Redo each one from memory before new work",
      minutes: dueRetests * TODAY_MINUTES.retest,
      action: { type: "mistakes" },
    });
  }

  if (dueReviews && dueReviews > 0) {
    const setSize = Math.min(dueReviews, REVIEW_SET);
    items.push({
      id: "reviews",
      kind: "review",
      title: `${dueReviews} ${plural(dueReviews, "question")} due for review`,
      detail: dueReviews > REVIEW_SET ? `Start with a set of ${REVIEW_SET}` : "Spaced review",
      minutes: Math.round(setSize * TODAY_MINUTES.reviewQuestion),
      action: { type: "practice", intent: "review" },
    });
  }

  if (week >= 1) {
    const planWeek = PLAN[week - 1];
    getPlanTasks(planWeek, tracker.sessionOverrides)
      .filter((task) => !overdueIds.has(task.id))
      .filter((task) => {
        const status = getTaskStatus(task, tracker);
        return status !== "complete" && status !== "approved" && status !== "requested";
      })
      .slice(0, TODAY_LIMITS.weekTasks)
      .forEach((task) => {
        items.push(taskItem(task, week, "task", task.detail));
      });
  }

  return items;
}

/** Sum of the known durations; items without one are counted separately. */
export function todayQueueMinutes(items: TodayItem[]): { minutes: number; untimed: number } {
  return items.reduce(
    (total, item) => item.minutes == null
      ? { ...total, untimed: total.untimed + 1 }
      : { ...total, minutes: total.minutes + item.minutes },
    { minutes: 0, untimed: 0 },
  );
}
