import {
  Archive,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Cloud,
  Clock3,
  Copy,
  Download,
  FileText,
  Flag,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  Menu,
  NotebookPen,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  Upload,
  UserCog,
  WifiOff,
  X,
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
  getOverallProgressForState,
  getPlanTasks,
  getRequiredTasks,
  getWeekSessions,
  getWeekProgressForState,
  PHASES,
  PLAN,
  TOPICS,
} from "./data/plan";
import program from "./data/program.json";
import { READING_CATALOG, resolveReadingIds } from "./data/readings";
import {
  daysUntilExam,
  formatDate,
  getProgramWeek,
  parseDateOnly,
  todayDateOnly,
  TOTAL_WEEKS,
} from "./lib/dates";
import {
  createDefaultState,
  downloadBackup,
  readBackup,
} from "./lib/storage";
import { downloadProject202Calendar } from "./lib/calendarExport";
import { isStateMeaningfullyEmpty } from "./lib/stateMerge";
import { buildRiskIndicators } from "./lib/risk";
import { getTaskStatus, isTaskComplete } from "./lib/taskStatus";
import {
  cascadeReschedule,
  effectiveSessionDate,
  getEffectiveSessions,
  restoreCanonicalSession,
  sessionDayLabel,
} from "./lib/schedule";
import {
  buildWeeklyReport,
  formatWeeklyReportText,
  printWeeklyReport,
} from "./lib/weeklyReport";
import {
  type TrackerSyncStatus,
  useTrackerSync,
} from "./hooks/useTrackerSync";
import CalendarExportDialog from "./components/CalendarExportDialog";
import type { CalendarExportPreferences } from "./lib/calendarExport";
import type {
  ErrorEntry,
  DiagnosticEntry,
  MockScore,
  NoteEntry,
  PlanTask,
  PlanSession,
  PlanWeek,
  PracticeLog,
  PrivateTutorNote,
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
  | "notes"
  | "coach";

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
    label: "Home",
    mobileLabel: "Home",
    icon: LayoutDashboard,
  },
  { id: "roadmap", label: "Study Plan", mobileLabel: "Plan", icon: CalendarDays },
  { id: "weekly", label: "This Week", mobileLabel: "Week", icon: ListChecks },
  { id: "sessions", label: "Session Notes", mobileLabel: "Sessions", icon: GraduationCap },
  { id: "practice", label: "Practice", mobileLabel: "Practice", icon: TimerReset },
  { id: "mastery", label: "Topic Progress", mobileLabel: "Topics", icon: Gauge },
  { id: "mocks", label: "Mock Results", mobileLabel: "Mocks", icon: TrendingUp },
  { id: "errors", label: "Mistake Review", mobileLabel: "Mistakes", icon: Archive },
  { id: "notes", label: "Notes & Data", mobileLabel: "Notes", icon: NotebookPen },
  { id: "coach", label: "Tutor Console", mobileLabel: "Tutor", icon: UserCog },
];

const NAV_GROUPS: Array<{ label: string; ids: TabId[] }> = [
  { label: "Focus", ids: ["dashboard", "weekly"] },
  { label: "Plan", ids: ["roadmap", "sessions"] },
  { label: "Evidence", ids: ["practice", "mastery", "mocks", "errors"] },
  { label: "Records", ids: ["notes"] },
  { label: "Tutor", ids: ["coach"] },
];

const MOBILE_PRIMARY_IDS: TabId[] = [
  "dashboard",
  "weekly",
  "roadmap",
  "practice",
];

const MOBILE_MORE_IDS: TabId[] = [
  "sessions",
  "mastery",
  "mocks",
  "errors",
  "notes",
  "coach",
];

const TAB_COPY: Record<TabId, { eyebrow: string; title: string; description: string }> = {
  dashboard: {
    eyebrow: "Your study workspace",
    title: "Home",
    description: "One clear next step, with the full plan available when you need it.",
  },
  roadmap: {
    eyebrow: "August 2026 — February 2027",
    title: "Study Plan",
    description: `The complete ${TOTAL_WEEKS}-week path from rebuild through exam day.`,
  },
  weekly: {
    eyebrow: "Your current focus",
    title: "This Week",
    description: "Complete the work in order and keep the evidence up to date.",
  },
  sessions: {
    eyebrow: "Tutor accountability",
    title: "Session Notes",
    description: "Record what changed and what must happen next.",
  },
  practice: {
    eyebrow: "Volume with feedback",
    title: "Practice",
    description: "Track volume, accuracy, and the lesson from each question block.",
  },
  mastery: {
    eyebrow: "Honest topic evidence",
    title: "Topic Progress",
    description: "A living view of confidence supported by results—not feeling.",
  },
  mocks: {
    eyebrow: "Performance under conditions",
    title: "Mock Results",
    description: "Trend the score, then investigate what produced it.",
  },
  errors: {
    eyebrow: "Mistakes become assets",
    title: "Mistake Review",
    description: "Turn every recurring mistake into a correction rule and retest.",
  },
  notes: {
    eyebrow: "Reflection and continuity",
    title: "Notes & Data",
    description: "Keep tutor decisions, commitments, live sync, and recovery tools in one place.",
  },
  coach: {
    eyebrow: "Tutor-only administration",
    title: "Tutor Console",
    description: "Run launch checks, manage the baseline, reschedule safely, and protect shared progress.",
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
  "Shared tutor note",
  "Weekly reflection",
  "Commitment",
  "Resource link",
  "Exam logistics",
];

const MockScoreChart = lazy(() => import("./components/MockScoreChart"));

const PLANNED_SESSIONS = PLAN.flatMap((week) =>
  getWeekSessions(week).map((session) => ({
    week,
    session,
  })),
);
const CHECKPOINT_TIME = program.tutoringRhythm.time;

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
  return phase.replace(/^Phase \d+\s*(?:·|\|)\s*/, "");
}

