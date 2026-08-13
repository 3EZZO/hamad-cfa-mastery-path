import { getPlanTasks, getWeekSessions, PLAN } from "../data/plan";
import type { TrackerState } from "../types";
import { differenceInCalendarDays, getProgramWeek, parseDateOnly } from "./dates";
import { effectiveSessionDate } from "./schedule";
import { isTaskComplete } from "./taskStatus";

export type RiskTone = "green" | "amber" | "red";

export interface RiskIndicator {
  id: string;
  tone: RiskTone;
  title: string;
  detail: string;
  action: string;
}

function ageInDays(date: string, today: string): number {
  return differenceInCalendarDays(parseDateOnly(today), parseDateOnly(date));
}

function withinDayRange(
  date: string,
  today: string,
  minimumAge: number,
  maximumAge: number,
): boolean {
  const age = ageInDays(date, today);
  return age >= minimumAge && age <= maximumAge;
}

function practiceSummary(
  tracker: TrackerState,
  today: string,
  minimumAge: number,
  maximumAge: number,
): { attempted: number; correct: number; accuracy: number | null } {
  const entries = tracker.practiceLogs.filter((entry) =>
    withinDayRange(entry.date, today, minimumAge, maximumAge),
  );
  const attempted = entries.reduce((sum, entry) => sum + entry.attempted, 0);
  const correct = entries.reduce((sum, entry) => sum + entry.correct, 0);
  return {
    attempted,
    correct,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : null,
  };
}

function targetForMock(tracker: TrackerState): number | null {
  const latestMock = [...tracker.mockScores]
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);
  if (!latestMock) return null;

  if (latestMock.milestoneWeek != null) {
    const exactWeek = PLAN.find((week) => week.week === latestMock.milestoneWeek);
    if (exactWeek?.mockMilestone?.targetScore != null) {
      return exactWeek.mockMilestone.targetScore;
    }
  }

  const matchingLabel = PLAN.find(
    (week) =>
      week.mockMilestone?.label.localeCompare(latestMock.label, undefined, {
        sensitivity: "accent",
      }) === 0 && week.mockMilestone.targetScore != null,
  );
  return matchingLabel?.mockMilestone?.targetScore ?? 72;
}

function isPast(date: string, today: string): boolean {
  return date < today;
}

