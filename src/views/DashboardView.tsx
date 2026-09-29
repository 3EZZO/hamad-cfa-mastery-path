// Moved out of App.tsx unchanged (P3.9 split); see git history for origin.
import { Archive, BookOpenCheck, CalendarClock, Check, ChevronDown, ChevronRight, CircleCheckBig, ClipboardCheck, Gauge, GraduationCap, ListChecks, PlayCircle, RotateCcw, ShieldCheck, Sparkles, TimerReset, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Crest } from "../components/Crest";
import { getOverallProgressForState, getPlanTasks, getRequiredTasks, getWeekProgressForState, PLAN, TOPICS } from "../data/plan";
import program from "../data/program.json";
import { daysUntilExam, formatDate, todayDateOnly, TOTAL_WEEKS } from "../lib/dates";
import { buildRiskIndicators } from "../lib/risk";
import { getTaskStatus, isTaskComplete } from "../lib/taskStatus";
import type { PracticeIntent } from "../lib/practiceIntents";
import { buildTodayQueue, todayQueueMinutes, type TodayItem } from "../lib/todayQueue";
import { useTodaySources } from "../hooks/useTodaySources";
import { getPlanPhase, mockCampaignStatus, type PlanPhase } from "../lib/planPhase";
import { PlanRouteGraphic } from "../components/PlanRouteGraphic";
import type { PlanTask, TrackerState } from "../types";
import type { TabId } from "../lib/navigation";
import { EmptyState, EvidenceRow, MetricCard, ProgressBar, TaskChecklist, average, clamp, cx, humanizeTaskDetail, sortByDateDesc, topicShort } from "./shared";

const TODAY_ICONS: Record<TodayItem["kind"], LucideIcon> = {
  overdue: CalendarClock,
  moduleTest: ClipboardCheck,
  retest: Archive,
  review: RotateCcw,
  task: ListChecks,
};

function taskActionLabel(task: PlanTask, tracker: TrackerState, role: "tutor" | "student"): string {
  if (task.kind !== "session") return "Mark complete";
  if (role === "tutor") return "Open Session Mode";
  const status = getTaskStatus(task, tracker);
  return status === "requested"
    ? "Withdraw request"
    : status === "returned"
      ? "Request approval again"
      : "Request tutor approval";
}

const PHASE_KICKER: Record<PlanPhase, string> = {
  pre: "TODAY",
  coverage: "TODAY",
  integration: "INTEGRATION GATE",
  mock: "MOCK CAMPAIGN",
  taper: "TAPER",
  post: "TODAY",
};

function MockCampaignPanel({
  tracker,
  week,
  isStudent,
  onOpenPractice,
  onNavigate,
}: {
  tracker: TrackerState;
  week: number;
  isStudent: boolean;
  onOpenPractice?: (intent: PracticeIntent) => void;
  onNavigate: (tab: TabId, week?: number) => void;
}) {
  const status = mockCampaignStatus(tracker, week);
  const { nextMock, latest, weakSections } = status;
  return (
    <section className="panel phase-panel" aria-labelledby="mock-campaign-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Mock campaign</p>
          <h3 id="mock-campaign-heading">{nextMock ? `Next: ${nextMock.label}` : "All planned mocks recorded"}</h3>
        </div>
        <TrendingUp size={21} />
      </div>
      <div className="phase-panel-grid">
        {nextMock && (
          <div className="phase-stat">
            <span>Target</span>
            <strong>{nextMock.target}%</strong>
            <small>Week {nextMock.week} · {formatDate(nextMock.startDate, { day: "numeric", month: "short" })} – {formatDate(nextMock.endDate, { day: "numeric", month: "short" })}</small>
          </div>
        )}
        <div className="phase-stat">
          <span>Latest mock</span>
          <strong>{latest ? `${latest.score}%` : "—"}</strong>
          <small>{latest ? `${latest.label}${latest.target != null ? ` · target ${latest.target}%` : ""}` : "No full mock recorded yet"}</small>
        </div>
      </div>
      {weakSections.length > 0 && (
        <div className="phase-weak">
          <p>Repair first: {weakSections.map((section) => `${topicShort(section.topic)} ${section.accuracy}%`).join(" · ")}</p>
          {isStudent && onOpenPractice
            ? <button className="button button-secondary" type="button" onClick={() => onOpenPractice("repair")}>Start repair queue <ChevronRight size={16} /></button>
            : <button className="button button-secondary" type="button" onClick={() => onNavigate("mocks")}>Open mock results <ChevronRight size={16} /></button>}
        </div>
      )}
    </section>
  );
}

