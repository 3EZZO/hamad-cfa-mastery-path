import { CircleAlert, Clock3, History, LockKeyhole, Maximize, PlayCircle, RotateCcw, Target, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOCK_PAPERS, MOCK_PAPER_KIND, MOCK_PAPER_SECTION, type MockPaper } from "../../data/mockPapers";
import { getCloudErrorMessage, listActiveStudentMembers } from "../../lib/cloud";
import {
  finalizeExpiredMockAttempt,
  finishMockAttempt,
  getMockAttempt,
  getMockKeyDoc,
  getMockQuestions,
  getMockTestMeta,
  gradeMockAttempt,
  listMockAttempts,
  loadMockTestPackage,
  resumeMockAttempt,
  saveMockWork,
  startMockAttempt,
  watchMockAttempt,
  type MockTestPackage,
  type MockWork,
} from "../../lib/cloudMockTests";
import {
  discardMockRehearsal,
  finishMockRehearsal,
  listMockRehearsals,
  mockRehearsalRemainingMs,
  saveMockRehearsal,
  startMockRehearsal,
  type MockRehearsal,
} from "../../lib/cloudMockRehearsals";
import {
  appendIncident,
  formatMockClock,
  isMockAttemptLocked,
  mockAttemptDurationMs,
  mockAttemptQuestionCount,
  mockAttemptView,
  mockKeystrokeLimit,
  mockRemainingMs,
  mockTimeUsedMs,
  type MockAttempt,
  type MockKeyDoc,
  type MockQuestion,
  type MockTestMeta,
} from "../../lib/mockTestContent";
import type { ProjectRole } from "../../lib/permissions";
import { setShellBusy } from "../../lib/shellBusy";
import { MockResults, type LocalReview } from "./MockResults";
import { PaperBreakdownView } from "./PaperBreakdownView";
import { MockTestRunner, requestExamFullscreen } from "./MockTestRunner";
import { StartScreen } from "./MockStartScreen";
import { exitFullscreen } from "./useExamLock";

type Notify = (message: string, tone?: "success" | "warning") => void;

interface PaperState {
  paper: MockPaper;
  meta: MockTestMeta | null;
  /** The student's own attempt (student view) or the student's latest attempt (tutor view). */
  attempt: MockAttempt | null;
  /** Tutor only: the tutor's own rehearsals, newest first. */
  rehearsals: MockRehearsal[];
}

type Screen =
  | { kind: "list" }
  | { kind: "start"; paperId: string }
  | { kind: "run"; paperId: string; questions: MockQuestion[]; attempt: MockAttempt; serverOffsetMs: number }
  | { kind: "results"; paperId: string }
  | { kind: "rehearse"; paperId: string; pkg: MockTestPackage; rehearsal: MockRehearsal }
  | { kind: "rehearsal-results"; paperId: string; local: LocalReview };

function workOf(attempt: MockAttempt): MockWork {
  return { answers: attempt.answers, flags: attempt.flags, incidents: attempt.incidents, keystrokes: attempt.keystrokes, dwellMs: attempt.dwellMs };
}

/** The tutor's one-line view of the student's paper attempt; live while it runs. */
function StudentStatus({ attempt, meta }: { attempt: MockAttempt | null; meta: MockTestMeta | null }) {
  const [live, setLive] = useState(attempt);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => setLive(attempt), [attempt]);
  const activeId = attempt?.status === "active" ? attempt.id : null;
  useEffect(() => {
    if (!activeId) return;
    const stop = watchMockAttempt(activeId, next => { if (next) setLive(next); });
    const tick = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => { stop(); window.clearInterval(tick); };
  }, [activeId]);
  if (!meta || meta.status !== "published") return <span className="mock-status mock-status--draft">Hamad: not available yet</span>;
  if (!live) return <span className="mock-status">Hamad: not started</span>;
  const view = mockAttemptView(live, nowMs);
  const count = mockAttemptQuestionCount(live);
  const answered = live.answers.filter(answer => answer !== null).length;
  if (view === "in-progress" || view === "expired") {
    return (
      <span className="mock-status mock-status--live">
        Hamad: in progress · {answered}/{count} answered · {formatMockClock(mockRemainingMs(live.startedAtMs, nowMs, 0, mockAttemptDurationMs(live)))} left
        {" "}· last seen {formatMockClock(Math.max(0, nowMs - live.lastSeenAtMs))} ago{live.incidents.length ? ` · ${live.incidents.length} incidents` : ""}
      </span>
    );
  }
  if (view === "forfeited") return <span className="mock-status mock-status--forfeit">Hamad: forfeited</span>;
  return (
    <span className="mock-status mock-status--done">
      Hamad: {live.score === null ? "grading" : `${live.score}/${count}`}{live.attemptNumber > 1 ? ` · attempt ${live.attemptNumber} (repeat)` : ""}
      {live.reviewReleased ? "" : " · review not released"}
    </span>
  );
}

