import {
  Archive,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  CloudOff,
  Download,
  FileText,
  Flag,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getOverallProgress,
  getPlanTasks,
  getRequiredTasks,
  getWeekProgress,
  PHASES,
  PLAN,
  TOPICS,
} from "./data/plan";
import program from "./data/program.json";
import {
  ASSIGNED_SESSION_COUNT,
  CANONICAL_ASSIGNMENT_COUNT,
  CANONICAL_READING_COUNT,
  READING_CATALOG,
  READING_INDEX,
  RAW_ASSIGNMENT_COUNT,
  RAW_READING_COUNT,
  resolveReadingIds,
  shortSourceLabel,
} from "./data/readings";
import {
  daysUntilExam,
  formatDate,
  getProgramWeek,
  parseDateOnly,
  todayDateOnly,
  TOTAL_WEEKS,
} from "./lib/dates";
import {
  downloadBackup,
  loadState,
  readBackup,
  saveState,
} from "./lib/storage";
import type {
  ErrorEntry,
  MockScore,
  NoteEntry,
  PlanTask,
  PlanSession,
  PlanWeek,
  PracticeLog,
  SessionLog,
  TrackerState,
} from "./types";

type TabId =
  | "dashboard"
  | "roadmap"
  | "weekly"
  | "sessions"
  | "practice"
  | "mastery"
  | "mocks"
  | "errors"
  | "notes";

type UpdateTracker = (
  recipe: (current: TrackerState) => TrackerState,
) => void;

type Notify = (message: string, tone?: "success" | "warning") => void;

interface NavItem {
  id: TabId;
  label: string;
  mobileLabel: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Command Center",
    mobileLabel: "Home",
    icon: LayoutDashboard,
  },
  { id: "roadmap", label: "29-Week Roadmap", mobileLabel: "Roadmap", icon: CalendarDays },
  { id: "weekly", label: "Weekly Execution", mobileLabel: "Week", icon: ListChecks },
  { id: "sessions", label: "Tutor Sessions", mobileLabel: "Sessions", icon: GraduationCap },
  { id: "practice", label: "Practice Log", mobileLabel: "Practice", icon: TimerReset },
  { id: "mastery", label: "Topic Mastery", mobileLabel: "Mastery", icon: Gauge },
  { id: "mocks", label: "Mock Campaign", mobileLabel: "Mocks", icon: TrendingUp },
  { id: "errors", label: "Error Vault", mobileLabel: "Errors", icon: Archive },
  { id: "notes", label: "Notes & Backup", mobileLabel: "Notes", icon: NotebookPen },
];

const TAB_COPY: Record<TabId, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: "Live evidence",
    title: "Command Center",
    description: "The next right action, backed by the work already done.",
  },
  roadmap: {
    eyebrow: "August 2026 — February 2027",
    title: "The 29-Week Roadmap",
    description: "A complete rebuild, integration cycle, mock campaign, and deliberate taper.",
  },
  weekly: {
    eyebrow: "Execution over intention",
    title: "Weekly Control Room",
    description: "Close each required loop and preserve the evidence.",
  },
  sessions: {
    eyebrow: "Tutor accountability",
    title: "Session Log",
    description: "Record what changed, not merely what was covered.",
  },
  practice: {
    eyebrow: "Volume with feedback",
    title: "Practice Log",
    description: "Track attempts, accuracy, sources, and the lesson from every block.",
  },
  mastery: {
    eyebrow: "Honest topic evidence",
    title: "Mastery Board",
    description: "A living view of confidence supported by results—not feeling.",
  },
  mocks: {
    eyebrow: "Performance under conditions",
    title: "Mock Campaign",
    description: "Trend the score, then investigate what produced it.",
  },
  errors: {
    eyebrow: "Mistakes become assets",
    title: "Error Vault",
    description: "Capture the pattern and correction rule without storing copyrighted question text.",
  },
  notes: {
    eyebrow: "Reflection and continuity",
    title: "Notes & Backup",
    description: "Keep tutor decisions, commitments, and browser-local backups in one place.",
  },
};

const ERROR_CATEGORIES = [
  "Concept gap",
  "Formula / process",
  "Reading error",
  "Time pressure",
  "Guessing discipline",
  "Confidence error",
];

const NOTE_CATEGORIES = [
  "Tutor note",
  "Weekly reflection",
  "Commitment",
  "Resource link",
  "Exam logistics",
];

const MockScoreChart = lazy(() => import("./components/MockScoreChart"));

const PLANNED_SESSIONS = PLAN.flatMap((week) =>
  [week.session1, week.session2, week.session3].map((session) => ({
    week,
    session,
  })),
);

