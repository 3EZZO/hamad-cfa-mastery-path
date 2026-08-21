import { getPlanTasks, getWeekSessions, PLAN, TOPICS } from "../data/plan";
import type { PlanWeek, TrackerState } from "../types";
import { formatDate } from "./dates";
import { buildRiskIndicators, type RiskIndicator } from "./risk";
import { isTaskComplete } from "./taskStatus";

export interface WeeklyReport {
  week: number;
  period: string;
  focus: string;
  completionPercent: number;
  completedTasks: number;
  totalTasks: number;
  sessionsCompleted: number;
  plannedSessions: number;
  tutorMinutes: number;
  practiceAttempted: number;
  practiceCorrect: number;
  practiceAccuracy: number | null;
  topicSnapshot: Array<{ topic: string; mastery: number }>;
  openMistakes: number;
  dueRetests: number;
  mockSummary: string;
  risks: RiskIndicator[];
  priorities: string[];
  nextWeekFocus: string | null;
  generatedAt: string;
}

function between(value: string, start: string, end: string): boolean {
  return value >= start && value <= end;
}

export function buildWeeklyReport(
  week: PlanWeek,
  tracker: TrackerState,
  today: string,
): WeeklyReport {
  const tasks = getPlanTasks(week, tracker.sessionOverrides);
  const completedTasks = tasks.filter((task) => isTaskComplete(task, tracker)).length;
  const practice = tracker.practiceLogs.filter((entry) =>
    between(entry.date, week.startDate, week.endDate),
  );
  const practiceAttempted = practice.reduce((sum, entry) => sum + entry.attempted, 0);
  const practiceCorrect = practice.reduce((sum, entry) => sum + entry.correct, 0);
  const sessions = getWeekSessions(week);
  const sessionNumbers = new Set(sessions.map((session) => session.number));
  const sessionLogs = tracker.sessionLogs.filter(
    (entry) => entry.week === week.week || sessionNumbers.has(entry.sessionNumber),
  );
  const errors = tracker.errorEntries.filter(
    (entry) => between(entry.date, week.startDate, week.endDate) ||
      (!entry.resolved && entry.revisitDate && entry.revisitDate <= week.endDate),
  );
  const mocks = tracker.mockScores.filter((entry) =>
    between(entry.date, week.startDate, week.endDate),
  );
  const incomplete = tasks.filter((task) => !isTaskComplete(task, tracker));
  const sessionTasks = tasks.filter((task) => task.kind === "session");
  const openErrors = errors.filter((entry) => !entry.resolved);
  const risks = buildRiskIndicators(tracker, today);
  const priorities = [
    ...incomplete.slice(0, 2).map((task) => `Complete: ${task.label}`),
    ...openErrors.slice(0, 1).map((entry) => `Retest: ${entry.summary}`),
    ...risks.filter((risk) => risk.tone !== "green").slice(0, 2).map((risk) => risk.action),
  ].filter((item, index, values) => values.indexOf(item) === index).slice(0, 4);
  const nextWeek = PLAN[week.week] ?? null;

  return {
    week: week.week,
    period: `${formatDate(week.startDate)} - ${formatDate(week.endDate)}`,
    focus: week.focus,
    completionPercent: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
    completedTasks,
    totalTasks: tasks.length,
    sessionsCompleted: sessionTasks.filter((task) => isTaskComplete(task, tracker)).length,
    plannedSessions: sessions.length,
    tutorMinutes: sessionLogs.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    practiceAttempted,
    practiceCorrect,
    practiceAccuracy: practiceAttempted
      ? Math.round((practiceCorrect / practiceAttempted) * 100)
      : null,
    topicSnapshot: week.topics.map((topic) => ({
      topic,
      mastery: tracker.topicMastery[topic] ?? 0,
    })),
    openMistakes: openErrors.length,
    dueRetests: openErrors.filter(
      (entry) => entry.revisitDate && entry.revisitDate <= today,
    ).length,
    mockSummary: mocks.length
      ? mocks.map((entry) => `${entry.label}: ${entry.score}%`).join("; ")
      : "No full mock recorded this week",
    risks,
    priorities: priorities.length ? priorities : ["Continue the next required item in sequence."],
    nextWeekFocus: nextWeek?.focus ?? null,
    generatedAt: today,
  };
}

