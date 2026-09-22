// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { Archive, BookOpenCheck, CalendarClock, Check, ChevronDown, ChevronRight, CircleCheckBig, Gauge, GraduationCap, ListChecks, PlayCircle, ShieldCheck, Sparkles, TimerReset, TrendingUp } from "lucide-react";
import { getOverallProgressForState, getPlanTasks, getRequiredTasks, getWeekProgressForState, PLAN, TOPICS } from "../data/plan";
import program from "../data/program.json";
import { daysUntilExam, formatDate, todayDateOnly, TOTAL_WEEKS } from "../lib/dates";
import { buildRiskIndicators } from "../lib/risk";
import { getTaskStatus, isTaskComplete } from "../lib/taskStatus";
import { PlanRouteGraphic } from "../components/PlanRouteGraphic";
import type { TrackerState } from "../types";
import type { TabId } from "../lib/navigation";
import { EmptyState, EvidenceRow, MetricCard, ProgressBar, TaskChecklist, average, clamp, cx, humanizeTaskDetail, sortByDateDesc } from "./shared";

export function DashboardView({
  tracker,
  currentWeek,
  rawProgramWeek,
  onToggleTask,
  onNavigate,
  role,
  loading,
}: {
  tracker: TrackerState;
  currentWeek: number;
  rawProgramWeek: number;
  onToggleTask: (id: string) => void;
  onNavigate: (tab: TabId, week?: number) => void;
  role: "tutor" | "student";
  loading?: boolean;
}) {
  const week = PLAN[currentWeek - 1]!;
  const days = daysUntilExam();
  const weekProgress = getWeekProgressForState(week, tracker);
  const overallProgress = getOverallProgressForState(tracker);
  const practiceAttempted = tracker.practiceLogs.reduce(
    (sum, log) => sum + log.attempted,
    0,
  );
  const practiceCorrect = tracker.practiceLogs.reduce(
    (sum, log) => sum + log.correct,
    0,
  );
  const practiceAccuracy = practiceAttempted
    ? Math.round((practiceCorrect / practiceAttempted) * 100)
    : 0;
  const masteryAverage = Math.round(
    average(TOPICS.map((topic) => tracker.topicMastery[topic] ?? 0)),
  );
  const latestMock = sortByDateDesc(tracker.mockScores)[0];
  const mockEvidence = latestMock ? clamp((latestMock.score / 72) * 100) : 0;
  const readiness = Math.round(
    overallProgress * 0.35 +
      masteryAverage * 0.25 +
      practiceAccuracy * 0.2 +
      mockEvidence * 0.2,
  );
  const now = todayDateOnly();
  const risks = buildRiskIndicators(tracker, now);
  const attentionCount = risks.filter(risk => risk.tone !== "green").length;
  const nextMilestone = program.administrativeMilestones.find(
    (milestone) => milestone.date >= now,
  );
  const required = getRequiredTasks(week);
  const incompleteTasks = getPlanTasks(week, tracker.sessionOverrides).filter(
    (task) => !isTaskComplete(task, tracker),
  );
  const nextTask = incompleteTasks[0];
  const nextTasks = incompleteTasks.slice(0, 4);
  const nextTaskStatus = nextTask ? getTaskStatus(nextTask, tracker) : null;
  const nextTaskAction = nextTask?.kind === "session"
    ? role === "tutor"
      ? "Open Session Mode"
      : nextTaskStatus === "requested"
        ? "Withdraw request"
        : nextTaskStatus === "returned"
          ? "Request approval again"
          : "Request tutor approval"
    : "Mark complete";
  const programState =
    rawProgramWeek === 0
      ? "Pre-launch"
      : rawProgramWeek > TOTAL_WEEKS
        ? "Mission complete"
        : `Week ${rawProgramWeek} live`;

  return (
    <div className="view-stack home-view">
      <section className="today-hero">
        <div className="today-hero-top">
          <div className="status-line"><span className="live-dot" />{programState}</div>
          <div className="exam-countdown"><strong>{days}</strong><span>days to exam</span></div>
        </div>
        <div className="today-focus">
          <div className="today-focus-copy">
            <p className="hero-kicker">YOUR NEXT STEP · WEEK {String(currentWeek).padStart(2, "0")}</p>
            {nextTask ? (
              <>
                <h1>{nextTask.kind === "session" ? nextTask.label : nextTask.kind === "evidence" ? "Check your progress" : "Your next study task"}</h1>
                <p className={nextTask.kind === "session" ? undefined : "hero-task-instruction"}>{nextTask.kind === "session" ? humanizeTaskDetail(nextTask.detail) : nextTask.label}</p>
                <div className="hero-actions">
                  <button className="button button-accent" type="button" onClick={() => onToggleTask(nextTask.id)}>
                    {nextTask.kind === "session" && role === "tutor" ? <PlayCircle size={17} /> : <Check size={17} />} {nextTaskAction}
                  </button>
                  <button className="button button-dark-ghost" type="button" onClick={() => onNavigate("weekly", currentWeek)}>
                    View this week <ChevronRight size={17} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1>This week is complete.</h1>
                <p>Review the evidence, then move forward only with your tutor's direction.</p>
                <button className="button button-accent" type="button" onClick={() => onNavigate("weekly", currentWeek)}>
                  Review the week <ChevronRight size={17} />
                </button>
              </>
            )}
          </div>
          <aside className="week-snapshot">
            <div className="week-snapshot-header">
              <span>This week: {weekProgress}%</span>
              <p>{required.filter((task) => isTaskComplete(task, tracker)).length} of {required.length} required items complete</p>
            </div>
            <PlanRouteGraphic
              nodes={PLAN.map((w) => ({
                id: `week-${w.week}`,
                isPast: w.week < currentWeek,
                isCurrent: w.week === currentWeek,
                isComplete: getWeekProgressForState(w, tracker) === 100,
              }))}
            />
            <small>{formatDate(week.startDate, { day: "numeric", month: "short" })} — {formatDate(week.endDate, { day: "numeric", month: "short" })}</small>
          </aside>
        </div>
        <div className="quick-actions" aria-label="Quick actions">
          <span>Keep moving</span>
          <button type="button" onClick={() => onNavigate("practice")}><TimerReset size={16} /> Log practice</button>
          <button type="button" onClick={() => onNavigate("sessions")}><GraduationCap size={16} /> Session notes</button>
          <button type="button" onClick={() => onNavigate("errors")}><Archive size={16} /> Review mistakes</button>
        </div>
      </section>

      <section className="metric-grid home-metrics" aria-label="Progress at a glance">
        <MetricCard
          icon={ListChecks}
          label="Plan complete"
          value={`${overallProgress}%`}
          detail="Required work"
          progress={overallProgress}
          loading={loading}
        />
        <MetricCard
          icon={BookOpenCheck}
          label="Practice accuracy"
          value={practiceAttempted ? `${practiceAccuracy}%` : "—"}
          detail={`${practiceAttempted.toLocaleString()} attempts logged`}
          progress={practiceAccuracy}
          loading={loading}
        />
        <MetricCard
          icon={Gauge}
          label="Topic progress"
          value={masteryAverage ? `${masteryAverage}%` : "—"}
          detail="Ten-topic evidence average"
          progress={masteryAverage}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Latest mock"
          value={latestMock ? `${latestMock.score}%` : "—"}
          detail={latestMock ? latestMock.label : "No full mock recorded yet"}
          progress={latestMock?.score ?? 0}
          loading={loading}
        />
      </section>

      <details className="panel risk-panel" aria-label="Automatic coaching signals">
        <summary className="risk-summary">
          <span className="risk-summary-icon"><ShieldCheck size={21} /></span>
          <span><strong>Progress check</strong><small>{attentionCount ? `${attentionCount} ${attentionCount === 1 ? "area" : "areas"} to review · Open your coaching signals` : "All areas on track · View coaching signals"}</small></span>
          <span className="risk-summary-signals" aria-hidden="true">{risks.map((risk) => <i className={`risk-dot-${risk.tone}`} key={risk.id} />)}</span>
          <ChevronDown size={17} />
        </summary>
        <div className="risk-grid">
          {risks.map((risk) => (
            <article className={cx("risk-card", `risk-${risk.tone}`)} key={risk.id}>
              <span>{risk.tone === "green" ? "On track" : risk.tone === "red" ? "Act now" : "Watch"}</span>
              <strong>{risk.title}</strong>
              <p>{risk.detail}</p>
              <small>{risk.action}</small>
            </article>
          ))}
        </div>
      </details>

      <section className="home-main-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Coming up</p>
              <h3>{week.focus}</h3>
            </div>
            <span className="week-chip">{required.filter((task) => isTaskComplete(task, tracker)).length}/{required.length}</span>
          </div>
          <ProgressBar value={weekProgress} />
          {nextTasks.length ? (
            <TaskChecklist
              tasks={nextTasks}
              tracker={tracker}
              role={role}
              onToggle={onToggleTask}
              compact
            />
          ) : (
            <EmptyState icon={CircleCheckBig} title="Week closed">
              Every planned task, including optional work, is checked.
            </EmptyState>
          )}
          <button className="text-button" type="button" onClick={() => onNavigate("weekly", currentWeek)}>
            Open the full week <ChevronRight size={15} />
          </button>
        </article>
        <div className="home-side-stack">
          <article className="panel milestone-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Next important date</p><h3>{nextMilestone?.label ?? "All dates cleared"}</h3></div>
              <CalendarClock size={21} />
            </div>
            {nextMilestone && (
              <div className="milestone-card">
                <div className="milestone-date"><strong>{formatDate(nextMilestone.date, { day: "2-digit" })}</strong><span>{formatDate(nextMilestone.date, { month: "short" }).toUpperCase()}</span></div>
                <div><p>{nextMilestone.action}</p><small>{formatDate(nextMilestone.date)}</small></div>
              </div>
            )}
          </article>

          <details className="panel readiness-disclosure">
            <summary>
              <div><p className="eyebrow">Evidence index</p><h3>Readiness details</h3></div>
              <div className="readiness-summary"><strong>{readiness}</strong><span>/ 100</span><ChevronRight size={17} /></div>
            </summary>
            <div className="evidence-bars">
              <EvidenceRow label="Execution" value={overallProgress} />
              <EvidenceRow label="Mastery" value={masteryAverage} />
              <EvidenceRow label="Practice" value={practiceAccuracy} />
              <EvidenceRow label="Mocks" value={Math.round(mockEvidence)} />
            </div>
            <p className="fine-print">Coaching indicator only—not a pass prediction.</p>
          </details>
        </div>
      </section>

      <section className="principle-strip">
        <Sparkles size={19} />
        <div><strong>Every mistake must pay rent.</strong><span>Record the pattern, correction rule, and retest.</span></div>
        <button className="text-button" type="button" onClick={() => onNavigate("errors")}>Review mistakes <ChevronRight size={15} /></button>
      </section>
    </div>
  );
}