function TaperPanel({ today }: { today: string }) {
  const remaining = program.administrativeMilestones.filter((milestone) => milestone.date >= today);
  return (
    <section className="panel phase-panel" aria-labelledby="taper-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Exam week</p>
          <h3 id="taper-heading">Light review only — protect the plan</h3>
        </div>
        <ShieldCheck size={21} />
      </div>
      {remaining.length > 0 && (
        <ul className="phase-list">
          {remaining.map((milestone) => (
            <li key={milestone.date}><strong>{formatDate(milestone.date, { day: "numeric", month: "short" })}</strong><span>{milestone.label}</span></li>
          ))}
        </ul>
      )}
      <ul className="outcome-list">
        {program.examDayChecklist.map((item) => <li key={item}><Check size={15} />{item}</li>)}
      </ul>
    </section>
  );
}

function leadHeading(item: TodayItem): string {
  if (item.kind === "overdue") return "Catch up first";
  if (item.kind !== "task" || !item.task) return item.title;
  return item.task.kind === "session" ? item.task.label : item.task.kind === "evidence" ? "Check your progress" : "Your next study task";
}

function leadText(item: TodayItem): string {
  if (item.kind === "overdue") return `${item.title} — ${item.detail}`;
  if (item.kind === "task" && item.task) {
    return item.task.kind === "session" ? humanizeTaskDetail(item.task.detail) : item.task.label;
  }
  return item.detail;
}

