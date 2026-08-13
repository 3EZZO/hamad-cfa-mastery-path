import { getPlanTasks, getSessionTaskId, getWeekSessions, PLAN } from "../data/plan";
import type { TrackerState } from "../types";
import { differenceInCalendarDays, getProgramWeek, parseDateOnly } from "./dates";
import { effectiveSessionDate } from "./schedule";

export type RiskTone = "green" | "amber" | "red";

export interface RiskIndicator {
  id: string;
  tone: RiskTone;
  title: string;
  detail: string;
  action: string;
}

function withinDays(date: string, today: string, days: number): boolean {
  const age = differenceInCalendarDays(parseDateOnly(today), parseDateOnly(date));
  return age >= 0 && age <= days;
}

export function buildRiskIndicators(
  tracker: TrackerState,
  today: string,
): RiskIndicator[] {
  const firstSession = effectiveSessionDate(
    PLAN[0].session1,
    tracker.sessionOverrides,
  );
  if (today < firstSession) {
    return [{
      id: "prelaunch",
      tone: "green",
      title: "Pre-launch window",
      detail: `Session 01 begins ${firstSession}; no study-performance warning is active yet.`,
      action: "Complete the account, calendar, and diagnostic-readiness checks.",
    }];
  }

  const indicators: RiskIndicator[] = [];
  const overdueSessions = PLAN.flatMap((week) =>
    getWeekSessions(week).filter((session) => {
      const date = effectiveSessionDate(session, tracker.sessionOverrides);
      return date < today && !tracker.taskCompletions[getSessionTaskId(week, session)];
    }),
  );
  if (overdueSessions.length) {
    indicators.push({
      id: "overdue-sessions",
      tone: overdueSessions.length >= 2 ? "red" : "amber",
      title: `${overdueSessions.length} overdue tutor-session ${overdueSessions.length === 1 ? "task" : "tasks"}`,
      detail: `The oldest open session is S${String(overdueSessions[0].number).padStart(2, "0")}.`,
      action: "Reconcile the checklist with the tutor before adding new backlog.",
    });
  }

  const programWeek = getProgramWeek(parseDateOnly(today));
  if (programWeek >= 1 && programWeek <= PLAN.length) {
    const week = PLAN[programWeek - 1];
    const tasks = getPlanTasks(week);
    const complete = tasks.filter((task) => tracker.taskCompletions[task.id]).length;
    const elapsed = Math.max(
      1,
      Math.min(
        7,
        differenceInCalendarDays(parseDateOnly(today), parseDateOnly(week.startDate)) + 1,
      ),
    );
    const expected = Math.floor((tasks.length * elapsed) / 7);
    if (complete + 1 < expected) {
      indicators.push({
        id: "weekly-pace",
        tone: expected - complete >= 3 ? "red" : "amber",
        title: "This week is behind its execution pace",
        detail: `${complete} of ${tasks.length} items are complete; about ${expected} would normally be complete by now.`,
        action: "Protect the next required block and move optional work first.",
      });
    }
  }

  const recentPractice = tracker.practiceLogs.filter((entry) =>
    withinDays(entry.date, today, 14),
  );
  const attempted = recentPractice.reduce((sum, entry) => sum + entry.attempted, 0);
  const correct = recentPractice.reduce((sum, entry) => sum + entry.correct, 0);
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
  const daysSinceLaunch = differenceInCalendarDays(
    parseDateOnly(today),
    parseDateOnly(firstSession),
  );
  if (daysSinceLaunch >= 7 && attempted === 0) {
    indicators.push({
      id: "practice-gap",
      tone: "amber",
      title: "No practice logged in the last 14 days",
      detail: "The tracker has no recent question-volume evidence.",
      action: "Log the next reviewed practice block, including the lesson from it.",
    });
  } else if (attempted >= 30 && accuracy < 70) {
    indicators.push({
      id: "practice-accuracy",
      tone: accuracy < 60 ? "red" : "amber",
      title: `Recent practice accuracy is ${accuracy}%`,
      detail: `${correct} correct answers across ${attempted} questions in the last 14 days.`,
      action: "Reduce breadth, classify the misses, and retest the dominant error pattern.",
    });
  }

  const dueRetests = tracker.errorEntries.filter(
    (entry) => !entry.resolved && entry.revisitDate && entry.revisitDate <= today,
  );
  if (dueRetests.length) {
    indicators.push({
      id: "due-retests",
      tone: dueRetests.length >= 3 ? "red" : "amber",
      title: `${dueRetests.length} mistake ${dueRetests.length === 1 ? "retest is" : "retests are"} due`,
      detail: "Open correction rules have reached their planned revisit date.",
      action: "Run delayed retrieval before adding another large question set.",
    });
  }

  const diagnosticComplete = tracker.diagnostics.some(
    (entry) => entry.sessionNumber === 1 && entry.status === "final",
  );
  if (today > firstSession && !diagnosticComplete) {
    indicators.push({
      id: "diagnostic-missing",
      tone: "amber",
      title: "Session 01 diagnostic is not finalized",
      detail: "The baseline from the two prior attempts has not been secured in the tracker.",
      action: "Tutor: finalize the 25-minute baseline and record the repair priorities.",
    });
  }

  const latestMock = [...tracker.mockScores].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (latestMock) {
    const mockTargets = PLAN.flatMap((week) =>
      week.mockMilestone?.targetScore == null ? [] : [week.mockMilestone.targetScore],
    );
    const target = mockTargets[Math.max(0, tracker.mockScores.length - 1)] ?? 72;
    if (latestMock.score < target) {
      const gap = target - latestMock.score;
      indicators.push({
        id: "mock-gap",
        tone: gap >= 10 ? "red" : "amber",
        title: `${latestMock.label} is ${gap} points below its internal target`,
        detail: `Recorded ${latestMock.score}% against the ${target}% coaching target.`,
        action: "Complete the debrief and targeted repair before the next full mock.",
      });
    }
  }

  if (!indicators.length) {
    return [{
      id: "on-track",
      tone: "green",
      title: "No active execution warning",
      detail: "Current tracker evidence does not trigger an overdue, accuracy, retest, or mock alert.",
      action: "Continue the current week in sequence and keep the evidence current.",
    }];
  }

  return indicators.sort((left, right) => {
    const rank: Record<RiskTone, number> = { red: 0, amber: 1, green: 2 };
    return rank[left.tone] - rank[right.tone];
  });
}