function missingSourceForSession(number: number): string | null {
  if (number >= 16 && number <= 18) {
    return "2027 LES Corporate Issuers source not attached";
  }
  if (number >= 34 && number <= 39) {
    return "2027 LES Fixed Income source not attached";
  }
  if (number >= 40 && number <= 42) {
    return "2027 LES Derivatives source not attached";
  }
  return null;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function makeId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function topicShort(topic: string): string {
  const labels: Record<string, string> = {
    "Ethical and Professional Standards": "Ethics",
    "Quantitative Methods": "Quant",
    Economics: "Economics",
    "Financial Statement Analysis": "FSA",
    "Corporate Issuers": "Corporate",
    "Equity Investments": "Equity",
    "Fixed Income": "Fixed Income",
    Derivatives: "Derivatives",
    "Alternative Investments": "Alternatives",
    "Portfolio Management": "Portfolio",
  };
  return labels[topic] ?? topic;
}

function phaseShort(phase: string): string {
  return phase.replace(/^Phase \d+ · /, "");
}

function sortByDateDesc<T extends { date: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

function masteryBand(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "Ready", tone: "positive" };
  if (score >= 65) return { label: "Building", tone: "gold" };
  if (score > 0) return { label: "Repair", tone: "danger" };
  return { label: "Unrated", tone: "muted" };
}

function ProgressBar({ value, tone = "gold" }: { value: number; tone?: string }) {
  return (
    <div className="progress-track" aria-label={`${Math.round(value)} percent`}>
      <span
        className={cx("progress-fill", `progress-${tone}`)}
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function PageHeading({ tab }: { tab: TabId }) {
  const copy = TAB_COPY[tab];
  return (
    <header className="page-heading">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
    </header>
  );
}

function TaskChecklist({
  tasks,
  completions,
  onToggle,
  compact = false,
}: {
  tasks: PlanTask[];
  completions: Record<string, boolean>;
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cx("task-list", compact && "task-list-compact")}>
      {tasks.map((task) => {
        const complete = Boolean(completions[task.id]);
        return (
          <label className={cx("task-row", complete && "is-complete")} key={task.id}>
            <input
              type="checkbox"
              checked={complete}
              onChange={() => onToggle(task.id)}
            />
            <span className="task-check" aria-hidden="true">
              {complete && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="task-copy">
              <span className="task-label">{task.label}</span>
              <span className="task-detail">
                {task.detail}
                {task.optional && <em>Optional</em>}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ReadingCoverage({
  week,
  session,
}: {
  week: PlanWeek;
  session: PlanSession;
}) {
  const readings = resolveReadingIds(session.readings);
  const missingSource = missingSourceForSession(session.number);

  if (readings.length) {
    return (
      <div className="reading-coverage">
        <span><BookOpenCheck size={14} /> Reading coverage</span>
        <ul>
          {readings.map((reading) => {
            const primary = reading.primaryEquivalent
              ? READING_INDEX.get(reading.primaryEquivalent)
              : undefined;
            return (
              <li key={reading.id}>
                <div className="reading-title-row">
                  <strong>{reading.title}</strong>
                  <span className={cx("reading-status", `reading-status-${reading.curriculumStatus}`)}>
                    {reading.curriculumStatus}
                  </span>
                </div>
                <small>{shortSourceLabel(reading.source)} · {reading.pageRange}</small>
                {primary && (
                  <small className="reading-equivalent">
                    Duplicate of {shortSourceLabel(primary.source)} · {primary.title}
                  </small>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className={cx("reading-pending", missingSource ? "reading-missing" : "reading-no-new")}>
      <BookOpenCheck size={14} />
      <span>
        {missingSource ??
          (session.number <= 3
            ? "No scheduled reading · diagnostic and learning-system session"
            : "No new reading · integration, mock, repair, or taper session")}
      </span>
    </div>
  );
}

function App() {
  const rawProgramWeek = getProgramWeek();
  const initialWeek = rawProgramWeek < 1 ? 1 : Math.min(rawProgramWeek, TOTAL_WEEKS);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);
  const [tracker, setTracker] = useState<TrackerState>(() => loadState());
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "warning";
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveState(tracker);
  }, [tracker]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updateTracker: UpdateTracker = (recipe) => {
    setTracker((current) => ({
      ...recipe(current),
      updatedAt: new Date().toISOString(),
    }));
  };

  const notify: Notify = (message, tone = "success") => {
    setToast({ message, tone });
  };

  const navigate = (tab: TabId, week?: number) => {
    if (week) setSelectedWeek(week);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleExport = () => {
    downloadBackup(tracker);
    notify("JSON backup downloaded.");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await readBackup(file);
      const approved = window.confirm(
        "Importing this backup will replace the progress stored in this browser. Continue?",
      );
      if (!approved) return;
      setTracker(imported);
      notify("Backup imported into this browser.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to import this backup.",
        "warning",
      );
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const toggleTask = (id: string) => {
    updateTracker((current) => ({
      ...current,
      taskCompletions: {
        ...current.taskCompletions,
        [id]: !current.taskCompletions[id],
      },
    }));
  };

  const renderView = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardView
            tracker={tracker}
            currentWeek={initialWeek}
            rawProgramWeek={rawProgramWeek}
            onToggleTask={toggleTask}
            onNavigate={navigate}
          />
        );
      case "roadmap":
        return (
          <RoadmapView
            tracker={tracker}
            currentWeek={initialWeek}
            onNavigate={navigate}
          />
        );
      case "weekly":
        return (
          <WeeklyView
            tracker={tracker}
            selectedWeek={selectedWeek}
            setSelectedWeek={setSelectedWeek}
            onToggleTask={toggleTask}
          />
        );
      case "sessions":
        return (
          <SessionLogView
            tracker={tracker}
            currentWeek={initialWeek}
            updateTracker={updateTracker}
            notify={notify}
          />
        );
      case "practice":
        return (
          <PracticeLogView
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
          />
        );
      case "mastery":
        return <MasteryView tracker={tracker} updateTracker={updateTracker} />;
      case "mocks":
        return (
          <MockView
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
          />
        );
      case "errors":
        return (
          <ErrorVaultView
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
          />
        );
      case "notes":
        return (
          <NotesView
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
            onExport={handleExport}
            onImport={() => importRef.current?.click()}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><Target size={24} /></span>
          <div>
            <strong>PROJECT 202</strong>
            <span>Hamad's Mastery System</span>
          </div>
        </div>

        <div className="sidebar-exam">
          <span>Exam appointment</span>
          <strong>27 FEB 2027</strong>
          <small>{daysUntilExam()} days to execute</small>
        </div>

        <nav className="sidebar-nav" aria-label="Project sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={cx("nav-button", activeTab === item.id && "is-active")}
                key={item.id}
                onClick={() => navigate(item.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-local">
          <CloudOff size={17} />
          <div>
            <strong>Browser-local data</strong>
            <span>Export a backup regularly.</span>
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark"><Target size={20} /></span>
            <div>
              <strong>PROJECT 202</strong>
              <span>Hamad's CFA Level I Mastery System</span>
            </div>
          </div>
          <div className="topbar-title">
            <span>PROJECT 202</span>
            <strong>Hamad's CFA Level I Mastery System</strong>
          </div>
          <div className="data-actions">
            <button className="button button-ghost" type="button" onClick={handleExport}>
              <Download size={16} />
              <span>Export</span>
            </button>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={16} />
              <span>Import</span>
            </button>
            <input
              className="visually-hidden"
              ref={importRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleImport(event.target.files?.[0])}
            />
          </div>
        </header>

        <nav className="mobile-nav" aria-label="Project sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={cx("mobile-nav-button", activeTab === item.id && "is-active")}
                key={item.id}
                onClick={() => navigate(item.id)}
                type="button"
              >
                <Icon size={17} />
                <span>{item.mobileLabel}</span>
              </button>
            );
          })}
        </nav>

        <div className="local-banner" role="note">
          <CloudOff size={17} />
          <p>
            <strong>Progress is saved only in this browser.</strong> It does not sync
            automatically to another phone or computer. Export a JSON backup regularly.
          </p>
        </div>

        <div className="page-shell">
          <PageHeading tab={activeTab} />
          {renderView()}
        </div>
      </main>

      {toast && (
        <div className={cx("toast", toast.tone === "warning" && "toast-warning")} role="status">
          {toast.tone === "success" ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function DashboardView({
  tracker,
  currentWeek,
  rawProgramWeek,
  onToggleTask,
  onNavigate,
}: {
  tracker: TrackerState;
  currentWeek: number;
  rawProgramWeek: number;
  onToggleTask: (id: string) => void;
  onNavigate: (tab: TabId, week?: number) => void;
}) {
  const week = PLAN[currentWeek - 1]!;
  const days = daysUntilExam();
  const weekProgress = getWeekProgress(week, tracker.taskCompletions);
  const overallProgress = getOverallProgress(tracker.taskCompletions);
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
  const nextMilestone = program.administrativeMilestones.find(
    (milestone) => milestone.date >= now,
  );
  const required = getRequiredTasks(week);
  const nextTasks = getPlanTasks(week)
    .filter((task) => !tracker.taskCompletions[task.id])
    .slice(0, 5);
  const programState =
    rawProgramWeek === 0
      ? "Pre-launch"
      : rawProgramWeek > TOTAL_WEEKS
        ? "Mission complete"
        : `Week ${rawProgramWeek} live`;

  return (
    <div className="view-stack">
      <section className="command-hero">
        <div className="command-copy">
          <div className="status-line">
            <span className="live-dot" />
            {programState}
          </div>
          <p className="hero-kicker">WEEK {String(currentWeek).padStart(2, "0")} · {phaseShort(week.phase)}</p>
          <h2>{week.focus}</h2>
          <p>{week.outcomes[0]}</p>
          <div className="hero-actions">
            <button className="button button-primary" type="button" onClick={() => onNavigate("weekly", currentWeek)}>
              Open this week <ChevronRight size={17} />
            </button>
            <span>{formatDate(week.startDate, { day: "numeric", month: "short" })} — {formatDate(week.endDate, { day: "numeric", month: "short" })}</span>
          </div>
        </div>
        <div className="countdown-block">
          <span>Exam countdown</span>
          <strong>{days}</strong>
          <small>days to 27 February</small>
          <div className="countdown-rule" />
          <p>Appointment falls inside the 22–28 February 2027 exam window.</p>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          icon={ListChecks}
          label="Program execution"
          value={`${overallProgress}%`}
          detail="Required tasks closed"
          progress={overallProgress}
        />
        <MetricCard
          icon={BookOpenCheck}
          label="Practice accuracy"
          value={practiceAttempted ? `${practiceAccuracy}%` : "—"}
          detail={`${practiceAttempted.toLocaleString()} attempts logged`}
          progress={practiceAccuracy}
        />
        <MetricCard
          icon={Gauge}
          label="Topic mastery"
          value={masteryAverage ? `${masteryAverage}%` : "—"}
          detail="Ten-topic evidence average"
          progress={masteryAverage}
        />
        <MetricCard
          icon={TrendingUp}
          label="Latest mock"
          value={latestMock ? `${latestMock.score}%` : "—"}
          detail={latestMock ? latestMock.label : "No full mock recorded yet"}
          progress={latestMock?.score ?? 0}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">This week</p>
              <h3>{weekProgress}% of required work closed</h3>
            </div>
            <span className="week-chip">{required.filter((task) => tracker.taskCompletions[task.id]).length}/{required.length}</span>
          </div>
          <ProgressBar value={weekProgress} />
          {nextTasks.length ? (
            <TaskChecklist
              tasks={nextTasks}
              completions={tracker.taskCompletions}
              onToggle={onToggleTask}
              compact
            />
          ) : (
            <EmptyState icon={CircleCheckBig} title="Week closed">
              Every planned task, including optional work, is checked.
            </EmptyState>
          )}
          <button className="text-button" type="button" onClick={() => onNavigate("weekly", currentWeek)}>
            See all weekly tasks <ChevronRight size={15} />
          </button>
        </article>

        <article className="panel readiness-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Evidence index</p>
              <h3>Readiness signal</h3>
            </div>
            <ShieldCheck size={21} />
          </div>
          <div className="readiness-core">
            <div
              className="readiness-ring"
              style={{ "--readiness": `${readiness * 3.6}deg` } as React.CSSProperties}
            >
              <div><strong>{readiness}</strong><span>/ 100</span></div>
            </div>
            <p>Execution, mastery, practice accuracy, and mock evidence combined.</p>
          </div>
          <div className="evidence-bars">
            <EvidenceRow label="Execution" value={overallProgress} />
            <EvidenceRow label="Mastery" value={masteryAverage} />
            <EvidenceRow label="Practice" value={practiceAccuracy} />
            <EvidenceRow label="Mocks" value={Math.round(mockEvidence)} />
          </div>
          <p className="fine-print">Coaching indicator only—not a pass prediction.</p>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Next control point</p>
              <h3>{nextMilestone?.label ?? "All milestones passed"}</h3>
            </div>
            <CalendarClock size={21} />
          </div>
          {nextMilestone ? (
            <div className="milestone-card">
              <div className="milestone-date">
                <strong>{formatDate(nextMilestone.date, { day: "2-digit" })}</strong>
                <span>{formatDate(nextMilestone.date, { month: "short" }).toUpperCase()}</span>
              </div>
              <div>
                <p>{nextMilestone.action}</p>
                <small>{formatDate(nextMilestone.date)}</small>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel principle-panel">
          <Sparkles size={21} />
          <p className="eyebrow">Project 202 principle</p>
          <blockquote>“Every mistake must pay rent.”</blockquote>
          <span>A miss is not closed until its pattern, correction rule, and retest are recorded.</span>
          <button className="text-button" type="button" onClick={() => onNavigate("errors")}>
            Open the error vault <ChevronRight size={15} />
          </button>
        </article>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  progress: number;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span>{label}</span><Icon size={18} /></div>
      <strong>{value}</strong>
      <p>{detail}</p>
      <ProgressBar value={progress} />
    </article>
  );
}

function EvidenceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="evidence-row">
      <span>{label}</span>
      <ProgressBar value={value} />
      <strong>{value}%</strong>
    </div>
  );
}

function RoadmapView({
  tracker,
  currentWeek,
  onNavigate,
}: {
  tracker: TrackerState;
  currentWeek: number;
  onNavigate: (tab: TabId, week?: number) => void;
}) {
  const [phase, setPhase] = useState("All phases");
  const visibleWeeks = phase === "All phases" ? PLAN : PLAN.filter((week) => week.phase === phase);
  const totalQuestions = PLAN.reduce((sum, week) => sum + week.questionTarget, 0);
  const plannedSessions = PLAN.flatMap((week) => [week.session1, week.session2, week.session3]);
  const requiredSessions = plannedSessions.filter((session) => session.requirement === "required").length;
  const flexSessions = plannedSessions.length - requiredSessions;

  return (
    <div className="view-stack">
      <section className="roadmap-summary panel">
        <div><strong>29</strong><span>structured weeks</span></div>
        <div><strong>{requiredSessions}</strong><span>required tutor sessions</span></div>
        <div><strong>{flexSessions}</strong><span>optional flex sessions</span></div>
        <div><strong>{totalQuestions.toLocaleString()}</strong><span>practice target</span></div>
      </section>

      <div className="reading-audit-banner">
        <BookOpenCheck size={18} />
        <p>
          <strong>Attached-source crosswalk complete; curriculum coverage incomplete.</strong>{" "}
          {RAW_READING_COUNT} raw / {CANONICAL_READING_COUNT} canonical readings; {RAW_ASSIGNMENT_COUNT} raw / {CANONICAL_ASSIGNMENT_COUNT} canonical assignments; {ASSIGNED_SESSION_COUNT}/87 sessions carry attached readings. Corporate Issuers Sessions 16–18, Fixed Income Sessions 34–39, and Derivatives Sessions 40–42 still require unattached 2027 LES sources. {READING_CATALOG.pageRangeBasis}
        </p>
      </div>

      <div className="filter-row">
        <label>
          <span>Show phase</span>
          <select value={phase} onChange={(event) => setPhase(event.target.value)}>
            <option>All phases</option>
            {PHASES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <p>Click any week to open the full coaching contract.</p>
      </div>

      <section className="timeline">
        {visibleWeeks.map((week) => {
          const progress = getWeekProgress(week, tracker.taskCompletions);
          return (
            <details className={cx("timeline-week", week.week === currentWeek && "is-current")} key={week.week} open={week.week === currentWeek}>
              <summary>
                <span className="timeline-index">{String(week.week).padStart(2, "0")}</span>
                <span className="timeline-summary-copy">
                  <small>{phaseShort(week.phase)} · {formatDate(week.startDate, { day: "numeric", month: "short" })}–{formatDate(week.endDate, { day: "numeric", month: "short" })}</small>
                  <strong>{week.focus}</strong>
                  <span>{week.topics.join(" · ")}</span>
                </span>
                <span className="timeline-progress"><strong>{progress}%</strong><ProgressBar value={progress} /></span>
                <span className="summary-chevron"><ChevronRight size={18} /></span>
              </summary>
              <div className="timeline-body">
                <div className="roadmap-columns">
                  <div>
                    <p className="mini-label">Week outcomes</p>
                    <ul className="outcome-list">
                      {week.outcomes.map((outcome) => <li key={outcome}><Check size={15} />{outcome}</li>)}
                    </ul>
                  </div>
                  <div className="evidence-contract">
                    <p className="mini-label">Evidence contract</p>
                    <div><span>Practice</span><strong>{week.questionTarget} questions</strong></div>
                    <div><span>Mastery gate</span><p>{week.masteryGate}</p></div>
                    {week.mockMilestone && <div><span>{week.mockMilestone.label}</span><p>{week.mockMilestone.instruction}</p></div>}
                  </div>
                </div>
                <div className="session-plan-grid">
                  {[week.session1, week.session2, week.session3].map((session) => (
                    <article key={session.title} className={cx("session-plan-card", session.requirement === "flex" && "is-optional")}>
                      <div><span>Session {String(session.number).padStart(2, "0")} · {session.requirement === "flex" ? "Flex" : "Required"}</span><strong>{session.durationMinutes} min</strong></div>
                      <h4>{session.title}</h4>
                      <p>{session.objective}</p>
                      <ReadingCoverage week={week} session={session} />
                    </article>
                  ))}
                </div>
                <button className="button button-secondary" type="button" onClick={() => onNavigate("weekly", week.week)}>
                  Open Week {week.week} checklist <ChevronRight size={16} />
                </button>
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}

function WeeklyView({
  tracker,
  selectedWeek,
  setSelectedWeek,
  onToggleTask,
}: {
  tracker: TrackerState;
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
  onToggleTask: (id: string) => void;
}) {
  const week = PLAN[selectedWeek - 1]!;
  const tasks = getPlanTasks(week);
  const required = tasks.filter((task) => !task.optional);
  const completed = required.filter((task) => tracker.taskCompletions[task.id]).length;
  const progress = getWeekProgress(week, tracker.taskCompletions);

  return (
    <div className="view-stack">
      <section className="week-selector panel">
        <button className="icon-button" type="button" disabled={selectedWeek === 1} onClick={() => setSelectedWeek(selectedWeek - 1)} aria-label="Previous week"><ChevronLeft size={19} /></button>
        <label>
          <span>Selected week</span>
          <select value={selectedWeek} onChange={(event) => setSelectedWeek(Number(event.target.value))}>
            {PLAN.map((item) => <option value={item.week} key={item.week}>Week {item.week} · {item.focus}</option>)}
          </select>
        </label>
        <button className="icon-button" type="button" disabled={selectedWeek === TOTAL_WEEKS} onClick={() => setSelectedWeek(selectedWeek + 1)} aria-label="Next week"><ChevronRight size={19} /></button>
      </section>

      <section className="week-hero panel">
        <div className="week-number"><span>WEEK</span><strong>{String(week.week).padStart(2, "0")}</strong></div>
        <div className="week-hero-copy">
          <p className="eyebrow">{week.phase}</p>
          <h2>{week.focus}</h2>
          <p>{formatDate(week.startDate)} — {formatDate(week.endDate)}</p>
          <div className="topic-pills">{week.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
        </div>
        <div className="week-score">
          <strong>{progress}%</strong>
          <span>{completed} of {required.length} required</span>
          <ProgressBar value={progress} />
        </div>
      </section>

      <section className="weekly-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div><p className="eyebrow">Execution checklist</p><h3>Close the loops</h3></div>
            <ListChecks size={21} />
          </div>
          <TaskChecklist tasks={tasks} completions={tracker.taskCompletions} onToggle={onToggleTask} />
        </article>

        <div className="weekly-side-stack">
          <article className="panel evidence-contract">
            <p className="eyebrow">Evidence contract</p>
            <div><span>Question target</span><strong>{week.questionTarget}</strong></div>
            <div><span>Mastery gate</span><p>{week.masteryGate}</p></div>
            {week.mockMilestone && <div><span>{week.mockMilestone.label}</span><p>{week.mockMilestone.instruction}</p></div>}
          </article>
          <article className="panel">
            <p className="eyebrow">Week outcomes</p>
            <ul className="outcome-list">
              {week.outcomes.map((outcome) => <li key={outcome}><Check size={15} />{outcome}</li>)}
            </ul>
          </article>
          <article className="panel weekly-readings">
            <p className="eyebrow">Session reading coverage</p>
            {[week.session1, week.session2, week.session3].map((session) => (
              <div key={session.number}>
                <strong>Session {String(session.number).padStart(2, "0")}</strong>
                <ReadingCoverage week={week} session={session} />
              </div>
            ))}
          </article>
        </div>
      </section>
    </div>
  );
}

function SessionLogView({
  tracker,
  currentWeek,
  updateTracker,
  notify,
}: {
  tracker: TrackerState;
  currentWeek: number;
  updateTracker: UpdateTracker;
  notify: Notify;
}) {
  const initialPlannedSession = PLAN[currentWeek - 1]!.session1;
  const [form, setForm] = useState({
    date: todayDateOnly(),
    sessionNumber: initialPlannedSession.number,
    week: currentWeek,
    type: initialPlannedSession.requirement === "flex" ? "Flex" : "Required",
    durationMinutes: initialPlannedSession.durationMinutes,
    focus: "",
    outcome: "",
    nextAction: "",
  });
  const plannedSelection = PLANNED_SESSIONS.find(
    (item) => item.session.number === form.sessionNumber,
  ) ?? PLANNED_SESSIONS[0]!;
  const totalMinutes = tracker.sessionLogs.reduce((sum, log) => sum + log.durationMinutes, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entry: SessionLog = { id: makeId("session"), ...form };
    updateTracker((current) => ({ ...current, sessionLogs: [entry, ...current.sessionLogs] }));
    setForm((current) => ({ ...current, focus: "", outcome: "", nextAction: "" }));
    notify("Tutor session logged.");
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this session log?")) return;
    updateTracker((current) => ({ ...current, sessionLogs: current.sessionLogs.filter((entry) => entry.id !== id) }));
  };

  return (
    <div className="view-stack">
      <section className="mini-metric-grid">
        <MiniMetric label="Sessions logged" value={String(tracker.sessionLogs.length)} icon={GraduationCap} />
        <MiniMetric label="Tutor hours" value={(totalMinutes / 60).toFixed(1)} icon={Clock3} />
        <MiniMetric label="Weeks represented" value={String(new Set(tracker.sessionLogs.map((log) => log.week)).size)} icon={CalendarDays} />
      </section>

      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New evidence</p><h3>Log a tutor session</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Minutes</span><input type="number" min="15" max="240" required value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label>
          </div>
          <label><span>Planned session</span><select value={form.sessionNumber} onChange={(event) => {
            const sessionNumber = Number(event.target.value);
            const selected = PLANNED_SESSIONS.find((item) => item.session.number === sessionNumber)!;
            setForm({
              ...form,
              sessionNumber,
              week: selected.week.week,
              type: selected.session.requirement === "flex" ? "Flex" : "Required",
              durationMinutes: selected.session.durationMinutes,
            });
          }}>{PLANNED_SESSIONS.map(({ week, session }) => <option key={session.number} value={session.number}>Session {String(session.number).padStart(2, "0")} · W{week.week} · {session.title}</option>)}</select></label>
          <ReadingCoverage week={plannedSelection.week} session={plannedSelection.session} />
          <label><span>Focus</span><input required maxLength={120} placeholder="What did this session attack?" value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })} /></label>
          <label><span>What changed?</span><textarea required rows={3} placeholder="The observable breakthrough, decision, or remaining gap." value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value })} /></label>
          <label><span>Next action</span><textarea required rows={2} placeholder="Specific work to complete before the next session." value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Save session</button>
        </form>

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">History</p><h3>Session record</h3></div><FileText size={20} /></div>
          {tracker.sessionLogs.length ? (
            <div className="entry-list">
              {sortByDateDesc(tracker.sessionLogs).map((entry) => (
                <article className="log-entry" key={entry.id}>
                  <div className="log-entry-top"><div><span>{entry.sessionNumber ? `Session ${String(entry.sessionNumber).padStart(2, "0")} · ` : ""}Week {entry.week} · {entry.type}</span><strong>{entry.focus}</strong></div><button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete session"><Trash2 size={15} /></button></div>
                  <p>{entry.outcome}</p>
                  <div className="next-action"><Flag size={15} /><span><strong>Next:</strong> {entry.nextAction}</span></div>
                  <footer>{formatDate(entry.date)} · {entry.durationMinutes} minutes</footer>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={GraduationCap} title="No sessions logged yet">The first entry should record what changed and what happens next.</EmptyState>}
        </section>
      </section>
    </div>
  );
}

function PracticeLogView({
  tracker,
  updateTracker,
  notify,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
}) {
  const [form, setForm] = useState({
    date: todayDateOnly(),
    topic: TOPICS[0] as string,
    attempted: 30,
    correct: 0,
    source: "",
    note: "",
  });
  const [formError, setFormError] = useState("");
  const attempted = tracker.practiceLogs.reduce((sum, log) => sum + log.attempted, 0);
  const correct = tracker.practiceLogs.reduce((sum, log) => sum + log.correct, 0);
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.correct > form.attempted) {
      setFormError("Correct responses cannot exceed attempted responses.");
      return;
    }
    setFormError("");
    const entry: PracticeLog = { id: makeId("practice"), ...form };
    updateTracker((current) => ({ ...current, practiceLogs: [entry, ...current.practiceLogs] }));
    setForm((current) => ({ ...current, attempted: 30, correct: 0, source: "", note: "" }));
    notify("Practice block logged.");
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this practice block?")) return;
    updateTracker((current) => ({ ...current, practiceLogs: current.practiceLogs.filter((entry) => entry.id !== id) }));
  };

  return (
    <div className="view-stack">
      <section className="mini-metric-grid">
        <MiniMetric label="Questions attempted" value={attempted.toLocaleString()} icon={BookOpenCheck} />
        <MiniMetric label="Correct" value={correct.toLocaleString()} icon={CircleCheckBig} />
        <MiniMetric label="Cumulative accuracy" value={attempted ? `${accuracy}%` : "—"} icon={Target} />
      </section>
      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New evidence</p><h3>Log a practice block</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Topic</span><select value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}>{TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
            <label><span>Attempted</span><input type="number" min="1" max="500" required value={form.attempted} onChange={(event) => setForm({ ...form, attempted: Number(event.target.value) })} /></label>
            <label><span>Correct</span><input type="number" min="0" max={form.attempted} required value={form.correct} onChange={(event) => setForm({ ...form, correct: Number(event.target.value) })} /></label>
          </div>
          <label><span>Source label <em>optional</em></span><input maxLength={80} placeholder="e.g. Topic review set A" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
          <label><span>Lesson from the block</span><textarea rows={3} placeholder="Pattern noticed, decision to change, or area to revisit." value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          {formError && <p className="form-error"><CircleAlert size={15} />{formError}</p>}
          <button className="button button-primary" type="submit"><Plus size={16} /> Save practice</button>
        </form>

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">History</p><h3>Practice record</h3></div><BarChart3 size={20} /></div>
          {tracker.practiceLogs.length ? (
            <div className="entry-list">
              {sortByDateDesc(tracker.practiceLogs).map((entry) => {
                const score = Math.round((entry.correct / entry.attempted) * 100);
                return (
                  <article className="practice-entry" key={entry.id}>
                    <div className="practice-score"><strong>{score}%</strong><span>{entry.correct}/{entry.attempted}</span></div>
                    <div className="practice-copy"><span>{topicShort(entry.topic)} · {formatDate(entry.date)}</span><strong>{entry.source || "Practice block"}</strong>{entry.note && <p>{entry.note}</p>}<ProgressBar value={score} tone={score >= 70 ? "green" : "gold"} /></div>
                    <button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete practice block"><Trash2 size={15} /></button>
                  </article>
                );
              })}
            </div>
          ) : <EmptyState icon={BookOpenCheck} title="No practice evidence yet">Log the first block to establish volume and accuracy.</EmptyState>}
        </section>
      </section>
    </div>
  );
}

function MasteryView({ tracker, updateTracker }: { tracker: TrackerState; updateTracker: UpdateTracker }) {
  const masteryAverage = Math.round(average(TOPICS.map((topic) => tracker.topicMastery[topic] ?? 0)));
  const readyTopics = TOPICS.filter((topic) => (tracker.topicMastery[topic] ?? 0) >= 80).length;

  const practiceByTopic = useMemo(() => {
    return Object.fromEntries(
      TOPICS.map((topic) => {
        const logs = tracker.practiceLogs.filter((log) => log.topic === topic);
        const attempted = logs.reduce((sum, log) => sum + log.attempted, 0);
        const correct = logs.reduce((sum, log) => sum + log.correct, 0);
        return [topic, { attempted, accuracy: attempted ? Math.round((correct / attempted) * 100) : 0 }];
      }),
    );
  }, [tracker.practiceLogs]);

  return (
    <div className="view-stack">
      <section className="mastery-overview panel">
        <div><p className="eyebrow">Ten-topic portfolio</p><h2>{masteryAverage || 0}% average mastery</h2><p>Set these levels from recent, timed, reviewed evidence. Confidence alone is not evidence.</p></div>
        <div className="mastery-total"><strong>{readyTopics}</strong><span>topics at 80%+</span></div>
      </section>
      <section className="mastery-grid">
        {TOPICS.map((topic, index) => {
          const score = tracker.topicMastery[topic] ?? 0;
          const band = masteryBand(score);
          const evidence = practiceByTopic[topic]!;
          return (
            <article className="mastery-card" key={topic}>
              <div className="mastery-card-top"><span className="topic-index">{String(index + 1).padStart(2, "0")}</span><span className={cx("status-badge", `status-${band.tone}`)}>{band.label}</span></div>
              <h3>{topic}</h3>
              <div className="mastery-score"><strong>{score}%</strong><span>{evidence.attempted ? `${evidence.accuracy}% across ${evidence.attempted} logged questions` : "No practice linked yet"}</span></div>
              <input
                className="mastery-slider"
                aria-label={`${topic} mastery`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={score}
                style={{ "--slider-fill": `${score}%` } as React.CSSProperties}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  updateTracker((current) => ({ ...current, topicMastery: { ...current.topicMastery, [topic]: value } }));
                }}
              />
              <div className="slider-labels"><span>Repair</span><span>Building</span><span>Ready</span></div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function MockView({
  tracker,
  updateTracker,
  notify,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
}) {
  const [form, setForm] = useState({
    date: todayDateOnly(),
    label: `Mock ${tracker.mockScores.length + 1}`,
    score: 0,
    note: "",
  });
  const fullMockTargets = PLAN.flatMap((week) =>
    week.mockMilestone &&
    week.mockMilestone.targetScore !== null &&
    (week.mockMilestone.label.includes("Full-length") || week.mockMilestone.label.includes("Final full-length"))
      ? [{ week: week.week, ...week.mockMilestone }]
      : [],
  );
  const chronological = [...tracker.mockScores].sort((a, b) => a.date.localeCompare(b.date));
  const chartData = chronological.map((entry, index) => ({
    name: entry.label,
    score: entry.score,
    target: fullMockTargets[index]?.targetScore ?? 72,
  }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entry: MockScore = { id: makeId("mock"), ...form, score: clamp(form.score) };
    updateTracker((current) => ({ ...current, mockScores: [...current.mockScores, entry] }));
    setForm({ date: todayDateOnly(), label: `Mock ${tracker.mockScores.length + 2}`, score: 0, note: "" });
    notify("Mock score logged.");
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this mock score?")) return;
    updateTracker((current) => ({ ...current, mockScores: current.mockScores.filter((entry) => entry.id !== id) }));
  };

  return (
    <div className="view-stack">
      <div className="disclaimer-card"><ShieldCheck size={19} /><p><strong>Internal evidence, not an official pass mark.</strong> {program.readinessDisclaimer}</p></div>
      <section className="mock-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">Trend</p><h3>Mock score trajectory</h3></div><TrendingUp size={21} /></div>
          {chartData.length ? (
            <div className="chart-wrap">
              <Suspense fallback={<div className="chart-loading">Loading score chart…</div>}>
                <MockScoreChart data={chartData} />
              </Suspense>
            </div>
          ) : <EmptyState icon={TrendingUp} title="The curve starts with Mock 1">Scores will appear here with the internal target trajectory.</EmptyState>}
          <p className="chart-note">{program.mockGuidance}</p>
        </article>

        <form className="panel entry-form mock-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New result</p><h3>Log a mock</h3></div><Plus size={20} /></div>
          <label><span>Date</span><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label><span>Label</span><input required maxLength={50} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
          <label><span>Score %</span><input required type="number" min="0" max="100" value={form.score} onChange={(event) => setForm({ ...form, score: Number(event.target.value) })} /></label>
          <label><span>Evidence note</span><textarea rows={3} placeholder="What drove this result?" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Save result</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Campaign ladder</p><h3>Internal targets by rehearsal</h3></div><Flag size={20} /></div>
        <div className="target-ladder">
          {fullMockTargets.map((target, index) => {
            const actual = chronological[index];
            return (
              <article key={target.label} className={cx(actual && "has-result")}>
                <span>W{target.week}</span>
                <strong>{target.targetScore}%</strong>
                <p>{target.label}</p>
                <small>{actual ? `Actual ${actual.score}%` : "Awaiting evidence"}</small>
              </article>
            );
          })}
        </div>
      </section>

      {tracker.mockScores.length > 0 && (
        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">Evidence history</p><h3>Recorded mocks</h3></div><FileText size={20} /></div>
          <div className="entry-list compact-entry-list">
            {sortByDateDesc(tracker.mockScores).map((entry) => (
              <article className="mock-entry" key={entry.id}>
                <div className="mock-score"><strong>{entry.score}%</strong></div>
                <div><span>{formatDate(entry.date)}</span><h4>{entry.label}</h4>{entry.note && <p>{entry.note}</p>}</div>
                <button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete mock"><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ErrorVaultView({
  tracker,
  updateTracker,
  notify,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
}) {
  const [form, setForm] = useState({
    date: todayDateOnly(),
    topic: TOPICS[0] as string,
    category: ERROR_CATEGORIES[0],
    summary: "",
    correction: "",
    revisitDate: "",
  });
  const openCount = tracker.errorEntries.filter((entry) => !entry.resolved).length;
  const dueCount = tracker.errorEntries.filter((entry) => !entry.resolved && entry.revisitDate && entry.revisitDate <= todayDateOnly()).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entry: ErrorEntry = { id: makeId("error"), ...form, resolved: false };
    updateTracker((current) => ({ ...current, errorEntries: [entry, ...current.errorEntries] }));
    setForm((current) => ({ ...current, summary: "", correction: "", revisitDate: "" }));
    notify("Error pattern secured in the vault.");
  };

  const toggleResolved = (id: string) => {
    updateTracker((current) => ({ ...current, errorEntries: current.errorEntries.map((entry) => entry.id === id ? { ...entry, resolved: !entry.resolved } : entry) }));
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this error-vault entry?")) return;
    updateTracker((current) => ({ ...current, errorEntries: current.errorEntries.filter((entry) => entry.id !== id) }));
  };

  const sorted = [...tracker.errorEntries].sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.date.localeCompare(a.date));

  return (
    <div className="view-stack">
      <div className="disclaimer-card"><Archive size={19} /><p><strong>Store the lesson, not the item.</strong> Use an original one-line pattern summary. Do not paste proprietary or copyrighted question content.</p></div>
      <section className="mini-metric-grid">
        <MiniMetric label="Open patterns" value={String(openCount)} icon={CircleAlert} />
        <MiniMetric label="Due for retest" value={String(dueCount)} icon={TimerReset} />
        <MiniMetric label="Resolved" value={String(tracker.errorEntries.length - openCount)} icon={CircleCheckBig} />
      </section>
      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New pattern</p><h3>Secure the lesson</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Topic</span><select value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}>{TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
            <label><span>Error category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{ERROR_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label><span>Retest date <em>optional</em></span><input type="date" value={form.revisitDate} onChange={(event) => setForm({ ...form, revisitDate: event.target.value })} /></label>
          </div>
          <label><span>Pattern summary</span><textarea required rows={3} maxLength={300} placeholder="Original summary only: what reasoning pattern failed?" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
          <label><span>Correction rule</span><textarea required rows={3} maxLength={400} placeholder="When I see ___, I will ___ because ___." value={form.correction} onChange={(event) => setForm({ ...form, correction: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Add to vault</button>
        </form>

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">Review queue</p><h3>Error patterns</h3></div><Archive size={20} /></div>
          {sorted.length ? (
            <div className="entry-list">
              {sorted.map((entry) => (
                <article className={cx("error-entry", entry.resolved && "is-resolved")} key={entry.id}>
                  <div className="error-entry-top"><div><span>{topicShort(entry.topic)} · {entry.category}</span><strong>{entry.summary}</strong></div><div className="entry-actions"><button className="icon-button" type="button" onClick={() => toggleResolved(entry.id)} aria-label={entry.resolved ? "Reopen error" : "Resolve error"}>{entry.resolved ? <Archive size={15} /> : <Check size={15} />}</button><button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete error"><Trash2 size={15} /></button></div></div>
                  <div className="correction-rule"><ShieldCheck size={16} /><p><strong>Correction rule</strong>{entry.correction}</p></div>
                  <footer>{formatDate(entry.date)}{entry.revisitDate && ` · Retest ${formatDate(entry.revisitDate)}`} · {entry.resolved ? "Resolved" : "Open"}</footer>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={Archive} title="The vault is empty">The first reviewed miss should become an original pattern and correction rule.</EmptyState>}
        </section>
      </section>
    </div>
  );
}

function NotesView({
  tracker,
  updateTracker,
  notify,
  onExport,
  onImport,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
  onExport: () => void;
  onImport: () => void;
}) {
  const [form, setForm] = useState({
    date: todayDateOnly(),
    category: NOTE_CATEGORIES[0],
    title: "",
    body: "",
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entry: NoteEntry = { id: makeId("note"), ...form };
    updateTracker((current) => ({ ...current, notes: [entry, ...current.notes] }));
    setForm((current) => ({ ...current, title: "", body: "" }));
    notify("Note saved.");
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this note?")) return;
    updateTracker((current) => ({ ...current, notes: current.notes.filter((entry) => entry.id !== id) }));
  };

  return (
    <div className="view-stack">
      <section className="backup-panel panel">
        <div className="backup-icon"><CloudOff size={25} /></div>
        <div><p className="eyebrow">Data custody</p><h3>This tracker is local to this browser</h3><p>Progress does not automatically appear on another device. Download a JSON backup after each tutor session and import it wherever you need to continue.</p></div>
        <div className="backup-actions"><button className="button button-primary" type="button" onClick={onExport}><Download size={16} /> Export JSON</button><button className="button button-secondary" type="button" onClick={onImport}><Upload size={16} /> Import JSON</button></div>
      </section>

      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New note</p><h3>Capture a decision</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{NOTE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          </div>
          <label><span>Title</span><input required maxLength={100} placeholder="A short, useful heading" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label><span>Note</span><textarea required rows={6} placeholder="Decision, reflection, resource URL, or commitment." value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Save note</button>
        </form>

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">Notebook</p><h3>Project notes</h3></div><NotebookPen size={20} /></div>
          {tracker.notes.length ? (
            <div className="entry-list">
              {sortByDateDesc(tracker.notes).map((entry) => (
                <article className="note-entry" key={entry.id}>
                  <div className="log-entry-top"><div><span>{entry.category} · {formatDate(entry.date)}</span><strong>{entry.title}</strong></div><button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete note"><Trash2 size={15} /></button></div>
                  <p>{entry.body}</p>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={NotebookPen} title="No notes yet">Capture the first decision, commitment, or resource link.</EmptyState>}
        </section>
      </section>
    </div>
  );
}

function MiniMetric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <article className="mini-metric"><span><Icon size={17} /></span><div><strong>{value}</strong><p>{label}</p></div></article>
  );
}

export default App;