export function DashboardView({
  tracker,
  currentWeek,
  rawProgramWeek,
  onToggleTask,
  onNavigate,
  onOpenPractice,
  onOpenModuleTest,
  studentUid = null,
  role,
  loading,
}: {
  tracker: TrackerState;
  currentWeek: number;
  rawProgramWeek: number;
  onToggleTask: (id: string) => void;
  onNavigate: (tab: TabId, week?: number) => void;
  /** Student only: starts a practice intent (e.g. due review). */
  onOpenPractice?: (intent: PracticeIntent) => void;
  /** Student only: opens a module test's start screen. */
  onOpenModuleTest?: (moduleId: string) => void;
  /** Set for the student; enables the device/cloud parts of Today. */
  studentUid?: string | null;
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
  const nextTasks = incompleteTasks.slice(0, 4);
  const programState =
    rawProgramWeek === 0
      ? "Pre-launch"
      : rawProgramWeek > TOTAL_WEEKS
        ? "Mission complete"
        : `Week ${rawProgramWeek} live`;
  const phase = getPlanPhase(rawProgramWeek);
  const sources = useTodaySources(role === "student" ? studentUid : null);
  const todayItems = buildTodayQueue({
    tracker,
    week: rawProgramWeek > TOTAL_WEEKS ? rawProgramWeek : currentWeek,
    today: now,
    dueReviews: sources.dueReviews,
    pendingModuleTests: sources.pendingModuleTests,
  });
  const [lead, ...laterItems] = todayItems;
  const todayTotal = todayQueueMinutes(todayItems);
  const todaySummary = [
    todayTotal.minutes ? `About ${todayTotal.minutes} min of timed work` : "",
    todayTotal.untimed ? `${todayTotal.untimed} plan ${todayTotal.untimed === 1 ? "task" : "tasks"}` : "",
  ].filter(Boolean).join(" · ");
  const isStudent = role === "student";
  const progress = sources.moduleTestProgress;
  const pendingTests = sources.pendingModuleTests ?? [];
  const nextTestDeadline = pendingTests.map((test) => test.deadline).filter((value): value is string => Boolean(value)).sort()[0];
  const testInProgress = pendingTests.some((test) => test.inProgress);
  const testStrip = progress && progress.published
    ? [
      `Module tests: ${progress.completed} of ${progress.published} done`,
      testInProgress ? "one in progress" : "",
      nextTestDeadline ? `next due ${formatDate(nextTestDeadline.slice(0, 10), { weekday: "short", day: "numeric", month: "short" })}` : "",
    ].filter(Boolean).join(" · ")
    : "";
  const leadResumes = lead?.action.type === "moduleTest"
    && pendingTests.some((test) => test.inProgress && lead.action.type === "moduleTest" && test.moduleId === lead.action.moduleId);
  const openItem = (item: TodayItem) => {
    const action = item.action;
    if (action.type === "week") onNavigate("weekly", action.week);
    else if (action.type === "mistakes") onNavigate("errors");
    else if (action.type === "practice") {
      if (isStudent && onOpenPractice) onOpenPractice(action.intent);
      else onNavigate("practice");
    } else if (isStudent && onOpenModuleTest) onOpenModuleTest(action.moduleId);
    else onNavigate("moduleMocks");
  };
  const leadActionLabel = !lead
    ? ""
    : lead.task
      ? taskActionLabel(lead.task, tracker, role)
      : lead.kind === "moduleTest"
        ? isStudent ? leadResumes ? "Resume the test" : "Open the test" : "View module tests"
        : lead.kind === "review"
          ? isStudent ? "Start review" : "Open Practice"
          : "Open Mistake Review";
  const runLead = () => {
    if (!lead) return;
    if (lead.task) onToggleTask(lead.task.id);
    else openItem(lead);
  };

  return (
    <div className="view-stack home-view">
      <section className="today-hero">
        <div className="today-hero-top">
          <Crest size={52} animated className="today-hero__crest" />
          <div className="status-line"><span className="live-dot" />{programState}</div>
          <div className="exam-countdown"><strong>{days}</strong><span>days to exam</span></div>
        </div>
        <div className="today-focus">
          <div className="today-focus-copy">
            <p className="hero-kicker">{PHASE_KICKER[phase]} · WEEK {String(currentWeek).padStart(2, "0")}</p>
            {testStrip && <p className="today-test-strip"><ClipboardCheck size={15} aria-hidden="true" /> {testStrip}</p>}
            {lead ? (
              <>
                <h1>{leadHeading(lead)}</h1>
                <p className={lead.kind === "task" && lead.task?.kind !== "session" ? "hero-task-instruction" : undefined}>{leadText(lead)}</p>
                <div className="hero-actions">
                  <button className="button button-accent" type="button" onClick={runLead}>
                    {lead.task?.kind === "session" && role === "tutor" ? <PlayCircle size={17} /> : lead.task ? <Check size={17} /> : <ChevronRight size={17} />} {leadActionLabel}
                  </button>
                  <button className="button button-dark-ghost" type="button" onClick={() => onNavigate("weekly", lead.action.type === "week" ? lead.action.week : currentWeek)}>
                    View this week <ChevronRight size={17} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1>{rawProgramWeek > TOTAL_WEEKS ? "The plan is complete." : "Nothing else is due today."}</h1>
                <p>Review the evidence, then move forward only with your tutor's direction.</p>
                <button className="button button-accent" type="button" onClick={() => onNavigate("weekly", currentWeek)}>
                  Review the week <ChevronRight size={17} />
                </button>
              </>
            )}
            {laterItems.length > 0 && (
              <ol className="today-queue" aria-label="Also today">
                {laterItems.map((item) => {
                  const Icon = item.task?.kind === "session" ? GraduationCap : TODAY_ICONS[item.kind];
                  return (
                    <li key={item.id}>
                      <button type="button" onClick={() => openItem(item)}>
                        <Icon size={17} aria-hidden="true" />
                        <span className="today-queue-copy"><strong>{item.title}</strong><small>{item.kind === "task" && item.task ? humanizeTaskDetail(item.detail) : item.detail}</small></span>
                        {item.minutes != null && <span className="today-queue-minutes">{item.minutes} min</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {todaySummary && <p className="today-queue-total">{todaySummary}</p>}
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

      {(phase === "integration" || phase === "mock") && (
        <MockCampaignPanel tracker={tracker} week={currentWeek} isStudent={isStudent} onOpenPractice={onOpenPractice} onNavigate={onNavigate} />
      )}
      {phase === "taper" && <TaperPanel today={now} />}

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