function humanizeTaskDetail(detail: string): string {
  return detail
    .split(" | ")
    .map((part) =>
      /^\d{4}-\d{2}-\d{2}$/.test(part)
        ? formatDate(part, { day: "numeric", month: "short" })
        : part,
    )
    .join(" · ");
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
  tracker,
  role,
  onToggle,
  compact = false,
}: {
  tasks: PlanTask[];
  tracker: TrackerState;
  role: "tutor" | "student";
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cx("task-list", compact && "task-list-compact")}>
      {tasks.map((task) => {
        const status = getTaskStatus(task, tracker);
        const complete = isTaskComplete(task, tracker);
        const statusCopy = task.kind === "session"
          ? status === "approved"
            ? "Tutor approved"
            : status === "requested"
              ? "Awaiting tutor approval"
              : status === "returned"
                ? "Returned for follow-up"
                : role === "student"
                  ? "Request tutor approval"
                  : "Awaiting student request"
          : complete ? "Complete" : "Mark complete";
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
                {humanizeTaskDetail(task.detail)}
                {task.optional && <em>Optional</em>}
                <em className={`task-status task-status-${status}`}>{statusCopy}</em>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ReadingCoverage({
  session,
}: {
  week: PlanWeek;
  session: PlanSession;
}) {
  const readings = resolveReadingIds(session.readings);

  if (readings.length) {
    return (
      <details className="reading-coverage">
        <summary>
          <span><BookOpenCheck size={14} /> {readings.length} assigned {readings.length === 1 ? "module" : "modules"}</span>
          <ChevronRight size={15} />
        </summary>
        <ul>
          {readings.map((reading) => (
            <li key={reading.id}>
              <strong>{reading.title}</strong>
              <small>Official 2027 curriculum module</small>
            </li>
          ))}
        </ul>
      </details>
    );
  }

  return (
    <div className="reading-pending reading-no-new">
      <BookOpenCheck size={14} />
      <span>
        {session.number <= 3
          ? "No assigned module — diagnostic and learning-system session"
          : "No new module — integration, mock, repair, or taper session"}
      </span>
    </div>
  );
}

function syncPresentation(status: TrackerSyncStatus): {
  label: string;
  detail: string;
  tone: string;
  icon: LucideIcon;
} {
  switch (status) {
    case "synced":
      return {
        label: "Synced",
        detail: "Progress is current on every signed-in device.",
        tone: "is-synced",
        icon: CircleCheckBig,
      };
    case "saving":
      return {
        label: "Saving...",
        detail: "Your latest change is being uploaded.",
        tone: "is-saving",
        icon: Cloud,
      };
    case "offline":
      return {
        label: "Offline - changes queued",
        detail: "This device will sync automatically when it reconnects.",
        tone: "is-offline",
        icon: WifiOff,
      };
    case "error":
      return {
        label: "Sync needs attention",
        detail: "Your work is safe on this device. Try syncing again.",
        tone: "is-error",
        icon: CircleAlert,
      };
    case "loading":
    default:
      return {
        label: "Connecting...",
        detail: "Loading the latest shared progress.",
        tone: "is-loading",
        icon: Cloud,
      };
  }
}

function CloudLoadingScreen() {
  return (
    <main className="access-shell">
      <section className="access-card access-card-loading" aria-live="polite">
        <span className="access-mark"><Cloud size={28} /></span>
        <p className="eyebrow">Hamad CFA Mastery</p>
        <h1>Loading the latest progress</h1>
        <p>Connecting this device to Hamad's shared tracker...</p>
        <span className="access-loader" aria-hidden="true" />
      </section>
    </main>
  );
}

function CloudConfigurationScreen({ missingKeys }: { missingKeys: string[] }) {
  return (
    <main className="access-shell">
      <section className="access-card">
        <span className="access-mark"><Cloud size={28} /></span>
        <p className="eyebrow">One-time cloud setup</p>
        <h1>Connect the mastery tracker to Firebase</h1>
        <p>
          Live sync is built into this tracker. Add the Firebase web configuration
          before deploying so progress can load securely on every device.
        </p>
        <div className="access-notice">
          <strong>Configuration still needed</strong>
          <span>{missingKeys.join(", ")}</span>
        </div>
        <p className="access-footnote">
          Follow <strong>DEPLOY_GITHUB_PAGES.md</strong>. No payment method or
          private server key is required.
        </p>
      </section>
    </main>
  );
}

function CloudAccessDeniedScreen({
  email,
  error,
  onSignOut,
}: {
  email: string | null;
  error: string | null;
  onSignOut: () => Promise<void>;
}) {
  return (
    <main className="access-shell">
      <section className="access-card">
        <span className="access-mark access-mark-warning"><ShieldCheck size={28} /></span>
        <p className="eyebrow">Private mastery workspace</p>
        <h1>This account has not been approved</h1>
        <p>{error ?? "Only Hamad and Mohamed can open this shared tracker."}</p>
        {email && <div className="access-notice"><strong>Signed in as</strong><span>{email}</span></div>}
        <button className="button button-primary" type="button" onClick={() => void onSignOut()}>
          <LogOut size={16} /> Use another account
        </button>
      </section>
    </main>
  );
}

function SignInScreen({
  busy,
  error,
  onGoogle,
  onPassword,
}: {
  busy: boolean;
  error: string | null;
  onGoogle: () => Promise<void>;
  onPassword: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onPassword(email.trim(), password);
  };

  return (
    <main className="access-shell">
      <section className="access-card">
        <div className="access-brand">
          <span className="access-mark"><Target size={27} /></span>
          <div>
            <strong>HAMAD CFA MASTERY</strong>
            <span>Level I Mastery Path</span>
          </div>
        </div>
        <p className="eyebrow">Private shared tracker</p>
        <h1>Welcome back</h1>
        <p>
          Sign in as Hamad or Mohamed. The latest progress will appear
          automatically and stay synchronized across devices.
        </p>

        <button
          className="button button-google"
          disabled={busy}
          type="button"
          onClick={() => void onGoogle()}
        >
          <span className="google-mark" aria-hidden="true">G</span>
          Continue with Google
        </button>

        <div className="access-divider"><span>or use your tracker account</span></div>

        <form className="access-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              disabled={busy}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              disabled={busy}
              minLength={6}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="button button-primary" disabled={busy} type="submit">
            <LogIn size={16} /> {busy ? "Signing in..." : "Sign in securely"}
          </button>
        </form>

        {error && <div className="access-error" role="alert"><CircleAlert size={17} /> {error}</div>}
        <p className="access-footnote">
          Access is limited to the tutor and student accounts approved for this
          program. There is no public registration.
        </p>
      </section>
    </main>
  );
}

function App() {
  const rawProgramWeek = getProgramWeek();
  const initialWeek = rawProgramWeek < 1 ? 1 : Math.min(rawProgramWeek, TOTAL_WEEKS);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  const {
    tracker,
    updateTracker,
    cloudConfigured,
    missingConfiguration,
    authReady,
    authBusy,
    authError,
    user,
    memberReady,
    role,
    capabilities,
    accessDenied,
    trackerReady,
    syncStatus,
    syncError,
    signInWithGoogle,
    signInWithPassword,
    signOut,
    replaceTrackerAuthoritatively,
    authoritativeReplaceBusy,
    retrySync,
    privateTutorNotes,
    privateNotesReady,
    privateNotesBusy,
    privateNotesError,
    updatePrivateTutorNotes,
  } = useTrackerSync();
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "warning";
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMoreOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMoreOpen]);

  if (!cloudConfigured) {
    return <CloudConfigurationScreen missingKeys={missingConfiguration} />;
  }

  if (!authReady) {
    return <CloudLoadingScreen />;
  }

  if (!user) {
    return (
      <SignInScreen
        busy={authBusy}
        error={authError}
        onGoogle={signInWithGoogle}
        onPassword={signInWithPassword}
      />
    );
  }

  if (!memberReady) {
    return <CloudLoadingScreen />;
  }

  if (accessDenied) {
    return (
      <CloudAccessDeniedScreen
        email={user.email}
        error={syncError}
        onSignOut={signOut}
      />
    );
  }

  if (!trackerReady) {
    return <CloudLoadingScreen />;
  }

  const syncCopy = syncPresentation(syncStatus);
  const SyncIcon = syncCopy.icon;

  const notify: Notify = (message, tone = "success") => {
    setToast({ message, tone });
  };

  const navigate = (tab: TabId, week?: number) => {
    if (week) setSelectedWeek(week);
    setActiveTab(tab);
    setMobileMoreOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleExport = () => {
    downloadBackup(tracker);
    notify("JSON backup downloaded.");
  };

  const handleCalendarExport = (preferences: CalendarExportPreferences) => {
    downloadProject202Calendar({
      sessionOverrides: tracker.sessionOverrides,
      preferences,
    });
    notify("Calendar import downloaded with Riyadh times and reminders.");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    if (!capabilities.canImportData) {
      notify("Only the tutor can replace shared tracker data.", "warning");
      return;
    }
    try {
      const imported = await readBackup(file);
      const approved = window.confirm(
        "Importing this backup will replace the current shared progress and sync it to every device. Continue?",
      );
      if (!approved) return;
      await replaceTrackerAuthoritatively(imported);
      notify("Backup imported and synchronized authoritatively.");
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
    if (!capabilities.canToggleTasks) return;
    const task = PLAN.flatMap((week) =>
      getPlanTasks(week, tracker.sessionOverrides),
    ).find((item) => item.id === id);
    if (!task) return;
    if (task.kind === "session") {
      if (role === "tutor") {
        navigate("coach");
        notify("Review session completion requests in the Tutor Console.", "warning");
        return;
      }
      const status = getTaskStatus(task, tracker);
      if (status === "approved") {
        notify("This session completion is already tutor-approved.");
        return;
      }
      updateTracker((current) => {
        const requests = { ...current.sessionCompletionRequests };
        if (status === "requested") delete requests[id];
        else requests[id] = { taskId: id, requestedAt: new Date().toISOString() };
        const taskCompletions = { ...current.taskCompletions };
        delete taskCompletions[id];
        return { ...current, taskCompletions, sessionCompletionRequests: requests };
      });
      notify(status === "requested" ? "Approval request withdrawn." : "Sent to Mohamed for approval.");
      return;
    }
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
            role={role!}
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
            notify={notify}
            role={role!}
          />
        );
      case "sessions":
        return (
          <SessionLogView
            tracker={tracker}
            currentWeek={initialWeek}
            updateTracker={updateTracker}
            notify={notify}
            canManage={capabilities.canManageTutorSessions}
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
        return (
          <MasteryView
            tracker={tracker}
            updateTracker={updateTracker}
            canEdit={capabilities.canEditMastery}
          />
        );
      case "mocks":
        return (
          <MockView
            tracker={tracker}
            updateTracker={updateTracker}
            notify={notify}
            canManage={capabilities.canManageMocks}
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
            onCalendarExport={() => setCalendarDialogOpen(true)}
            canImport={capabilities.canImportData}
            syncStatus={syncStatus}
            syncError={syncError}
            userEmail={user.email ?? "Approved mastery-path account"}
            onRetrySync={retrySync}
            role={role!}
            privateTutorNotes={privateTutorNotes}
            privateNotesReady={privateNotesReady}
            privateNotesBusy={privateNotesBusy}
            privateNotesError={privateNotesError}
            updatePrivateTutorNotes={updatePrivateTutorNotes}
          />
        );
      case "coach":
        return capabilities.canResetTracker ? (
          <TutorConsoleView
            tracker={tracker}
            updateTracker={updateTracker}
            replaceTrackerAuthoritatively={replaceTrackerAuthoritatively}
            authoritativeReplaceBusy={authoritativeReplaceBusy}
            syncStatus={syncStatus}
            notify={notify}
          />
        ) : (
          <EmptyState icon={ShieldCheck} title="Tutor access only">
            This console is protected for schedule, diagnostic, and reset administration.
          </EmptyState>
        );
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark"><Target size={24} /></span>
          <div>
            <strong>HAMAD CFA MASTERY</strong>
            <span>Level I Mastery Path</span>
            <small className="creator-credit">Created by Mohamed Ali, CFA</small>
          </div>
        </div>

        <div className="sidebar-exam">
          <span>Exam appointment</span>
          <strong>27 FEB 2027</strong>
          <small>{daysUntilExam()} days to execute</small>
        </div>

        <nav className="sidebar-nav" aria-label="Project sections">
          {NAV_GROUPS.filter(
            (group) => group.label !== "Tutor" || capabilities.canResetTracker,
          ).map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.ids.map((id) => {
                const item = NAV_ITEMS.find((candidate) => candidate.id === id)!;
                const Icon = item.icon;
                return (
                  <button
                    className={cx("nav-button", activeTab === item.id && "is-active")}
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    type="button"
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={cx("sidebar-local", syncCopy.tone)}>
          <SyncIcon size={17} />
          <div>
            <strong>{syncCopy.label}</strong>
            <span>{syncStatus === "error" ? syncError ?? syncCopy.detail : syncCopy.detail}</span>
            {syncStatus === "error" && (
              <button type="button" onClick={retrySync}>Try again</button>
            )}
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark"><Target size={20} /></span>
            <div>
              <strong>HAMAD CFA MASTERY</strong>
              <span>Level I Mastery Path</span>
              <small className="creator-credit">Created by Mohamed Ali, CFA</small>
            </div>
          </div>
          <div className="topbar-title">
            <span>HAMAD CFA MASTERY · {TAB_COPY[activeTab].eyebrow}</span>
            <strong>{TAB_COPY[activeTab].title}</strong>
          </div>
          <div className="topbar-exam"><span>{daysUntilExam()} days</span><small>to exam</small></div>
          <div className="data-actions">
            <span className="role-chip"><ShieldCheck size={14} />{role === "tutor" ? "Tutor" : "Student"}</span>
            <span className={cx("sync-chip", syncCopy.tone)} title={syncCopy.detail}>
              <SyncIcon size={15} />
              <span>{syncCopy.label}</span>
            </span>
            <button className="button button-ghost" type="button" onClick={handleExport}>
              <Download size={16} />
              <span>Export</span>
            </button>
            <button className="button button-ghost" type="button" onClick={() => setCalendarDialogOpen(true)}>
              <CalendarPlus size={16} />
              <span>Calendar import</span>
            </button>
            {capabilities.canImportData && <button
              className="button button-ghost"
              type="button"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={16} />
              <span>Import</span>
            </button>}
            <button
              className="button button-ghost"
              type="button"
              onClick={() => void signOut()}
              title={`Sign out ${user.email ?? ""}`.trim()}
            >
              <LogOut size={16} />
              <span>Sign out</span>
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

        <nav className="mobile-nav" aria-label="Primary project sections">
          {MOBILE_PRIMARY_IDS.map((id) => {
            const item = NAV_ITEMS.find((candidate) => candidate.id === id)!;
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
          <button
            className={cx(
              "mobile-nav-button",
              (mobileMoreOpen || MOBILE_MORE_IDS.includes(activeTab)) && "is-active",
            )}
            type="button"
            aria-expanded={mobileMoreOpen}
            aria-controls="mobile-more-menu"
            onClick={() => setMobileMoreOpen((open) => !open)}
          >
            <Menu size={17} />
            <span>More</span>
          </button>
        </nav>

        <div className="page-shell">
          {activeTab !== "dashboard" && activeTab !== "weekly" && <PageHeading tab={activeTab} />}
          {renderView()}
        </div>
      </main>

      {mobileMoreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setMobileMoreOpen(false)}>
          <section
            className="mobile-more-sheet"
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label="More tracker sections"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div><span>HAMAD CFA MASTERY</span><strong>More tools</strong></div>
              <button className="icon-button" type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Close menu"><X size={19} /></button>
            </header>
            <div className="mobile-more-grid">
              {MOBILE_MORE_IDS.filter(
                (id) => id !== "coach" || capabilities.canResetTracker,
              ).map((id) => {
                const item = NAV_ITEMS.find((candidate) => candidate.id === id)!;
                const Icon = item.icon;
                return (
                  <button
                    className={cx("mobile-more-button", activeTab === item.id && "is-active")}
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                  >
                    <span><Icon size={19} /></span>
                    <div><strong>{item.label}</strong><small>{TAB_COPY[item.id].description}</small></div>
                    <ChevronRight size={17} />
                  </button>
                );
              })}
            </div>
            <p className="mobile-more-credit">Created by Mohamed Ali, CFA</p>
          </section>
        </div>
      )}

      <CalendarExportDialog
        open={calendarDialogOpen}
        onClose={() => setCalendarDialogOpen(false)}
        onExport={handleCalendarExport}
      />

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
  role,
}: {
  tracker: TrackerState;
  currentWeek: number;
  rawProgramWeek: number;
  onToggleTask: (id: string) => void;
  onNavigate: (tab: TabId, week?: number) => void;
  role: "tutor" | "student";
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
      ? "Open approval queue"
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
                <h1>{nextTask.label}</h1>
                <p>{humanizeTaskDetail(nextTask.detail)}</p>
                <div className="hero-actions">
                  <button className="button button-accent" type="button" onClick={() => onToggleTask(nextTask.id)}>
                    <Check size={17} /> {nextTaskAction}
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
            <span>This week</span>
            <strong>{weekProgress}%</strong>
            <ProgressBar value={weekProgress} />
            <p>{required.filter((task) => isTaskComplete(task, tracker)).length} of {required.length} required items complete</p>
            <small>{formatDate(week.startDate, { day: "numeric", month: "short" })} — {formatDate(week.endDate, { day: "numeric", month: "short" })}</small>
          </aside>
        </div>
        <div className="quick-actions" aria-label="Quick actions">
          <span>Quick log</span>
          <button type="button" onClick={() => onNavigate("practice")}><TimerReset size={16} /> Practice</button>
          <button type="button" onClick={() => onNavigate("sessions")}><GraduationCap size={16} /> Session</button>
          <button type="button" onClick={() => onNavigate("errors")}><Archive size={16} /> Mistake</button>
        </div>
      </section>

      <section className="metric-grid home-metrics" aria-label="Progress at a glance">
        <MetricCard
          icon={ListChecks}
          label="Plan complete"
          value={`${overallProgress}%`}
          detail="Required work"
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
          label="Topic progress"
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

      <section className="panel risk-panel" aria-label="Automatic coaching signals">
        <div className="panel-heading">
          <div><p className="eyebrow">Automatic coaching signals</p><h3>What needs attention now</h3></div>
          <ShieldCheck size={21} />
        </div>
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
      </section>

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
  const plannedSessions = PLAN.flatMap(getWeekSessions);

  return (
    <div className="view-stack">
      <section className="roadmap-summary panel">
        <div><strong>{PLAN.length}</strong><span>structured weeks</span></div>
        <div><strong>{plannedSessions.length}</strong><span>numbered tutor sessions</span></div>
        <div><strong>{READING_CATALOG.readings.length}</strong><span>official 2027 modules</span></div>
        <div><strong>{totalQuestions.toLocaleString()}</strong><span>practice target</span></div>
      </section>

      <div className="curriculum-note">
        <BookOpenCheck size={18} />
        <p>
          <strong>Built around the official 2027 CFA Level I curriculum.</strong>{" "}
          Open a week to see its assigned modules, independent work, Saturday checkpoint, practice target, and evidence gate.
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
          const progress = getWeekProgressForState(week, tracker);
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
                  {getWeekSessions(week).map((session) => (
                    <article key={session.number} className="session-plan-card">
                      <div><span>Session {String(session.number).padStart(2, "0")} · {sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))}</span><strong>{formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} · {CHECKPOINT_TIME} · {session.durationMinutes} min</strong></div>
                      <h4>{session.title}</h4>
                      <p>{session.objective}</p>
                      {tracker.sessionOverrides[String(session.number)] && (
                        <small className="reschedule-note">Rescheduled from {formatDate(session.date, { day: "numeric", month: "short" })}: {tracker.sessionOverrides[String(session.number)]!.reason}</small>
                      )}
                      <ReadingCoverage week={week} session={session} />
                    </article>
                  ))}
                  {!getWeekSessions(week).length && (
                    <article className="session-plan-card">
                      <div><span>Exam-day milestone - 27 February</span><strong>No tutor session on exam day</strong></div>
                      <h4>Final checklist: protect the taper and execute</h4>
                      <ul className="outcome-list">
                        {program.examDayChecklist.map((item) => <li key={item}><Check size={15} />{item}</li>)}
                      </ul>
                    </article>
                  )}
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
  notify,
  role,
}: {
  tracker: TrackerState;
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
  onToggleTask: (id: string) => void;
  notify: Notify;
  role: "tutor" | "student";
}) {
  const week = PLAN[selectedWeek - 1]!;
  const tasks = getPlanTasks(week, tracker.sessionOverrides);
  const required = tasks.filter((task) => !task.optional);
  const completed = required.filter((task) => isTaskComplete(task, tracker)).length;
  const progress = getWeekProgressForState(week, tracker);
  const report = buildWeeklyReport(week, tracker, todayDateOnly());

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formatWeeklyReportText(report));
      notify("Weekly report copied for WhatsApp.");
    } catch {
      notify("Clipboard access was blocked by the browser.", "warning");
    }
  };

  const printReport = () => {
    try {
      printWeeklyReport(report);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to open the report.", "warning");
    }
  };

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
        <div className="week-report-actions">
          <button className="button button-secondary" type="button" onClick={() => void copyReport()}><Copy size={16} /> Copy report</button>
          <button className="button button-secondary" type="button" onClick={printReport}><Printer size={16} /> Print / PDF</button>
        </div>
      </section>

      <section className="week-hero panel">
        <div className="week-number"><span>WEEK</span><strong>{String(week.week).padStart(2, "0")}</strong></div>
        <div className="week-hero-copy">
          <p className="eyebrow">{week.phase}</p>
          <h1>{week.focus}</h1>
          <p>{formatDate(week.startDate)} — {formatDate(week.endDate)}</p>
          <div className="topic-pills">{week.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
          <div className="session-date-pills">
            {getWeekSessions(week).map((session) => (
              <span key={session.number}><strong>S{String(session.number).padStart(2, "0")}</strong>{sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))} · {formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} · {CHECKPOINT_TIME}</span>
            ))}
          </div>
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
            <div><p className="eyebrow">Step by step</p><h3>This week's checklist</h3></div>
            <ListChecks size={21} />
          </div>
          <TaskChecklist tasks={tasks} tracker={tracker} role={role} onToggle={onToggleTask} />
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
            <p className="eyebrow">Official 2027 modules</p>
            {getWeekSessions(week).map((session) => (
              <div key={session.number}>
                <strong>Session {String(session.number).padStart(2, "0")} · {sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))}, {formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} at {CHECKPOINT_TIME}</strong>
                {tracker.sessionOverrides[String(session.number)] && (
                  <small className="reschedule-note">Rescheduled from {sessionDayLabel(session.date)}, {formatDate(session.date)}: {tracker.sessionOverrides[String(session.number)]!.reason}</small>
                )}
                <ReadingCoverage week={week} session={session} />
              </div>
            ))}
            {!getWeekSessions(week).length && (
              <p className="fine-print">All 102 modules were assigned before exam week. This week contains independent taper and exam-execution tasks only.</p>
            )}
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
  canManage,
}: {
  tracker: TrackerState;
  currentWeek: number;
  updateTracker: UpdateTracker;
  notify: Notify;
  canManage: boolean;
}) {
  const initialPlannedSession =
    getWeekSessions(PLAN[currentWeek - 1]!)[0] ??
    PLANNED_SESSIONS.at(-1)!.session;
  const [form, setForm] = useState({
    date: effectiveSessionDate(initialPlannedSession, tracker.sessionOverrides),
    sessionNumber: initialPlannedSession.number,
    week: currentWeek,
    type: "Tutor session",
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
    if (!canManage) return;
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
        {canManage ? <form className="panel entry-form" onSubmit={submit}>
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
              date: effectiveSessionDate(selected.session, tracker.sessionOverrides),
              sessionNumber,
              week: selected.week.week,
              type: "Tutor session",
              durationMinutes: selected.session.durationMinutes,
            });
          }}>{PLANNED_SESSIONS.map(({ week, session }) => <option key={session.number} value={session.number}>Session {String(session.number).padStart(2, "0")} · {sessionDayLabel(effectiveSessionDate(session, tracker.sessionOverrides))} {formatDate(effectiveSessionDate(session, tracker.sessionOverrides), { day: "numeric", month: "short" })} at {CHECKPOINT_TIME} · W{week.week} · {session.title}</option>)}</select></label>
          <ReadingCoverage week={plannedSelection.week} session={plannedSelection.session} />
          <label><span>Focus</span><input required maxLength={120} placeholder="What did this session attack?" value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })} /></label>
          <label><span>What changed?</span><textarea required rows={3} maxLength={600} placeholder="The observable breakthrough, decision, or remaining gap." value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value })} /></label>
          <label><span>Next action</span><textarea required rows={2} maxLength={400} placeholder="Specific work to complete before the next session." value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Save session</button>
        </form> : <article className="panel read-only-panel"><ShieldCheck size={22} /><div><p className="eyebrow">Student view</p><h3>Tutor session records are tutor-managed</h3><p>You can review every recorded outcome and next action below. Mohamed controls additions and corrections.</p></div></article>}

        <section className="panel log-panel">
          <div className="panel-heading"><div><p className="eyebrow">History</p><h3>Session record</h3></div><FileText size={20} /></div>
          {tracker.sessionLogs.length ? (
            <div className="entry-list">
              {sortByDateDesc(tracker.sessionLogs).map((entry) => (
                <article className="log-entry" key={entry.id}>
                  <div className="log-entry-top"><div><span>{entry.sessionNumber ? `Session ${String(entry.sessionNumber).padStart(2, "0")} · ` : ""}Week {entry.week} · {entry.type}</span><strong>{entry.focus}</strong></div>{canManage && <button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete session"><Trash2 size={15} /></button>}</div>
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
    confidence: 3,
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
            <label><span>Confidence (1-5)</span><input type="number" min="1" max="5" required value={form.confidence} onChange={(event) => setForm({ ...form, confidence: Number(event.target.value) })} /></label>
          </div>
          <label><span>Source label <em>optional</em></span><input maxLength={80} placeholder="e.g. Topic review set A" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
          <label><span>Lesson from the block</span><textarea rows={3} maxLength={500} placeholder="Pattern noticed, decision to change, or area to revisit." value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
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
                    <div className="practice-copy"><span>{topicShort(entry.topic)} · {formatDate(entry.date)} · confidence {entry.confidence ?? 3}/5</span><strong>{entry.source || "Practice block"}</strong>{entry.note && <p>{entry.note}</p>}<ProgressBar value={score} tone={score >= 70 ? "green" : "gold"} /></div>
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

function MasteryView({ tracker, updateTracker, canEdit }: { tracker: TrackerState; updateTracker: UpdateTracker; canEdit: boolean }) {
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
      {!canEdit && <div className="disclaimer-card"><ShieldCheck size={19} /><p><strong>Evidence review.</strong> Mohamed updates the mastery levels from reviewed practice, session, and mock evidence.</p></div>}
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
                disabled={!canEdit}
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
  canManage,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
  canManage: boolean;
}) {
  const [form, setForm] = useState({
    date: todayDateOnly(),
    milestoneWeek: null as number | null,
    label: "",
    score: 0,
    note: "",
  });
  const fullMockTargets = PLAN.flatMap((week) =>
    week.mockMilestone &&
    week.mockMilestone.targetScore !== null &&
    /^Mock [1-7]$/.test(week.mockMilestone.label)
      ? [{ week: week.week, ...week.mockMilestone }]
      : [],
  );
  const chronological = [...tracker.mockScores].sort((a, b) => a.date.localeCompare(b.date));
  const chartData = chronological.map((entry, index) => ({
    name: entry.label,
    score: entry.score,
    target: PLAN.find((week) => week.week === entry.milestoneWeek)?.mockMilestone?.targetScore ?? fullMockTargets[index]?.targetScore ?? 72,
  }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const entry: MockScore = { id: makeId("mock"), ...form, score: clamp(form.score) };
    updateTracker((current) => ({ ...current, mockScores: [...current.mockScores, entry] }));
    setForm({ date: todayDateOnly(), milestoneWeek: null, label: "", score: 0, note: "" });
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

        {canManage ? <form className="panel entry-form mock-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New result</p><h3>Log a mock</h3></div><Plus size={20} /></div>
          <label><span>Date</span><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label><span>Mock milestone</span><select required value={form.milestoneWeek ?? ""} onChange={(event) => { const milestoneWeek = Number(event.target.value); const milestone = fullMockTargets.find((item) => item.week === milestoneWeek); setForm({ ...form, milestoneWeek, label: milestone?.label ?? "" }); }}><option value="" disabled>Select Mock 1-7</option>{fullMockTargets.map((item) => <option key={item.week} value={item.week}>Week {item.week} · {item.label} · target {item.targetScore}%</option>)}</select></label>
          <label><span>Score %</span><input required type="number" min="0" max="100" value={form.score} onChange={(event) => setForm({ ...form, score: Number(event.target.value) })} /></label>
          <label><span>Evidence note</span><textarea rows={3} maxLength={500} placeholder="What drove this result?" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          <button className="button button-primary" type="submit"><Plus size={16} /> Save result</button>
        </form> : <article className="panel read-only-panel"><ShieldCheck size={22} /><div><p className="eyebrow">Student view</p><h3>Mock administration is tutor-managed</h3><p>Results and the campaign ladder remain visible here as soon as Mohamed records them.</p></div></article>}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Campaign ladder</p><h3>Internal targets by rehearsal</h3></div><Flag size={20} /></div>
        <div className="target-ladder">
          {fullMockTargets.map((target) => {
            const actual = chronological.find(
              (entry) => entry.milestoneWeek === target.week,
            );
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
                {canManage && <button className="icon-button icon-button-danger" type="button" onClick={() => remove(entry.id)} aria-label="Delete mock"><Trash2 size={15} /></button>}
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

function TutorConsoleView({
  tracker,
  updateTracker,
  replaceTrackerAuthoritatively,
  authoritativeReplaceBusy,
  syncStatus,
  notify,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  replaceTrackerAuthoritatively: (state: TrackerState) => Promise<void>;
  authoritativeReplaceBusy: boolean;
  syncStatus: TrackerSyncStatus;
  notify: Notify;
}) {
  const effectiveSessions = getEffectiveSessions(tracker.sessionOverrides);
  const [selectedSession, setSelectedSession] = useState(1);
  const selected = effectiveSessions.find(
    (entry) => entry.session.number === selectedSession,
  ) ?? effectiveSessions[0]!;
  const [newDate, setNewDate] = useState(selected.effectiveDate);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const savedDiagnostic = tracker.diagnostics.find(
    (entry) => entry.sessionNumber === 1,
  );
  const [diagnostic, setDiagnostic] = useState({
    date: savedDiagnostic?.date ?? effectiveSessions[0]!.effectiveDate,
    attempted: savedDiagnostic?.attempted ?? 30,
    correct: savedDiagnostic?.correct ?? 0,
    studyHoursPerWeek: savedDiagnostic?.studyHoursPerWeek ?? 10,
    pacingRating: savedDiagnostic?.pacingRating ?? 3,
    confidenceRating: savedDiagnostic?.confidenceRating ?? 3,
    calculatorReady: savedDiagnostic?.calculatorReady ?? false,
    priorityTopics: savedDiagnostic?.priorityTopics ?? ([] as string[]),
    strengths: savedDiagnostic?.strengths ?? "",
    barriers: savedDiagnostic?.barriers ?? "",
    tutorPlan: savedDiagnostic?.tutorPlan ?? "",
  });
  const hasProgress = !isStateMeaningfullyEmpty(tracker);
  const scheduleIntact =
    (effectiveSessions[0]?.effectiveDate ?? program.examAppointment) >=
      program.programStart &&
    (effectiveSessions.at(-1)?.effectiveDate ?? program.examAppointment) <
      program.examAppointment;
  const launchChecks = [
    {
      label: "Tutor role verified",
      detail: "This console is available only to the Firebase member with role tutor.",
      complete: true,
    },
    {
      label: "Live synchronization",
      detail: syncStatus === "synced" ? "Cloud progress is current." : "Wait for the Synced indicator before resetting or importing.",
      complete: syncStatus === "synced",
    },
    {
      label: "Schedule safety",
      detail: `${effectiveSessions.length} sessions; first ${effectiveSessions[0]?.effectiveDate}; final ${effectiveSessions.at(-1)?.effectiveDate}; exam ${program.examAppointment}.`,
      complete:
        effectiveSessions.length === program.tutoringRhythm.totalSessions &&
        scheduleIntact,
    },
    {
      label: "Shared progress state",
      detail: hasProgress ? "Existing evidence is present. Export before any reset." : "The shared tracker is clean for launch.",
      complete: !hasProgress,
    },
  ];
  const pendingSessionRequests = PLAN.flatMap((week) =>
    getPlanTasks(week, tracker.sessionOverrides)
      .filter((task) => task.kind === "session")
      .map((task) => ({ task, request: tracker.sessionCompletionRequests[task.id] }))
      .filter((entry) => entry.request && getTaskStatus(entry.task, tracker) === "requested"),
  );

  const reviewSessionRequest = (
    taskId: string,
    status: "approved" | "returned",
  ) => {
    updateTracker((current) => {
      const request = current.sessionCompletionRequests[taskId];
      if (!request) return current;
      const note = status === "returned"
        ? window.prompt("Optional follow-up note for Hamad:", "Please review the session action points.") ?? ""
        : "";
      return {
        ...current,
        sessionCompletionReviews: {
          ...current.sessionCompletionReviews,
          [taskId]: {
            taskId,
            requestedAt: request.requestedAt,
            status,
            reviewedAt: new Date().toISOString(),
            note,
          },
        },
      };
    });
    notify(status === "approved" ? "Session completion approved." : "Session request returned to Hamad.");
  };

  const chooseSession = (sessionNumber: number) => {
    const entry = effectiveSessions.find(
      (candidate) => candidate.session.number === sessionNumber,
    );
    setSelectedSession(sessionNumber);
    if (entry) setNewDate(entry.effectiveDate);
  };

  const submitReschedule = (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = cascadeReschedule(
        tracker.sessionOverrides,
        selectedSession,
        newDate,
        rescheduleReason,
      );
      const summary = `Move Session ${String(selectedSession).padStart(2, "0")} to ${newDate} at ${CHECKPOINT_TIME}?`;
      if (!window.confirm(summary)) return;
      updateTracker((current) => ({
        ...current,
        sessionOverrides: result.overrides,
      }));
      setRescheduleReason("");
      notify(
        result.changedSessionNumbers.length
          ? `Session ${String(selectedSession).padStart(2, "0")} rescheduled.`
          : "The selected checkpoint already uses that date.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to reschedule.", "warning");
    }
  };

  const restoreSchedule = () => {
    if (!window.confirm(`Restore Session ${String(selectedSession).padStart(2, "0")} to its canonical Saturday?`)) return;
    updateTracker((current) => ({
      ...current,
      sessionOverrides: restoreCanonicalSession(
        current.sessionOverrides,
        selectedSession,
      ),
    }));
    notify("Canonical session dates restored.");
  };

  const togglePriorityTopic = (topic: string) => {
    setDiagnostic((current) => ({
      ...current,
      priorityTopics: current.priorityTopics.includes(topic)
        ? current.priorityTopics.filter((item) => item !== topic)
        : [...current.priorityTopics, topic],
    }));
  };

  const saveDiagnostic = (status: DiagnosticEntry["status"]) => {
    if (diagnostic.correct > diagnostic.attempted) {
      notify("Diagnostic correct answers cannot exceed attempted answers.", "warning");
      return;
    }
    if (status === "final" && (!diagnostic.barriers.trim() || !diagnostic.tutorPlan.trim())) {
      notify("Record the barriers and tutor repair plan before finalizing.", "warning");
      return;
    }
    const entry: DiagnosticEntry = {
      id: savedDiagnostic?.id ?? makeId("diagnostic"),
      sessionNumber: 1,
      status,
      ...diagnostic,
    };
    updateTracker((current) => ({
      ...current,
      diagnostics: [
        entry,
        ...current.diagnostics.filter((item) => item.sessionNumber !== 1),
      ],
    }));
    notify(status === "final" ? "Session 01 diagnostic finalized." : "Diagnostic draft saved.");
  };

  const resetSharedProgress = async () => {
    const confirmation = window.prompt(
      "A JSON backup will download first. To erase all shared progress on every device, type RESET HAMAD MASTERY",
    );
    if (confirmation !== "RESET HAMAD MASTERY") {
      notify("Reset cancelled. The confirmation text did not match.", "warning");
      return;
    }
    downloadBackup(tracker);
    try {
      await replaceTrackerAuthoritatively(createDefaultState());
      notify("Shared progress reset. The backup remains on this device.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Reset failed.", "warning");
    }
  };

  return (
    <div className="view-stack tutor-console">
      <section className="panel approval-queue">
        <div className="panel-heading"><div><p className="eyebrow">Tutor approval</p><h3>Session completion queue</h3></div><CircleCheckBig size={21} /></div>
        {pendingSessionRequests.length ? <div className="entry-list">{pendingSessionRequests.map(({ task, request }) => <article className="approval-entry" key={task.id}><div><strong>{task.label}</strong><span>Requested {request ? new Date(request.requestedAt).toLocaleString() : ""}</span></div><div className="inline-actions"><button className="button button-primary" type="button" onClick={() => reviewSessionRequest(task.id, "approved")}><Check size={16} /> Approve</button><button className="button button-secondary" type="button" onClick={() => reviewSessionRequest(task.id, "returned")}><RotateCcw size={16} /> Return</button></div></article>)}</div> : <EmptyState icon={CircleCheckBig} title="No approvals waiting">Hamad's session-completion requests will appear here.</EmptyState>}
      </section>
      <section className="panel launch-control-panel">
        <div className="panel-heading"><div><p className="eyebrow">Pre-launch control</p><h3>Four live checks before the first session</h3></div><ShieldCheck size={21} /></div>
        <div className="launch-check-grid">
          {launchChecks.map((check) => (
            <article className={cx("launch-check", check.complete && "is-complete")} key={check.label}>
              {check.complete ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
              <div><strong>{check.label}</strong><p>{check.detail}</p></div>
            </article>
          ))}
          <article className="launch-check launch-reminder">
            <CircleAlert size={18} />
            <div>
              <strong>Manual account reminder</strong>
              <p>Ask Hamad to replace the temporary Firebase password after his first successful login. Firebase does not expose password-change status to this tracker.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="form-and-list tutor-tool-grid">
        <form className="panel entry-form" onSubmit={submitReschedule}>
          <div className="panel-heading"><div><p className="eyebrow">Safe rescheduling</p><h3>Use a same-week Friday exception</h3></div><CalendarClock size={21} /></div>
          <label><span>Session</span><select value={selectedSession} onChange={(event) => chooseSession(Number(event.target.value))}>{effectiveSessions.map((entry) => <option value={entry.session.number} key={entry.session.number}>S{String(entry.session.number).padStart(2, "0")} · {formatDate(entry.effectiveDate, { day: "numeric", month: "short" })} · {entry.session.title}</option>)}</select></label>
          <div className="form-grid form-grid-2">
            <label><span>New date</span><input type="date" min={program.programStart} max={PLANNED_SESSIONS.at(-1)!.session.date} required value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label>
            <label><span>Current date</span><input type="text" readOnly value={formatDate(selected.effectiveDate)} /></label>
          </div>
          <label><span>Reason</span><textarea required rows={3} maxLength={300} placeholder="Short tutor-approved reason for the schedule record." value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} /></label>
          <div className="inline-actions">
            <button className="button button-primary" type="submit"><CalendarClock size={16} /> Preview and apply</button>
            <button className="button button-secondary" type="button" onClick={restoreSchedule}><RotateCcw size={16} /> Restore S{String(selectedSession).padStart(2, "0")}</button>
          </div>
          <p className="fine-print">Each checkpoint stays on its planned Saturday unless Mohamed approves the immediately preceding Friday. The 09:00 Riyadh time, weekly sequence, and exam buffer remain fixed.</p>
        </form>

        <article className="panel override-panel">
          <div className="panel-heading"><div><p className="eyebrow">Live schedule record</p><h3>{Object.keys(tracker.sessionOverrides).length} changed dates</h3></div><CalendarDays size={21} /></div>
          {Object.keys(tracker.sessionOverrides).length ? (
            <div className="override-list">{effectiveSessions.filter((entry) => entry.rescheduled).map((entry) => <div key={entry.session.number}><strong>S{String(entry.session.number).padStart(2, "0")}</strong><span>{formatDate(entry.session.date, { day: "numeric", month: "short" })} → {formatDate(entry.effectiveDate, { day: "numeric", month: "short" })}</span><small>{entry.reason}</small></div>)}</div>
          ) : <EmptyState icon={CalendarDays} title="Canonical schedule active">No session date has been overridden.</EmptyState>}
        </article>
      </section>

      <section className="panel diagnostic-panel">
        <div className="panel-heading"><div><p className="eyebrow">Session 01 · first 25 minutes</p><h3>Prior-attempt diagnostic and repair baseline</h3></div><Target size={21} /></div>
        <p className="panel-intro">Capture what happened across the two prior attempts, then test and repair official 2027 Quant Modules M001-M004.</p>
        <div className="form-grid form-grid-4">
          <label><span>Date</span><input type="date" value={diagnostic.date} onChange={(event) => setDiagnostic({ ...diagnostic, date: event.target.value })} /></label>
          <label><span>Questions attempted</span><input type="number" min="0" max="500" value={diagnostic.attempted} onChange={(event) => setDiagnostic({ ...diagnostic, attempted: Number(event.target.value) })} /></label>
          <label><span>Correct</span><input type="number" min="0" max={diagnostic.attempted} value={diagnostic.correct} onChange={(event) => setDiagnostic({ ...diagnostic, correct: Number(event.target.value) })} /></label>
          <label><span>Study hours / week</span><input type="number" min="0" max="80" value={diagnostic.studyHoursPerWeek} onChange={(event) => setDiagnostic({ ...diagnostic, studyHoursPerWeek: Number(event.target.value) })} /></label>
          <label><span>Pacing (1-5)</span><input type="number" min="1" max="5" value={diagnostic.pacingRating} onChange={(event) => setDiagnostic({ ...diagnostic, pacingRating: Number(event.target.value) })} /></label>
          <label><span>Confidence (1-5)</span><input type="number" min="1" max="5" value={diagnostic.confidenceRating} onChange={(event) => setDiagnostic({ ...diagnostic, confidenceRating: Number(event.target.value) })} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={diagnostic.calculatorReady} onChange={(event) => setDiagnostic({ ...diagnostic, calculatorReady: event.target.checked })} /><span>Calculator workflow ready</span></label>
        </div>
        <fieldset className="topic-selector"><legend>Priority repair topics</legend>{TOPICS.map((topic) => <label key={topic}><input type="checkbox" checked={diagnostic.priorityTopics.includes(topic)} onChange={() => togglePriorityTopic(topic)} /><span>{topicShort(topic)}</span></label>)}</fieldset>
        <div className="form-grid form-grid-3">
          <label><span>What already works</span><textarea rows={4} maxLength={1000} value={diagnostic.strengths} onChange={(event) => setDiagnostic({ ...diagnostic, strengths: event.target.value })} /></label>
          <label><span>Barriers from prior attempts</span><textarea rows={4} maxLength={1000} value={diagnostic.barriers} onChange={(event) => setDiagnostic({ ...diagnostic, barriers: event.target.value })} /></label>
          <label><span>Tutor repair plan</span><textarea rows={4} maxLength={2000} value={diagnostic.tutorPlan} onChange={(event) => setDiagnostic({ ...diagnostic, tutorPlan: event.target.value })} /></label>
        </div>
        <div className="inline-actions"><button className="button button-secondary" type="button" onClick={() => saveDiagnostic("draft")}>Save draft</button><button className="button button-primary" type="button" onClick={() => saveDiagnostic("final")}><Check size={16} /> Finalize baseline</button>{savedDiagnostic && <span className={cx("status-badge", savedDiagnostic.status === "final" ? "status-positive" : "status-gold")}>{savedDiagnostic.status === "final" ? "Finalized" : "Draft"}</span>}</div>
      </section>

      <section className="panel danger-zone">
        <div><p className="eyebrow">Protected recovery control</p><h3>Export, then reset all shared progress</h3><p>Use only before genuine course work begins. This creates a local JSON recovery copy before replacing the synchronized tracker on every device.</p></div>
        <button className="button button-danger" type="button" disabled={authoritativeReplaceBusy || syncStatus !== "synced"} onClick={() => void resetSharedProgress()}><Trash2 size={16} />{authoritativeReplaceBusy ? "Resetting..." : "Export and reset"}</button>
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
  onCalendarExport,
  canImport,
  syncStatus,
  syncError,
  userEmail,
  onRetrySync,
  role,
  privateTutorNotes,
  privateNotesReady,
  privateNotesBusy,
  privateNotesError,
  updatePrivateTutorNotes,
}: {
  tracker: TrackerState;
  updateTracker: UpdateTracker;
  notify: Notify;
  onExport: () => void;
  onImport: () => void;
  onCalendarExport: () => void;
  canImport: boolean;
  syncStatus: TrackerSyncStatus;
  syncError: string | null;
  userEmail: string;
  onRetrySync: () => void;
  role: "tutor" | "student";
  privateTutorNotes: PrivateTutorNote[];
  privateNotesReady: boolean;
  privateNotesBusy: boolean;
  privateNotesError: string | null;
  updatePrivateTutorNotes: (
    recipe: (notes: PrivateTutorNote[]) => PrivateTutorNote[],
  ) => Promise<void>;
}) {
  const [form, setForm] = useState({
    date: todayDateOnly(),
    category: NOTE_CATEGORIES[0],
    title: "",
    body: "",
    visibility: "shared" as "shared" | "private",
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const { visibility, ...noteFields } = form;
    if (visibility === "private" && role === "tutor") {
      const now = new Date().toISOString();
      const entry: PrivateTutorNote = {
        id: makeId("private-note"),
        ...noteFields,
        updatedAt: now,
      };
      try {
        await updatePrivateTutorNotes((notes) => [entry, ...notes]);
        setForm((current) => ({ ...current, title: "", body: "" }));
        notify("Private tutor note saved securely.");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Private note could not be saved.", "warning");
      }
      return;
    }
    const entry: NoteEntry = { id: makeId("note"), ...noteFields };
    updateTracker((current) => ({ ...current, notes: [entry, ...current.notes] }));
    setForm((current) => ({ ...current, title: "", body: "" }));
    notify("Note saved.");
  };

  const removePrivate = async (id: string) => {
    if (!window.confirm("Delete this private tutor note?")) return;
    try {
      await updatePrivateTutorNotes((notes) => notes.filter((entry) => entry.id !== id));
      notify("Private tutor note deleted.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Private note could not be deleted.", "warning");
    }
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this note?")) return;
    updateTracker((current) => ({ ...current, notes: current.notes.filter((entry) => entry.id !== id) }));
  };

  const syncCopy = syncPresentation(syncStatus);
  const SyncIcon = syncCopy.icon;

  return (
    <div className="view-stack">
      <section className="backup-panel panel">
        <div className={cx("backup-icon", syncCopy.tone)}><SyncIcon size={25} /></div>
        <div>
          <p className="eyebrow">Live cloud sync</p>
          <h3>Progress follows you to every device</h3>
          <p>
            Signed in as {userEmail}. Every change is saved to the shared tracker
            automatically; JSON export is now an optional recovery copy.
          </p>
          <span className={cx("backup-sync-status", syncCopy.tone)}>
            <SyncIcon size={14} /> {syncCopy.label}
            {syncStatus === "error" && syncError ? ` - ${syncError}` : ""}
          </span>
        </div>
        <div className="backup-actions">
          {syncStatus === "error" && (
            <button className="button button-primary" type="button" onClick={onRetrySync}>
              Try sync again
            </button>
          )}
          <button className="button button-secondary" type="button" onClick={onExport}><Download size={16} /> Export JSON</button>
          <button className="button button-secondary" type="button" onClick={onCalendarExport}><CalendarPlus size={16} /> Calendar import</button>
          {canImport && <button className="button button-secondary" type="button" onClick={onImport}><Upload size={16} /> Import JSON</button>}
        </div>
      </section>

      <section className="form-and-list">
        <form className="panel entry-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">New note</p><h3>Capture a decision</h3></div><Plus size={20} /></div>
          <div className="form-grid form-grid-2">
            <label><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label><span>Category</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{NOTE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            {role === "tutor" && <label><span>Visibility</span><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as "shared" | "private" })}><option value="shared">Shared with Hamad</option><option value="private">Private tutor note</option></select></label>}
          </div>
          <label><span>Title</span><input required maxLength={100} placeholder="A short, useful heading" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label><span>Note</span><textarea required rows={6} maxLength={2000} placeholder="Decision, reflection, resource URL, or commitment." value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
          <button className="button button-primary" type="submit" disabled={privateNotesBusy}><Plus size={16} /> {form.visibility === "private" ? "Save privately" : "Save note"}</button>
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
      {role === "tutor" && (
        <section className="panel private-notes-panel">
          <div className="panel-heading"><div><p className="eyebrow">Tutor only</p><h3>Private coaching notes</h3></div><ShieldCheck size={20} /></div>
          <p className="fine-print">Stored in a separate tutor-only Firestore document. Hamad's account cannot read this data.</p>
          {privateNotesError && <p className="form-error"><CircleAlert size={15} />{privateNotesError}</p>}
          {!privateNotesReady ? <p>Loading private notes…</p> : privateTutorNotes.length ? (
            <div className="entry-list">
              {sortByDateDesc(privateTutorNotes).map((entry) => (
                <article className="note-entry private-note-entry" key={entry.id}>
                  <div className="log-entry-top"><div><span>{entry.category} · {formatDate(entry.date)}</span><strong>{entry.title}</strong></div><button className="icon-button icon-button-danger" disabled={privateNotesBusy} type="button" onClick={() => void removePrivate(entry.id)} aria-label="Delete private note"><Trash2 size={15} /></button></div>
                  <p>{entry.body}</p>
                </article>
              ))}
            </div>
          ) : <EmptyState icon={ShieldCheck} title="No private notes">Choose Private tutor note above when an observation should remain visible only to Mohamed.</EmptyState>}
        </section>
      )}
    </div>
  );
}

function MiniMetric({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <article className="mini-metric"><span><Icon size={17} /></span><div><strong>{value}</strong><p>{label}</p></div></article>
  );
}

export default App;