export function formatWeeklyReportText(report: WeeklyReport): string {
  return [
    `HAMAD CFA MASTERY - WEEK ${String(report.week).padStart(2, "0")} REPORT`,
    report.period,
    `Focus: ${report.focus}`,
    "",
    `Execution: ${report.completionPercent}% (${report.completedTasks}/${report.totalTasks} required items)`,
    `Tutor sessions: ${report.sessionsCompleted}/${report.plannedSessions} (${report.tutorMinutes} minutes logged)`,
    `Practice: ${report.practiceAttempted} attempted${report.practiceAccuracy == null ? "" : ` at ${report.practiceAccuracy}% accuracy`}`,
    `Open mistakes: ${report.openMistakes}; due retests: ${report.dueRetests}`,
    `Mock evidence: ${report.mockSummary}`,
    `Topic snapshot: ${report.topicSnapshot.map((item) => `${item.topic} ${item.mastery}%`).join("; ")}`,
    "",
    "COACHING SIGNALS",
    ...report.risks.map((risk) => `- ${risk.tone.toUpperCase()}: ${risk.title} - ${risk.action}`),
    "",
    "NEXT PRIORITIES",
    ...report.priorities.map((priority) => `- ${priority}`),
    report.nextWeekFocus ? `Next week: ${report.nextWeekFocus}` : "Final week complete.",
    "",
    "Prepared for Hamad Al Sagheer by Mohamed Ali, CFA",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createWeeklyReportHtml(report: WeeklyReport): string {
  const riskRows = report.risks.map((risk) =>
    `<li class="${risk.tone}"><strong>${escapeHtml(risk.title)}</strong><span>${escapeHtml(risk.detail)}</span><em>${escapeHtml(risk.action)}</em></li>`,
  ).join("");
  const priorities = report.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Hamad CFA Mastery Week ${report.week} Report</title><style>
  @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#102945;margin:0;font-size:11px}header{background:#09233d;color:white;padding:22px;border-radius:10px}header small{color:#1bc5bd;text-transform:uppercase;letter-spacing:1.5px;font-weight:700}h1{margin:7px 0 3px;font-size:25px}header p{margin:0;color:#d9e6ef}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.metric{border:1px solid #cfdae5;border-radius:8px;padding:11px}.metric strong{font-size:22px;display:block}.metric span{color:#61758b}.section{margin-top:14px}h2{font-size:14px;border-bottom:2px solid #1bc5bd;padding-bottom:5px}.signals{list-style:none;padding:0}.signals li{border-left:5px solid #53a879;background:#eff8f2;margin:6px 0;padding:8px}.signals li.amber{border-color:#e4ad3a;background:#fff7e6}.signals li.red{border-color:#c95252;background:#fff0f0}.signals span,.signals em{display:block;margin-top:3px}.signals em{font-style:normal;color:#43586e}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}footer{margin-top:20px;border-top:1px solid #cfdae5;padding-top:8px;color:#61758b}</style></head><body>
  <header><small>HAMAD CFA MASTERY - WEEK ${String(report.week).padStart(2, "0")}</small><h1>${escapeHtml(report.focus)}</h1><p>${escapeHtml(report.period)}</p></header>
  <section class="grid"><div class="metric"><strong>${report.completionPercent}%</strong><span>execution</span></div><div class="metric"><strong>${report.sessionsCompleted}/${report.plannedSessions}</strong><span>sessions</span></div><div class="metric"><strong>${report.practiceAccuracy == null ? "-" : `${report.practiceAccuracy}%`}</strong><span>${report.practiceAttempted} questions</span></div><div class="metric"><strong>${report.openMistakes}</strong><span>open mistakes</span></div></section>
  <div class="two"><section class="section"><h2>Evidence summary</h2><p><strong>Tutor time:</strong> ${report.tutorMinutes} minutes</p><p><strong>Practice:</strong> ${report.practiceCorrect}/${report.practiceAttempted || 0} correct</p><p><strong>Mock:</strong> ${escapeHtml(report.mockSummary)}</p><p><strong>Topic snapshot:</strong> ${escapeHtml(report.topicSnapshot.map((item) => `${item.topic} ${item.mastery}%`).join("; "))}</p></section><section class="section"><h2>Next priorities</h2><ol>${priorities}</ol>${report.nextWeekFocus ? `<p><strong>Next week:</strong> ${escapeHtml(report.nextWeekFocus)}</p>` : ""}</section></div>
  <section class="section"><h2>Automatic coaching signals</h2><ul class="signals">${riskRows}</ul></section>
  <footer>Prepared for Hamad Al Sagheer by Mohamed Ali, CFA - Generated ${escapeHtml(formatDate(report.generatedAt))}</footer></body></html>`;
}

export function printWeeklyReport(report: WeeklyReport): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Weekly report printing is available only in a browser.");
  }

  // Render the self-contained report in an isolated, same-origin frame. This
  // avoids popup blockers and keeps the tracker page in place while the browser
  // opens its native print dialog.
  const frame = document.createElement("iframe");
  frame.title = `Hamad CFA Mastery Week ${report.week} printable report`;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(frame);

  const reportWindow = frame.contentWindow;
  const reportDocument = frame.contentDocument ?? reportWindow?.document;
  if (!reportWindow || !reportDocument) {
    frame.remove();
    throw new Error("The browser could not prepare the weekly report.");
  }

  let cleanedUp = false;
  let printStarted = false;
  let fallbackTimer: number | undefined;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    frame.remove();
  };
  const startPrint = () => {
    if (cleanedUp || printStarted) return;
    printStarted = true;
    try {
      reportWindow.focus();
      reportWindow.print();
    } catch {
      cleanup();
    }
  };

  reportWindow.addEventListener("afterprint", cleanup, { once: true });
  fallbackTimer = window.setTimeout(cleanup, 60_000);
  reportDocument.open();
  reportDocument.write(createWeeklyReportHtml(report));
  reportDocument.close();

  // The report has no external assets, so one task is sufficient for the
  // browser to finish parsing the inline markup and print styles.
  window.setTimeout(startPrint, 0);
}