function requiredWorkDueDate(
  taskKind: "session" | "independent" | "evidence",
  sessionDate: string | null,
  weekEndDate: string,
): string {
  return taskKind === "session" && sessionDate ? sessionDate : weekEndDate;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function signedPointDifference(value: number): string {
  return `${Math.abs(value)} percentage ${plural(Math.abs(value), "point")}`;
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
  const overdueWork = PLAN.flatMap((week) => {
    const sessions = getWeekSessions(week);
    return getPlanTasks(week, tracker.sessionOverrides).flatMap((task) => {
      const sessionIndex = task.kind === "session"
        ? Number(task.id.match(/session-(\d+)$/)?.[1] ?? 0) - 1
        : -1;
      const session = sessionIndex >= 0 ? sessions[sessionIndex] : null;
      const dueDate = requiredWorkDueDate(
        task.kind,
        session ? effectiveSessionDate(session, tracker.sessionOverrides) : null,
        week.endDate,
      );
      return !task.optional && isPast(dueDate, today) && !isTaskComplete(task, tracker)
        ? [{ task, dueDate, sessionNumber: session?.number ?? null }]
        : [];
    });
  }).sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  if (overdueWork.length) {
    const oldest = overdueWork[0];
    const oldestLabel = oldest.sessionNumber == null
      ? oldest.task.label
      : `Session ${String(oldest.sessionNumber).padStart(2, "0")}`;
    indicators.push({
      id: "overdue-work",
      tone: overdueWork.length >= 3 ? "red" : "amber",
      title: `${overdueWork.length} overdue required ${plural(overdueWork.length, "item")}`,
      detail: `The oldest is "${oldestLabel}," due ${oldest.dueDate}. Session work counts only after tutor approval.`,
      action: "Reconcile the oldest required work with the tutor before adding new backlog.",
    });
  }

  const programWeek = getProgramWeek(parseDateOnly(today));
  if (programWeek >= 1 && programWeek <= PLAN.length) {
    const week = PLAN[programWeek - 1];
    const tasks = getPlanTasks(week);
    const complete = tasks.filter((task) => isTaskComplete(task, tracker)).length;
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

  const recentPractice = practiceSummary(tracker, today, 0, 13);
  const priorPractice = practiceSummary(tracker, today, 14, 27);
  const attempted = recentPractice.attempted;
  const correct = recentPractice.correct;
  const accuracy = recentPractice.accuracy;
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
  }
  const accuracyDecline =
    attempted >= 30 &&
    priorPractice.attempted >= 30 &&
    accuracy != null &&
    priorPractice.accuracy != null
      ? priorPractice.accuracy - accuracy
      : 0;
  if (accuracyDecline >= 8 && accuracy != null && priorPractice.accuracy != null) {
    indicators.push({
      id: "practice-decline",
      tone: accuracyDecline >= 15 || accuracy < 60 ? "red" : "amber",
      title: `Practice accuracy declined to ${accuracy}%`,
      detail: `The latest 14-day window is ${signedPointDifference(accuracyDecline)} below the prior 14-day window (${priorPractice.accuracy}%), with meaningful samples in both.`,
      action: "Pause new breadth, identify the dominant change, and retest it in a fresh set.",
    });
  } else if (attempted >= 30 && accuracy != null && accuracy < 70) {
    indicators.push({
      id: "practice-accuracy",
      tone: accuracy < 60 ? "red" : "amber",
      title: `Recent practice accuracy is ${accuracy}%`,
      detail: `${correct} correct answers across ${attempted} questions in the last 14 days.`,
      action: "Reduce breadth, classify the misses, and retest the dominant error pattern.",
    });
  }

  const openMistakes = tracker.errorEntries.filter((entry) => !entry.resolved);
  const dueRetests = openMistakes.filter(
    (entry) => !entry.resolved && entry.revisitDate && entry.revisitDate <= today,
  );
  if (dueRetests.length) {
    indicators.push({
      id: "due-retests",
      tone: dueRetests.length >= 3 ? "red" : "amber",
      title: `${dueRetests.length} mistake ${dueRetests.length === 1 ? "retest is" : "retests are"} due`,
      detail: `${dueRetests.length} of ${openMistakes.length} open ${plural(openMistakes.length, "mistake")} have reached their planned revisit date.`,
      action: "Run delayed retrieval before adding another large question set.",
    });
  } else if (openMistakes.length) {
    const unscheduled = openMistakes.filter((entry) => !entry.revisitDate).length;
    indicators.push({
      id: "open-mistakes",
      tone: openMistakes.length >= 5 || unscheduled >= 2 ? "red" : "amber",
      title: `${openMistakes.length} unresolved ${plural(openMistakes.length, "mistake")}`,
      detail: unscheduled
        ? `${unscheduled} ${plural(unscheduled, "mistake has", "mistakes have")} no retest date.`
        : "The correction work is scheduled and remains open.",
      action: unscheduled
        ? "Assign a retest date and a reproducible correction rule to every open mistake."
        : "Complete each delayed retest on its scheduled date and record the result.",
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

  const sortedMocks = [...tracker.mockScores].sort((a, b) => a.date.localeCompare(b.date));
  const latestMock = sortedMocks.at(-1);
  if (latestMock) {
    const target = targetForMock(tracker) ?? 72;
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

    const priorMock = sortedMocks.at(-2);
    if (priorMock && latestMock.score <= priorMock.score - 4) {
      const decline = priorMock.score - latestMock.score;
      indicators.push({
        id: "mock-decline",
        tone: decline >= 8 ? "red" : "amber",
        title: `Latest mock declined by ${decline} points`,
        detail: `${priorMock.label} was ${priorMock.score}%; ${latestMock.label} was ${latestMock.score}%.`,
        action: "Compare the two debriefs and repair the topics or pacing decisions that regressed.",
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