export function FullMockPapers({
  uid,
  role,
  notify,
  onFocusChange,
  onOpenTutorAdmin,
  onPracticeModule,
}: {
  uid: string;
  role: ProjectRole;
  notify: Notify;
  /** True while a Mastery Exam screen (start, exam, results) replaces the Tests hub. */
  onFocusChange: (focused: boolean) => void;
  onOpenTutorAdmin?: () => void;
  /** Student: practise a module test's curriculum module after a paper. */
  onPracticeModule?: (moduleTestId: string) => void;
}) {
  const isTutor = role === "tutor";
  const [papers, setPapers] = useState<PaperState[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [studentKey, setStudentKey] = useState<MockKeyDoc | null>(null);
  const rehearsalRef = useRef<MockRehearsal | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const studentAttempts = new Map<string, MockAttempt>();
    if (isTutor) {
      try {
        const [students, attempts] = await Promise.all([listActiveStudentMembers(), listMockAttempts()]);
        const studentUid = students[0]?.uid ?? null;
        for (const attempt of attempts) {
          if (studentUid && attempt.uid !== studentUid) continue;
          if (!MOCK_PAPERS.some(paper => paper.id === attempt.moduleId)) continue;
          const current = studentAttempts.get(attempt.moduleId);
          if (!current || attempt.attemptNumber > current.attemptNumber) studentAttempts.set(attempt.moduleId, attempt);
        }
      } catch {
        // The cards still show the papers; only the student line is missing.
      }
    }
    const next = await Promise.all(MOCK_PAPERS.map(async (paper): Promise<PaperState> => {
      const meta = await getMockTestMeta(paper.id).catch(() => null);
      if (isTutor) {
        const rehearsals = meta ? await listMockRehearsals(paper.id).catch(() => []) : [];
        return { paper, meta, attempt: studentAttempts.get(paper.id) ?? null, rehearsals };
      }
      let attempt = meta ? await getMockAttempt(uid, paper.id).catch(() => null) : null;
      if (attempt && mockAttemptView(attempt, Date.now()) === "expired") {
        await finalizeExpiredMockAttempt(attempt.id).catch(() => undefined);
        attempt = await getMockAttempt(uid, paper.id).catch(() => attempt);
      }
      if (attempt && isMockAttemptLocked(attempt) && attempt.score === null) {
        attempt = await gradeMockAttempt(attempt).catch(() => attempt);
      }
      return { paper, meta, attempt, rehearsals: [] };
    }));
    setPapers(next);
    setLoading(false);
  }, [isTutor, uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  const focused = screen.kind !== "list";
  useEffect(() => { onFocusChange(focused); }, [focused, onFocusChange]);
  const running = screen.kind === "run" || screen.kind === "rehearse";
  useEffect(() => {
    if (!running) return;
    setShellBusy("mock");
    return () => setShellBusy(null);
  }, [running]);

  const current = useMemo(
    () => ("paperId" in screen ? papers.find(entry => entry.paper.id === screen.paperId) : undefined),
    [papers, screen],
  );

  // The student's breakdown needs the key's tags, readable once the attempt is locked.
  const resultsAttempt = screen.kind === "results" ? current?.attempt ?? null : null;
  useEffect(() => {
    setStudentKey(null);
    if (!resultsAttempt || !resultsAttempt.reviewReleased) return;
    getMockKeyDoc(resultsAttempt.moduleId).then(setStudentKey, () => setStudentKey(null));
  }, [resultsAttempt]);

  const back = () => { setError(""); setScreen({ kind: "list" }); };

  const begin = async (entry: PaperState) => {
    if (!entry.meta) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You are offline. The paper needs a connection to start and to save your answers.");
      return;
    }
    setBusy(true);
    setError("");
    await requestExamFullscreen();
    try {
      const anchored = await startMockAttempt(entry.meta);
      const questions = await getMockQuestions(entry.paper.id);
      setScreen({ kind: "run", paperId: entry.paper.id, questions: questions.questions, ...anchored });
    } catch (cause) {
      await exitFullscreen();
      setError(getCloudErrorMessage(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const resume = async (entry: PaperState) => {
    if (!entry.attempt) return;
    setBusy(true);
    setError("");
    await requestExamFullscreen();
    try {
      const anchored = await resumeMockAttempt(entry.attempt);
      const questions = await getMockQuestions(entry.paper.id);
      const attempt = {
        ...anchored.attempt,
        incidents: appendIncident(anchored.attempt.incidents, {
          type: "reload",
          atClient: new Date().toISOString(),
          elapsedMs: Math.max(0, Date.now() + anchored.serverOffsetMs - anchored.attempt.startedAtMs),
        }),
      };
      setScreen({ kind: "run", paperId: entry.paper.id, questions: questions.questions, attempt, serverOffsetMs: anchored.serverOffsetMs });
    } catch {
      await exitFullscreen();
      await finalizeExpiredMockAttempt(entry.attempt.id).catch(cause => setError(getCloudErrorMessage(cause)));
      await refresh();
      setScreen({ kind: "results", paperId: entry.paper.id });
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ tutor rehearsal

  const activeRehearsal = (entry: PaperState) =>
    entry.rehearsals.find(item => item.status === "active" && item.testVersion === entry.meta?.version) ?? null;

  const openRehearsal = async (entry: PaperState) => {
    setBusy(true);
    setError("");
    await requestExamFullscreen();
    try {
      const pkg = await loadMockTestPackage(entry.paper.id);
      if (!pkg) throw new Error("Upload this paper in Tutor Admin before rehearsing it.");
      const existing = activeRehearsal(entry);
      const rehearsal = existing && mockRehearsalRemainingMs(existing, Date.now()) > 0 ? existing : await startMockRehearsal(pkg.meta);
      rehearsalRef.current = rehearsal;
      setScreen({ kind: "rehearse", paperId: entry.paper.id, pkg, rehearsal });
    } catch (cause) {
      await exitFullscreen();
      setError(cause instanceof Error ? cause.message : getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const discard = async (rehearsal: MockRehearsal) => {
    if (!window.confirm("Discard this rehearsal? It is removed from your tutor account; Hamad's records are not affected.")) return;
    setBusy(true);
    try {
      await discardMockRehearsal(rehearsal.id);
      notify("Rehearsal discarded.");
      await refresh();
    } catch (cause) {
      setError(getCloudErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ screens

  if (screen.kind === "run" && current) {
    const attemptId = screen.attempt.id;
    const count = mockAttemptQuestionCount(screen.attempt);
    return (
      <MockTestRunner
        kindLabel={MOCK_PAPER_KIND}
        moduleLabel={current.paper.title}
        questions={screen.questions}
        startedAtMs={screen.attempt.startedAtMs}
        serverOffsetMs={screen.serverOffsetMs}
        durationMs={mockAttemptDurationMs(screen.attempt)}
        keystrokeLimit={mockKeystrokeLimit(count)}
        initialWork={workOf(screen.attempt)}
        onSave={work => saveMockWork(attemptId, work)}
        onFinish={async (reason, work) => {
          try {
            await finishMockAttempt(attemptId, work, reason);
          } catch (cause) {
            if (reason === "leave") throw new Error(getCloudErrorMessage(cause));
            await finalizeExpiredMockAttempt(attemptId).catch(() => { throw new Error(getCloudErrorMessage(cause)); });
          }
          notify(reason === "leave" ? "Paper forfeited and recorded." : "Paper submitted. Your answers are locked.");
          await refresh();
          setScreen({ kind: "results", paperId: current.paper.id });
        }}
      />
    );
  }

  if (screen.kind === "rehearse" && current) {
    const { pkg, rehearsal } = screen;
    const durationMs = rehearsal.durationSeconds * 1000;
    return (
      <MockTestRunner
        rehearsal="saved"
        kindLabel={MOCK_PAPER_KIND}
        moduleLabel={current.paper.title}
        questions={pkg.questions.questions}
        startedAtMs={rehearsal.startedAtMs}
        serverOffsetMs={0}
        durationMs={durationMs}
        keystrokeLimit={mockKeystrokeLimit(rehearsal.questionCount)}
        initialWork={{ answers: rehearsal.answers, flags: rehearsal.flags, dwellMs: rehearsal.dwellMs, incidents: [], keystrokes: [] }}
        onSave={async work => {
          const latest = rehearsalRef.current ?? rehearsal;
          rehearsalRef.current = await saveMockRehearsal(latest, { answers: work.answers, flags: work.flags, dwellMs: work.dwellMs ?? latest.dwellMs });
        }}
        onFinish={async (reason, work) => {
          const latest = rehearsalRef.current ?? rehearsal;
          const progress = { answers: work.answers, flags: work.flags, dwellMs: work.dwellMs ?? latest.dwellMs };
          try {
            if (reason === "leave") {
              await saveMockRehearsal(latest, progress);
              notify("Rehearsal kept on your tutor account. Resume or discard it from the paper card.");
              await refresh();
              setScreen({ kind: "list" });
              return;
            }
            const finished = await finishMockRehearsal(latest, progress, pkg.key.correct, reason);
            await refresh();
            setScreen({
              kind: "rehearsal-results",
              paperId: current.paper.id,
              local: {
                reason,
                work: { ...work, dwellMs: finished.dwellMs },
                correct: finished.correct ?? [],
                score: finished.score ?? 0,
                timeUsedMs: Math.min((finished.finishedAtMs ?? Date.now()) - finished.startedAtMs, durationMs),
                pkg,
                saved: true,
              },
            });
          } catch (cause) {
            throw new Error(getCloudErrorMessage(cause));
          }
        }}
      />
    );
  }

  if (screen.kind === "start" && current?.meta) {
    return (
      <StartScreen
        eyebrow={`${MOCK_PAPER_KIND} · ${current.paper.topic} · all modules`}
        title={current.paper.title}
        questionCount={current.meta.questionCount}
        durationMs={current.meta.durationSeconds * 1000}
        busy={busy}
        error={error}
        onCancel={back}
        onStart={() => void begin(current)}
      />
    );
  }

  if (screen.kind === "results" && current?.attempt) {
    return (
      <MockResults
        moduleLabel={current.paper.title}
        attempt={current.attempt}
        backLabel="All tests"
        onBack={back}
        breakdown={studentKey ? review => (
          <PaperBreakdownView keyDoc={studentKey} {...review} onPractise={onPracticeModule} />
        ) : undefined}
      />
    );
  }

  if (screen.kind === "rehearsal-results" && current) {
    const { local } = screen;
    return (
      <MockResults
        moduleLabel={current.paper.title}
        local={local}
        backLabel="All tests"
        onBack={back}
        breakdown={review => <PaperBreakdownView keyDoc={local.pkg.key} {...review} />}
      />
    );
  }

  // ------------------------------------------------------------------ list

  const visible = isTutor ? papers : papers.filter(entry => entry.meta?.status === "published");
  if (!loading && visible.length === 0) return null;
  const studentActive = !isTutor ? visible.find(entry => entry.attempt?.status === "active") : undefined;

  return (
    <section className="mock-papers" aria-labelledby="mock-papers-title">
      <div className="mock-papers__head">
        <div>
          <p className="mock-hub__eyebrow">One paper per CFA topic · all modules</p>
          <h3 id="mock-papers-title">{MOCK_PAPER_SECTION}</h3>
        </div>
        <ul className="mock-hub__rules" aria-label="Paper rules">
          <li><Target size={16} />44 questions</li>
          <li><Timer size={16} />66:00 total</li>
          <li><LockKeyhole size={16} />One attempt</li>
        </ul>
      </div>
      {isTutor && (
        <p className="mock-hub__note">
          <History size={16} />
          <span>
            Rehearse runs the same paper Hamad gets and is saved on your tutor account only, so a long rehearsal survives a reload. It never appears in Hamad's results.
            {" "}Upload, publish, release and reset papers in {onOpenTutorAdmin ? <button type="button" className="mock-hub__link" onClick={onOpenTutorAdmin}>Tutor Admin</button> : <strong>Tutor Admin</strong>}.
          </span>
        </p>
      )}
      {error && <p className="mock-hub__error" role="alert"><CircleAlert size={16} />{error}</p>}
      {studentActive && (
        <div className="mock-hub__resume" role="alert">
          <Clock3 size={18} />
          <span>Your <strong>{studentActive.paper.title}</strong> is in progress and its clock is still running.</span>
          <button type="button" className="mock-button mock-button--primary" disabled={busy} onClick={() => void resume(studentActive)}>
            <Maximize size={16} />Return to the paper
          </button>
        </div>
      )}
      {loading ? (
        <p className="mock-hub__loading" aria-busy="true">Loading Mastery Examinations…</p>
      ) : (
        <ul className="mock-papers__list">
          {visible.map(entry => {
            const view = isTutor ? null : mockAttemptView(entry.attempt, Date.now());
            const rehearsal = isTutor ? activeRehearsal(entry) : null;
            const finished = entry.rehearsals.filter(item => item.status === "finished").slice(0, 3);
            return (
              <li key={entry.paper.id} className="mock-paper">
                <div className="mock-paper__title">
                  <span className="mock-paper__number">{entry.paper.code}</span>
                  <div>
                    <strong>{entry.paper.title}</strong>
                    <small>
                      {entry.meta ? `${entry.meta.questionCount} questions · ${formatMockClock(entry.meta.durationSeconds * 1000)}` : "No paper yet"}
                      {isTutor && entry.meta && ` · ${entry.meta.status === "published" ? "Published" : "Draft"} · version ${entry.meta.version}`}
                    </small>
                  </div>
                </div>
                {isTutor ? (
                  <>
                    <StudentStatus attempt={entry.attempt} meta={entry.meta} />
                    {finished.length > 0 && (
                      <ul className="mock-paper__rehearsals" aria-label="Your recent rehearsals">
                        {finished.map(item => (
                          <li key={item.id}>
                            Rehearsal {new Date(item.startedAtMs).toLocaleDateString()}: {item.score}/{item.questionCount}
                            {item.finishedAtMs ? ` in ${formatMockClock(Math.min(item.finishedAtMs - item.startedAtMs, item.durationSeconds * 1000))}` : ""}
                            {item.testVersion !== entry.meta?.version ? " (older version)" : ""}
                            <button type="button" className="mock-hub__link" disabled={busy} onClick={() => void discard(item)} aria-label="Delete this rehearsal">
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mock-paper__actions">
                      <button type="button" className="mock-button mock-button--ghost" disabled={busy || !entry.meta} onClick={() => void openRehearsal(entry)}>
                        {rehearsal ? <><RotateCcw size={16} />Resume rehearsal</> : <><PlayCircle size={16} />Rehearse</>}
                      </button>
                      {rehearsal && (
                        <button type="button" className="mock-button mock-button--ghost" disabled={busy} onClick={() => void discard(rehearsal)}>
                          <Trash2 size={16} />Discard rehearsal
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="mock-paper__actions">
                    {view === "not-started" && (
                      <button type="button" className="mock-button mock-button--primary" disabled={busy} onClick={() => { setError(""); setScreen({ kind: "start", paperId: entry.paper.id }); }}>
                        <Maximize size={16} />Open
                      </button>
                    )}
                    {(view === "in-progress" || view === "expired") && (
                      <button type="button" className="mock-button mock-button--primary" disabled={busy} onClick={() => void resume(entry)}>
                        <Maximize size={16} />Resume
                      </button>
                    )}
                    {(view === "completed" || view === "forfeited") && (
                      <>
                        <span className={`mock-status mock-status--${view === "forfeited" ? "overdue" : "done"}`}>
                          {view === "forfeited" ? "Forfeited" : entry.attempt?.score === null ? "Grading" : `${entry.attempt?.score}/${mockAttemptQuestionCount(entry.attempt!)}`}
                          {entry.attempt && mockTimeUsedMs(entry.attempt) !== null && view !== "forfeited" ? ` · ${formatMockClock(mockTimeUsedMs(entry.attempt)!)}` : ""}
                        </span>
                        <button type="button" className="mock-button mock-button--ghost" onClick={() => setScreen({ kind: "results", paperId: entry.paper.id })}>
                          Results
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
