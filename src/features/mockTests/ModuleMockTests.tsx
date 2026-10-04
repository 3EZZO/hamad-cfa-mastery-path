import { Archive, BellRing, BookOpenCheck, CalendarClock, ChevronDown, CircleAlert, CircleCheckBig, Clock3, Flag, LockKeyhole, Maximize, PlayCircle, RotateCcw, ShieldAlert, Target, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { MOCK_MODULES, MOCK_TOPICS, mockModuleCode, mockModuleLabel, type MockModule, type MockTopic } from "../../data/mockModules";
import {
  finalizeExpiredMockAttempt,
  finishMockAttempt,
  getMockAttempt,
  getMockQuestions,
  getMockTestMeta,
  gradeMockAttempt,
  listMockAttempts,
  loadMockTestPackage,
  resumeMockAttempt,
  saveMockWork,
  startMockAttempt,
  type MockTestPackage,
  type MockWork,
} from "../../lib/cloudMockTests";
import { getCloudErrorMessage, listActiveStudentMembers } from "../../lib/cloud";
import { listMockReminders, loadMyReminderDeadlines } from "../../lib/cloudMockReminders";
import { deadlineCountdown, formatReminderDate } from "../../lib/mockReminders";
import { buildTestBoard, deadlinesByModule, isSettled, summarizeTestBoard, summarizeTopic, WEAK_SCORE, type BoardRow, type TopicProgress } from "../../lib/testBoard";
import { loadHubView, saveHubView, type HubTopicFilter, type MockHubView } from "../../lib/mockHubView";
import {
  MOCK_QUESTION_COUNT,
  appendIncident,
  emptyAnswers,
  emptyFlags,
  gradeMockAnswers,
  isMockAttemptLocked,
  mockAttemptView,
  type MockAttempt,
  type MockFinishReason,
  type MockQuestion,
  type MockTestMeta,
} from "../../lib/mockTestContent";
import type { ProjectRole } from "../../lib/permissions";
import { setShellBusy } from "../../lib/shellBusy";
import { MockResults, type LocalReview } from "./MockResults";
import { MockTestRunner, requestExamFullscreen } from "./MockTestRunner";
import { exitFullscreen } from "./useExamLock";
import "./moduleMock.css";

type Notify = (message: string, tone?: "success" | "warning") => void;

interface ModuleState {
  module: MockModule;
  meta: MockTestMeta | null;
  attempt: MockAttempt | null;
  error: string;
}

/** What the tutor sees of the student's test record (read-only). */
interface TutorView {
  attempts: Map<string, MockAttempt>;
  deadlines: Map<string, string>;
}

type Screen =
  | { kind: "hub" }
  | { kind: "start"; moduleId: string }
  | { kind: "run"; moduleId: string; questions: MockQuestion[]; attempt: MockAttempt; serverOffsetMs: number }
  | { kind: "rehearse"; moduleId: string; pkg: MockTestPackage; startedAtMs: number }
  | { kind: "results"; moduleId: string }
  | { kind: "rehearsal-results"; moduleId: string; local: LocalReview };

function workOf(attempt: MockAttempt): MockWork {
  return { answers: attempt.answers, flags: attempt.flags, incidents: attempt.incidents, keystrokes: attempt.keystrokes };
}

function moduleLabel(module: MockModule): string {
  return `${mockModuleLabel(module)} · ${module.title}`;
}

export function ModuleMockTests({
  uid,
  role,
  notify,
  openModuleId = "",
  onOpenHandled,
  onOpenMistakes,
  onOpenRepair,
  onOpenReminders,
  onOpenTutorAdmin,
}: {
  uid: string;
  role: ProjectRole;
  notify: Notify;
  /** From `#moduleMocks/<moduleId>` (e.g. a tutor reminder): open that module's start screen. */
  openModuleId?: string;
  onOpenHandled?: () => void;
  /** Student: open Mistake Review after a weak result. */
  onOpenMistakes?: () => void;
  /** Student: start the repair queue after a weak result. */
  onOpenRepair?: () => void;
  /** Tutor: go to the reminder tools in Tutor Admin. */
  onOpenReminders?: () => void;
  /** Tutor: open Tutor Admin from the tutor note. */
  onOpenTutorAdmin?: () => void;
}) {
  const isTutor = role === "tutor";
  const [modules, setModules] = useState<ModuleState[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>({ kind: "hub" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deadlines, setDeadlines] = useState<Map<string, string>>(new Map());
  const [tutorView, setTutorView] = useState<TutorView | null>(null);
  const [view, setView] = useState<MockHubView>(loadHubView);
  const updateView = (next: MockHubView) => { setView(next); saveHubView(next); };

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await Promise.all(MOCK_MODULES.map(async (module): Promise<ModuleState> => {
      try {
        const meta = await getMockTestMeta(module.id).catch(() => null);
        if (isTutor) return { module, meta, attempt: null, error: "" };
        let attempt = meta ? await getMockAttempt(uid, module.id) : null;
        // An attempt whose clock ran out while the app was closed is locked
        // with the answers already saved, then graded.
        if (attempt && mockAttemptView(attempt, Date.now()) === "expired") {
          try {
            await finalizeExpiredMockAttempt(attempt.id);
            attempt = await getMockAttempt(uid, module.id);
          } catch {
            // The device clock may be ahead; resume will re-anchor on the server.
          }
        }
        if (attempt && isMockAttemptLocked(attempt) && attempt.score === null) {
          attempt = await gradeMockAttempt(attempt).catch(() => attempt);
        }
        return { module, meta, attempt, error: "" };
      } catch (cause) {
        return { module, meta: null, attempt: null, error: getCloudErrorMessage(cause) };
      }
    }));
    setModules(next);
    setLoading(false);
    // Deadlines (and, for the tutor, the student's attempts) only order and
    // label the board; failures leave it in plain module order.
    if (isTutor) {
      try {
        const [students, attempts, reminders] = await Promise.all([listActiveStudentMembers(), listMockAttempts(), listMockReminders()]);
        const studentUid = students[0]?.uid ?? null;
        const mine = attempts.filter(attempt => !studentUid || attempt.uid === studentUid);
        const byModule = new Map<string, MockAttempt>();
        for (const attempt of mine) {
          const current = byModule.get(attempt.moduleId);
          if (!current || attempt.attemptNumber > current.attemptNumber) byModule.set(attempt.moduleId, attempt);
        }
        setTutorView({ attempts: byModule, deadlines: deadlinesByModule(reminders, studentUid) });
      } catch {
        setTutorView(null);
      }
    } else {
      setDeadlines(await loadMyReminderDeadlines(uid).catch(() => new Map<string, string>()));
    }
  }, [isTutor, uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  const running = screen.kind === "run" || screen.kind === "rehearse";
  useEffect(() => {
    if (!running) return;
    setShellBusy("mock");
    return () => setShellBusy(null);
  }, [running]);

  // A deep link opens the start screen of a module not yet started; anything
  // else (in progress, completed, unknown) lands on the hub, which shows it.
  useEffect(() => {
    if (!openModuleId || loading || running) return;
    const entry = modules.find(item => item.module.id === openModuleId);
    if (!isTutor && entry?.meta && mockAttemptView(entry.attempt, Date.now()) === "not-started") {
      setError("");
      setScreen({ kind: "start", moduleId: entry.module.id });
    } else {
      setScreen({ kind: "hub" });
    }
    onOpenHandled?.();
  }, [openModuleId, loading, running, modules, isTutor, onOpenHandled]);

  const current = useMemo(
    () => ("moduleId" in screen ? modules.find(entry => entry.module.id === screen.moduleId) : undefined),
    [modules, screen],
  );

  const begin = async (entry: ModuleState) => {
    if (!entry.meta) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You are offline. The test needs a connection to start and to save your answers.");
      return;
    }
    setBusy(true);
    setError("");
    // Full screen must be requested inside the click that starts the test.
    await requestExamFullscreen();
    try {
      // The questions are readable only once the attempt exists, so the
      // attempt (and its server start time) always comes first.
      const anchored = await startMockAttempt(entry.meta);
      const questions = await getMockQuestions(entry.module.id);
      setScreen({ kind: "run", moduleId: entry.module.id, questions: questions.questions, ...anchored });
    } catch (cause) {
      await exitFullscreen();
      setError(getCloudErrorMessage(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const resume = async (entry: ModuleState) => {
    if (!entry.attempt) return;
    setBusy(true);
    setError("");
    await requestExamFullscreen();
    try {
      const anchored = await resumeMockAttempt(entry.attempt);
      const questions = await getMockQuestions(entry.module.id);
      const attempt = {
        ...anchored.attempt,
        incidents: appendIncident(anchored.attempt.incidents, {
          type: "reload",
          atClient: new Date().toISOString(),
          elapsedMs: Math.max(0, Date.now() + anchored.serverOffsetMs - anchored.attempt.startedAtMs),
        }),
      };
      setScreen({ kind: "run", moduleId: entry.module.id, questions: questions.questions, attempt, serverOffsetMs: anchored.serverOffsetMs });
    } catch {
      // Past the deadline on the server clock: lock what was saved.
      await exitFullscreen();
      try {
        await finalizeExpiredMockAttempt(entry.attempt.id);
      } catch (cause) {
        setError(getCloudErrorMessage(cause));
      }
      await refresh();
      setScreen({ kind: "results", moduleId: entry.module.id });
    } finally {
      setBusy(false);
    }
  };

  const rehearse = async (entry: ModuleState) => {
    setBusy(true);
    setError("");
    await requestExamFullscreen();
    try {
      const pkg = await loadMockTestPackage(entry.module.id);
      if (!pkg) throw new Error("Upload this module's test before rehearsing it.");
      setScreen({ kind: "rehearse", moduleId: entry.module.id, pkg, startedAtMs: Date.now() });
    } catch (cause) {
      await exitFullscreen();
      setError(cause instanceof Error ? cause.message : getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (screen.kind === "run" && current) {
    const attemptId = screen.attempt.id;
    return (
      <MockTestRunner
        moduleLabel={moduleLabel(current.module)}
        questions={screen.questions}
        startedAtMs={screen.attempt.startedAtMs}
        serverOffsetMs={screen.serverOffsetMs}
        initialWork={workOf(screen.attempt)}
        onSave={work => saveMockWork(attemptId, work)}
        onFinish={async (reason, work) => {
          try {
            await finishMockAttempt(attemptId, work, reason);
          } catch (cause) {
            // A timeout submit can land just after the grace window; the saved
            // answers are then locked as expired instead.
            if (reason === "leave") throw new Error(getCloudErrorMessage(cause));
            await finalizeExpiredMockAttempt(attemptId).catch(() => { throw new Error(getCloudErrorMessage(cause)); });
          }
          notify(reason === "leave" ? "Test forfeited and recorded." : "Test submitted. Your answers are locked.");
          await refresh();
          setScreen({ kind: "results", moduleId: current.module.id });
        }}
      />
    );
  }

  if (screen.kind === "rehearse" && current) {
    const { pkg } = screen;
    return (
      <MockTestRunner
        rehearsal
        moduleLabel={moduleLabel(current.module)}
        questions={pkg.questions.questions}
        startedAtMs={screen.startedAtMs}
        serverOffsetMs={0}
        initialWork={{ answers: emptyAnswers(), flags: emptyFlags(), incidents: [], keystrokes: [] }}
        onSave={async () => undefined}
        onFinish={async (reason: Exclude<MockFinishReason, "expired">, work) => {
          const { correct, score } = gradeMockAnswers(work.answers, pkg.key.correct);
          setScreen({
            kind: "rehearsal-results",
            moduleId: current.module.id,
            local: { reason, work, correct, score, timeUsedMs: Math.min(Date.now() - screen.startedAtMs, pkg.meta.durationSeconds * 1000), pkg },
          });
        }}
      />
    );
  }

  if (screen.kind === "start" && current?.meta) {
    return (
      <StartScreen
        entry={current}
        busy={busy}
        error={error}
        onCancel={() => { setError(""); setScreen({ kind: "hub" }); }}
        onStart={() => void begin(current)}
      />
    );
  }

  if (screen.kind === "results" && current?.attempt) {
    return (
      <MockResults
        moduleLabel={moduleLabel(current.module)}
        attempt={current.attempt}
        onBack={() => setScreen({ kind: "hub" })}
      />
    );
  }

  if (screen.kind === "rehearsal-results" && current) {
    return (
      <MockResults
        moduleLabel={moduleLabel(current.module)}
        local={screen.local}
        onBack={() => setScreen({ kind: "hub" })}
      />
    );
  }

  const inProgress = modules.find(entry => entry.attempt?.status === "active");
  const now = Date.now();
  const boardDeadlines = isTutor ? tutorView?.deadlines ?? new Map<string, string>() : deadlines;
  // One priority board per topic (numbers restart in each topic); a student
  // only sees a topic once it has at least one published test.
  const groups = MOCK_TOPICS.map(topic => {
    const entries = modules.filter(entry => entry.module.topic === topic);
    const rows = buildTestBoard(entries.map(entry => ({
      moduleId: entry.module.id,
      number: entry.module.number,
      published: entry.meta?.status === "published",
      attempt: isTutor ? tutorView?.attempts.get(entry.module.id) ?? null : entry.attempt,
      deadline: boardDeadlines.get(entry.module.id) ?? null,
    })), now);
    const ordered = rows.flatMap(row => entries.filter(entry => entry.module.id === row.moduleId));
    const settledIds = new Set(rows.filter(isSettled).map(row => row.moduleId));
    // The student sees unpublished tests as a count, not as cards; the tutor keeps them as cards (drafts to act on).
    const upcomingIds = new Set(isTutor ? [] : rows.filter(row => row.status === "unpublished").map(row => row.moduleId));
    return {
      topic,
      rows,
      ordered,
      progress: summarizeTopic(rows),
      active: ordered.filter(entry => !settledIds.has(entry.module.id) && !upcomingIds.has(entry.module.id)),
      settled: ordered.filter(entry => settledIds.has(entry.module.id)),
      upcoming: upcomingIds.size,
    };
  }).filter(group => group.ordered.length > 0 && (isTutor || group.ordered.some(entry => entry.meta)));
  const board = groups.flatMap(group => group.rows);
  const rowFor = new Map(board.map(row => [row.moduleId, row]));
  // A saved topic that is not shown (e.g. nothing published yet) falls back to all topics.
  const filter: HubTopicFilter = view.topic !== "all" && groups.some(group => group.topic === view.topic) ? view.topic : "all";
  const shownGroups = filter === "all" ? groups : groups.filter(group => group.topic === filter);
  // Picking one topic also opens it.
  const chooseTopic = (topic: HubTopicFilter) => updateView({
    ...view,
    topic,
    open: topic === "all" ? view.open : { ...view.open, [topic]: true },
  });
  const summary = summarizeTestBoard(board);
  const awaitingRelease = isTutor ? board.filter(row => row.status === "done" && row.attempt && !row.attempt.reviewReleased).length : 0;

  return (
    <section className="mock-hub" aria-labelledby="mock-hub-title">
      <header className="mock-hub__hero">
        <div>
          <p className="mock-hub__eyebrow">Assessment · not practice</p>
          <h2 id="mock-hub-title">Module Tests</h2>
          <p>One compulsory test per published module, in full screen. Your result goes straight to your tutor.</p>
        </div>
        <ul className="mock-hub__rules" aria-label="Test rules">
          <li><Target size={16} />{MOCK_QUESTION_COUNT} questions</li>
          <li><Timer size={16} />12:00 total</li>
          <li><LockKeyhole size={16} />One attempt</li>
        </ul>
      </header>

      {isTutor && (
        <p className="mock-hub__note">
          <ShieldAlert size={16} />
          <span>Tutor view. Upload, review and publish tests, see results and reset attempts in {onOpenTutorAdmin ? <button type="button" className="mock-hub__link" onClick={onOpenTutorAdmin}>Tutor Admin</button> : <strong>Tutor Admin</strong>}. Rehearse runs the real exam screen locally and saves nothing.</span>
        </p>
      )}
      {!loading && summary.published > 0 && (
        <div className="mock-hub__summary" role="status">
          <strong>{isTutor ? "Hamad: " : ""}{summary.nextDeadline
            ? `${summary.doneNext} of ${summary.dueNext} due by ${formatReminderDate(summary.nextDeadline)}`
            : `${summary.done} of ${summary.published} done`}</strong>
          {summary.inProgress > 0 && <span className="is-live">{summary.inProgress} in progress</span>}
          {summary.overdue > 0 && <span className="is-overdue">{summary.overdue} overdue</span>}
          {summary.nextDeadline && <span><CalendarClock size={14} aria-hidden="true" />{deadlineCountdown(summary.nextDeadline, now)} · {summary.done} of {summary.published} done overall</span>}
          {awaitingRelease > 0 && <span>{awaitingRelease} {awaitingRelease === 1 ? "review" : "reviews"} not released</span>}
          {isTutor && onOpenReminders && (
            <button type="button" className="mock-button mock-button--ghost" onClick={onOpenReminders}><BellRing size={16} />Send a reminder</button>
          )}
        </div>
      )}
      {error && <p className="mock-hub__error" role="alert"><CircleAlert size={16} />{error}</p>}
      {inProgress && !isTutor && (
        <div className="mock-hub__resume" role="alert">
          <Clock3 size={18} />
          <span>Your <strong>{mockModuleLabel(inProgress.module)}</strong> test is in progress and its clock is still running.</span>
          <button type="button" className="mock-button mock-button--primary" disabled={busy} onClick={() => void resume(inProgress)}>
            <Maximize size={16} />Return to the test
          </button>
        </div>
      )}

      {loading ? (
        <p className="mock-hub__loading" aria-busy="true">Loading module tests…</p>
      ) : (
        <>
          {groups.length > 1 && (
            <div className="mock-switch" role="group" aria-label="Show tests for">
              <button type="button" className="mock-switch__option" aria-pressed={filter === "all"} onClick={() => chooseTopic("all")}>
                All topics
              </button>
              {groups.map(group => (
                <button key={group.topic} type="button" className="mock-switch__option" aria-pressed={filter === group.topic} onClick={() => chooseTopic(group.topic)}>
                  {group.topic}
                  {group.progress.toTake > 0 && <span className="mock-switch__count">{group.progress.toTake} to do</span>}
                </button>
              ))}
            </div>
          )}
          {shownGroups.map(group => {
            // Open while the topic still has something to act on, unless the viewer chose otherwise.
            const open = view.open[group.topic] ?? group.active.length > 0;
            const doneOpen = view.doneOpen[group.topic] ?? false;
            return (
              <TopicSection
                key={group.topic}
                topic={group.topic}
                progress={group.progress}
                upcoming={group.upcoming}
                open={open}
                onToggle={() => updateView({ ...view, open: { ...view.open, [group.topic]: !open } })}
                doneOpen={doneOpen}
                onToggleDone={() => updateView({ ...view, doneOpen: { ...view.doneOpen, [group.topic]: !doneOpen } })}
                cards={group.active.map(entry => (
                  <ModuleCard
                    key={entry.module.id}
                    entry={entry}
                    row={rowFor.get(entry.module.id)}
                    nowMs={now}
                    onOpenMistakes={onOpenMistakes}
                    onOpenRepair={onOpenRepair}
                    isTutor={isTutor}
                    busy={busy}
                    onOpen={() => { setError(""); setScreen({ kind: "start", moduleId: entry.module.id }); }}
                    onResume={() => void resume(entry)}
                    onResults={() => setScreen({ kind: "results", moduleId: entry.module.id })}
                    onRehearse={() => void rehearse(entry)}
                  />
                ))}
                settled={group.settled.map(entry => (
                  <SettledRow
                    key={entry.module.id}
                    entry={entry}
                    row={rowFor.get(entry.module.id)}
                    isTutor={isTutor}
                    busy={busy}
                    onResults={() => setScreen({ kind: "results", moduleId: entry.module.id })}
                    onRehearse={() => void rehearse(entry)}
                  />
                ))}
              />
            );
          })}
        </>
      )}
    </section>
  );
}

function ModuleCard({
  entry,
  row,
  nowMs,
  onOpenMistakes,
  onOpenRepair,
  isTutor,
  busy,
  onOpen,
  onResume,
  onResults,
  onRehearse,
}: {
  entry: ModuleState;
  row?: BoardRow;
  nowMs: number;
  onOpenMistakes?: () => void;
  onOpenRepair?: () => void;
  isTutor: boolean;
  busy: boolean;
  onOpen: () => void;
  onResume: () => void;
  onResults: () => void;
  onRehearse: () => void;
}) {
  const { module, attempt } = entry;
  const view = mockAttemptView(attempt, Date.now());
  const status = cardStatus(entry, row, isTutor);

  return (
    <li className={`mock-card mock-card--${status.tone}`}>
      <span className="mock-card__number" aria-hidden="true">{String(module.number).padStart(2, "0")}</span>
      <div className="mock-card__body">
        <p className="mock-card__module">Module {module.number}</p>
        <h4>{module.title}</h4>
        <span className={`mock-status mock-status--${status.tone}`}>
          {status.tone === "done" ? <CircleCheckBig size={14} /> : status.tone === "forfeit" ? <Flag size={14} /> : null}
          {status.label}
        </span>
        {row?.deadline && (row.status === "due" || row.status === "in-progress") && (
          <span className={`mock-card__deadline${row.overdue ? " is-overdue" : ""}`}>
            <CalendarClock size={13} aria-hidden="true" />Due {formatReminderDate(row.deadline)} · {deadlineCountdown(row.deadline, nowMs)}
          </span>
        )}
        {isTutor && row?.status === "done" && row.attempt && !row.attempt.reviewReleased && (
          <span className="mock-card__deadline">Review not released yet</span>
        )}
        {!isTutor && view === "completed" && attempt?.reviewReleased && (
          <span className="mock-card__review"><BookOpenCheck size={13} aria-hidden="true" />Review ready</span>
        )}
        {!isTutor && row?.weak && (
          <div className="mock-card__repair">
            <span>Below {WEAK_SCORE}/{MOCK_QUESTION_COUNT}: repair before moving on.</span>
            {onOpenMistakes && <button type="button" className="mock-button mock-button--ghost" onClick={onOpenMistakes}><Archive size={15} />Mistake Review</button>}
            {onOpenRepair && <button type="button" className="mock-button mock-button--ghost" onClick={onOpenRepair}><RotateCcw size={15} />Repair queue</button>}
          </div>
        )}
        {entry.error && <small className="mock-card__error">{entry.error}</small>}
      </div>
      <div className="mock-card__action">
        <CardAction entry={entry} isTutor={isTutor} busy={busy} onOpen={onOpen} onResume={onResume} onResults={onResults} onRehearse={onRehearse} />
      </div>
    </li>
  );
}

function cardStatus(entry: ModuleState, row: BoardRow | undefined, isTutor: boolean): { label: string; tone: string } {
  const { meta, attempt } = entry;
  if (isTutor) {
    return !meta
      ? { label: "No test uploaded", tone: "none" }
      : meta.status !== "published"
        ? { label: "Draft", tone: "draft" }
        : row?.status === "done"
          ? { label: `Hamad: ${row.score}/${MOCK_QUESTION_COUNT}`, tone: "done" }
          : row?.status === "grading"
            ? { label: "Hamad: submitted · awaiting grading", tone: "live" }
            : row?.status === "forfeited"
              ? { label: "Hamad: forfeited", tone: "forfeit" }
              : row?.status === "in-progress"
                ? { label: "Hamad: in progress", tone: "live" }
                : { label: "Published · not taken yet", tone: "todo" };
  }
  const view = mockAttemptView(attempt, Date.now());
  if (!meta) return { label: "No test yet", tone: "none" };
  if (view === "completed") return { label: attempt?.score === null ? "Completed" : `Completed · ${attempt!.score}/${MOCK_QUESTION_COUNT}`, tone: "done" };
  if (view === "forfeited") return { label: "Forfeited", tone: "forfeit" };
  if (view === "in-progress" || view === "expired") return { label: "In progress", tone: "live" };
  return { label: "Not started", tone: "todo" };
}

function CardAction({
  entry,
  isTutor,
  busy,
  onOpen,
  onResume,
  onResults,
  onRehearse,
}: {
  entry: ModuleState;
  isTutor: boolean;
  busy: boolean;
  onOpen?: () => void;
  onResume?: () => void;
  onResults: () => void;
  onRehearse: () => void;
}) {
  const { meta, attempt } = entry;
  const view = mockAttemptView(attempt, Date.now());
  if (isTutor) {
    return (
      <button type="button" className="mock-button mock-button--ghost" disabled={busy || !meta} onClick={onRehearse}>
        <PlayCircle size={16} />Rehearse
      </button>
    );
  }
  if (!meta) return null;
  if (view === "not-started") {
    return <button type="button" className="mock-button mock-button--primary" disabled={busy} onClick={onOpen}>Start</button>;
  }
  if (view === "in-progress" || view === "expired") {
    return <button type="button" className="mock-button mock-button--primary" disabled={busy} onClick={onResume}>Return</button>;
  }
  return (
    <button type="button" className={`mock-button mock-button--${attempt?.reviewReleased ? "primary" : "ghost"}`} onClick={onResults}>
      {attempt?.reviewReleased ? "Read review" : "View result"}
    </button>
  );
}

/** A finished test with nothing left to do, folded into its topic's Done list. */
function SettledRow({
  entry,
  row,
  isTutor,
  busy,
  onResults,
  onRehearse,
}: {
  entry: ModuleState;
  row?: BoardRow;
  isTutor: boolean;
  busy: boolean;
  onResults: () => void;
  onRehearse: () => void;
}) {
  const status = cardStatus(entry, row, isTutor);
  return (
    <li className={`mock-done__row mock-done__row--${status.tone}`}>
      <span className="mock-done__code">{mockModuleCode(entry.module)}</span>
      <span className="mock-done__title">{entry.module.title}</span>
      <span className={`mock-status mock-status--${status.tone}`}>
        {status.tone === "done" ? <CircleCheckBig size={14} /> : status.tone === "forfeit" ? <Flag size={14} /> : null}
        {status.label}
      </span>
      {isTutor && row?.status === "done" && row.attempt && !row.attempt.reviewReleased && (
        <small className="mock-done__note">Review not released</small>
      )}
      <CardAction entry={entry} isTutor={isTutor} busy={busy} onResults={onResults} onRehearse={onRehearse} />
    </li>
  );
}

/** One topic on the Tests page: a collapsible header with progress, its open tests, and a Done fold. */
function TopicSection({
  topic,
  progress,
  upcoming,
  open,
  onToggle,
  doneOpen,
  onToggleDone,
  cards,
  settled,
}: {
  topic: MockTopic;
  progress: TopicProgress;
  /** Unpublished tests, shown to the student as a count only. */
  upcoming: number;
  open: boolean;
  onToggle: () => void;
  doneOpen: boolean;
  onToggleDone: () => void;
  cards: ReactNode[];
  settled: ReactNode[];
}) {
  const slug = topic.toLowerCase().replace(/\W+/g, "-");
  const headingId = `mock-topic-${slug}`;
  const bodyId = `mock-topic-body-${slug}`;
  const doneId = `mock-topic-done-${slug}`;
  const percent = progress.published ? Math.round((progress.done / progress.published) * 100) : 0;
  const dueOnTime = progress.due - progress.overdue;
  return (
    <section className={`mock-topic${open ? " is-open" : ""}`} aria-labelledby={headingId}>
      <div className="mock-topic__head">
        <h3 className="mock-topic__heading">
          <button type="button" className="mock-topic__toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
            <ChevronDown size={18} className="mock-topic__chevron" aria-hidden="true" />
            <span id={headingId}>{topic}</span>
          </button>
        </h3>
        <p className="mock-topic__stats">
          {progress.published ? `${progress.done} of ${progress.published} done` : "No tests published yet"}
          {progress.averageScore !== null && ` · avg ${progress.averageScore.toFixed(1)}/${MOCK_QUESTION_COUNT}`}
        </p>
        <span className="mock-topic__meter" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
        {(progress.inProgress > 0 || progress.due > 0 || progress.repair > 0) && (
          <ul className="mock-topic__badges" aria-label={`${topic} status`}>
            {progress.inProgress > 0 && <li className="mock-status mock-status--live">{progress.inProgress} in progress</li>}
            {progress.overdue > 0 && <li className="mock-status mock-status--forfeit">{progress.overdue} overdue</li>}
            {dueOnTime > 0 && <li className="mock-status mock-status--todo">{dueOnTime} due</li>}
            {progress.repair > 0 && <li className="mock-status mock-status--draft">{progress.repair} to repair</li>}
          </ul>
        )}
      </div>
      <div id={bodyId} className="mock-topic__body" hidden={!open}>
        {cards.length > 0
          ? <ol className="mock-hub__list mock-hub__list--cards">{cards}</ol>
          : upcoming === 0 && <p className="mock-topic__empty"><CircleCheckBig size={16} aria-hidden="true" />Every test in this topic is finished.</p>}
        {upcoming > 0 && (
          <p className="mock-topic__upcoming">{upcoming} more {upcoming === 1 ? "test" : "tests"} not published yet.</p>
        )}
        {settled.length > 0 && (
          <div className="mock-done">
            <button type="button" className="mock-done__toggle" aria-expanded={doneOpen} aria-controls={doneId} onClick={onToggleDone}>
              <ChevronDown size={16} className="mock-topic__chevron" aria-hidden="true" />Done ({settled.length})
            </button>
            <ul id={doneId} className="mock-done__list" hidden={!doneOpen}>{settled}</ul>
          </div>
        )}
      </div>
    </section>
  );
}

export function StartScreen({
  entry,
  busy,
  error,
  onCancel,
  onStart,
}: {
  entry: ModuleState;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onStart: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <section className="mock-start" aria-labelledby="mock-start-title">
      <div className="mock-start__card">
        <p className="mock-start__eyebrow">{mockModuleLabel(entry.module)} mock test</p>
        <h2 id="mock-start-title">{entry.module.title}</h2>
        <div className="mock-start__clock" aria-hidden="true">12:00</div>
        <ul className="mock-start__rules">
          <li><strong>{MOCK_QUESTION_COUNT} questions, 12 minutes.</strong> About 90 seconds each. The clock runs on the server and does not pause.</li>
          <li><strong>One attempt.</strong> Pressing Start uses it. You cannot restart or retake the test.</li>
          <li><strong>Full screen.</strong> Leaving full screen or switching apps is recorded for your tutor.</li>
          <li><strong>Leave Test forfeits.</strong> Closing the page does not stop the clock; at 00:00 your selected answers are submitted.</li>
          <li><strong>Tools.</strong> Flag questions, move freely between them, and use the BA II Plus calculator.</li>
        </ul>
        <label className="mock-start__ack">
          <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
          I understand this is my only attempt and that leaving forfeits it.
        </label>
        {error && <p className="mock-hub__error" role="alert"><CircleAlert size={16} />{error}</p>}
        <div className="mock-start__actions">
          <button type="button" className="mock-button mock-button--ghost" onClick={onCancel} disabled={busy}>Not now</button>
          <button type="button" className="mock-button mock-button--start" onClick={onStart} disabled={!acknowledged || busy}>
            <Maximize size={18} />{busy ? "Starting…" : "Start Test"}
          </button>
        </div>
      </div>
    </section>
  );
}
