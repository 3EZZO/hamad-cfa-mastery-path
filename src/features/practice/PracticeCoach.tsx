import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Cloud,
  CloudOff,
  Layers3,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  listPracticeRuns,
  listPublishedPracticeBanks,
  loadPracticeAssignment,
  loadPracticeQuestionStates,
  savePracticeQuestionState,
  savePracticeRun,
} from "../../lib/cloud";
import {
  practiceAccuracy,
  selectPracticeQuestions,
  updatePracticeQuestionState,
} from "../../lib/practiceEngine";
import {
  cachePracticeBanks,
  cachePracticeRun,
  cachePracticeState,
  loadCachedPracticeBanks,
  loadCachedPracticeRuns,
  loadCachedPracticeStates,
  loadPendingPracticeWrites,
  queuePracticeWrite,
  removePendingPracticeWrite,
} from "../../lib/practiceOffline";
import type {
  PracticeAnswerRecord,
  PracticeQuestion,
  PracticeQuestionState,
  PracticeRun,
  PracticeRunMode,
  PublishedPracticeBank,
} from "../../lib/practiceContent";
import type { ProjectRole } from "../../lib/permissions";
import "./practiceCoach.css";

export interface PracticeCompletionSummary {
  date: string;
  topic: string;
  attempted: number;
  correct: number;
  confidence: number;
  source: string;
  note: string;
}

interface PracticeCoachProps {
  uid: string;
  role: ProjectRole;
  manualLog: ReactNode;
  onComplete: (summary: PracticeCompletionSummary) => void;
  notify: (message: string, tone?: "success" | "warning") => void;
}

type CoachView = "hub" | "run" | "results";
type CoachSync = "loading" | "synced" | "offline" | "saving" | "error";

function makeId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`.toLowerCase();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function modeLabel(mode: PracticeRunMode): string {
  return {
    quick: "Quick 5",
    module: "Module practice",
    exam: "Exam drill",
    repair: "Repair queue",
    mixed: "Mixed review",
  }[mode];
}

function runQuestions(
  run: PracticeRun | null,
  questionsById: Map<string, PracticeQuestion>
): PracticeQuestion[] {
  if (!run) return [];
  return run.questionIds
    .map(id => questionsById.get(id))
    .filter((question): question is PracticeQuestion => Boolean(question));
}

export function PracticeCoach({
  uid,
  role,
  manualLog,
  onComplete,
  notify,
}: PracticeCoachProps) {
  const [banks, setBanks] = useState<PublishedPracticeBank[]>([]);
  const [states, setStates] = useState<Record<string, PracticeQuestionState>>({});
  const [activeRun, setActiveRun] = useState<PracticeRun | null>(null);
  const [lastCompletedRun, setLastCompletedRun] = useState<PracticeRun | null>(null);
  const [view, setView] = useState<CoachView>("hub");
  const [sync, setSync] = useState<CoachSync>("loading");
  const [message, setMessage] = useState("");
  const [selectedOption, setSelectedOption] = useState<0 | 1 | 2 | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [submitted, setSubmitted] = useState(false);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const answerStartedAt = useRef(Date.now());

  const questions = useMemo(() => banks.flatMap(bank => bank.questions), [banks]);
  const questionsById = useMemo(
    () => new Map(questions.map(question => [question.id, question])),
    [questions]
  );
  const bankByQuestion = useMemo(() => {
    const result = new Map<string, string>();
    banks.forEach(bank => bank.questions.forEach(question => result.set(question.id, bank.storageId)));
    return result;
  }, [banks]);
  const modules = useMemo(
    () => [...new Set(questions.map(question => question.moduleId))],
    [questions]
  );
  const dueCount = Object.values(states).filter(state => Date.parse(state.dueAt) <= Date.now()).length;
  const currentQuestions = useMemo(
    () => runQuestions(activeRun, questionsById),
    [activeRun, questionsById]
  );
  const currentQuestion = activeRun
    ? currentQuestions[activeRun.currentIndex]
    : undefined;
  const currentAnswer = activeRun && currentQuestion
    ? activeRun.answers.find(answer => answer.questionId === currentQuestion.id)
    : undefined;

  const writeCloud = useCallback(async (
    kind: "state" | "run",
    value: PracticeQuestionState | PracticeRun
  ) => {
    const pendingId = `${uid}:${kind}:${kind === "state" ? (value as PracticeQuestionState).questionId : (value as PracticeRun).id}`;
    try {
      setSync("saving");
      if (kind === "state") await savePracticeQuestionState(uid, value as PracticeQuestionState);
      else await savePracticeRun(value as PracticeRun);
      await removePendingPracticeWrite(pendingId);
      setSync("synced");
    } catch {
      await queuePracticeWrite({ id: pendingId, uid, kind, value });
      setSync(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    }
  }, [uid]);

  const flushPending = useCallback(async () => {
    const pending = await loadPendingPracticeWrites(uid);
    if (!pending.length) return;
    for (const write of pending) await writeCloud(write.kind, write.value);
  }, [uid, writeCloud]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [cachedBanks, cachedStates, cachedRuns] = await Promise.all([
        loadCachedPracticeBanks(),
        loadCachedPracticeStates(uid),
        loadCachedPracticeRuns(),
      ]);
      if (!active) return;
      if (cachedBanks.length) setBanks(cachedBanks);
      if (cachedStates.length) {
        setStates(Object.fromEntries(cachedStates.map(state => [state.questionId, state])));
      }
      const cachedActive = cachedRuns
        .filter(run => run.uid === uid && run.status === "active")
        .sort((a, b) => b.updatedAtClient.localeCompare(a.updatedAtClient))[0];
      if (cachedActive) setActiveRun(cachedActive);
      try {
        const [cloudBanks, assignment, cloudStates, cloudRuns] = await Promise.all([
          listPublishedPracticeBanks(),
          loadPracticeAssignment(),
          loadPracticeQuestionStates(uid),
          listPracticeRuns(uid),
        ]);
        if (!active) return;
        const assigned = role === "tutor"
          ? cloudBanks
          : cloudBanks.filter(bank => assignment?.bankStorageIds.includes(bank.storageId));
        setBanks(assigned);
        setStates(Object.fromEntries(cloudStates.map(state => [state.questionId, state])));
        const cloudActive = cloudRuns.find(run => run.status === "active");
        if (cloudActive) setActiveRun(cloudActive);
        await cachePracticeBanks(assigned);
        await Promise.all(cloudStates.map(state => cachePracticeState(uid, state)));
        await Promise.all(cloudRuns.map(cachePracticeRun));
        setSync("synced");
        void flushPending();
      } catch {
        if (!active) return;
        setSync(cachedBanks.length ? "offline" : "error");
      }
    };
    void load();
    const online = () => void flushPending();
    window.addEventListener("online", online);
    return () => {
      active = false;
      window.removeEventListener("online", online);
    };
  }, [flushPending, role, uid]);

  useEffect(() => {
    if (!currentQuestion) return;
    const answer = activeRun?.answers.find(item => item.questionId === currentQuestion.id);
    setSelectedOption(answer?.selectedOption ?? null);
    setConfidence(answer?.confidence ?? 3);
    setSubmitted(Boolean(answer));
    answerStartedAt.current = Date.now();
  }, [activeRun?.currentIndex, currentQuestion?.id]);

  const begin = async (
    mode: PracticeRunMode,
    count: number,
    moduleId: string | null = null
  ) => {
    const selected = selectPracticeQuestions({
      questions,
      states,
      mode,
      count,
      moduleId,
    });
    if (!selected.length) {
      setMessage(mode === "repair" ? "No repair questions are due. Start a mixed review instead." : "No questions are available for this selection.");
      return;
    }
    const timestamp = new Date().toISOString();
    const run: PracticeRun = {
      id: makeId("practice"),
      uid,
      mode,
      bankStorageIds: [...new Set(selected.map(question => bankByQuestion.get(question.id)).filter(Boolean))] as string[],
      moduleId,
      questionIds: selected.map(question => question.id),
      answers: [],
      currentIndex: 0,
      status: "active",
      startedAtClient: timestamp,
      updatedAtClient: timestamp,
      completedAtClient: null,
    };
    setActiveRun(run);
    setMessage("");
    setView("run");
    await cachePracticeRun(run);
    void writeCloud("run", run);
  };

  const submitAnswer = async () => {
    if (!activeRun || !currentQuestion || selectedOption === null || submitted) return;
    const timestamp = new Date().toISOString();
    const responseMs = Math.max(1_000, Date.now() - answerStartedAt.current);
    const correct = selectedOption === currentQuestion.correctOption;
    const answer: PracticeAnswerRecord = {
      questionId: currentQuestion.id,
      selectedOption,
      correct,
      confidence,
      responseMs,
      answeredAt: timestamp,
    };
    const nextState = updatePracticeQuestionState({
      previous: states[currentQuestion.id],
      question: currentQuestion,
      bankStorageId: bankByQuestion.get(currentQuestion.id) ?? activeRun.bankStorageIds[0] ?? "unknown",
      correct,
      confidence,
      responseMs,
    });
    const nextRun = {
      ...activeRun,
      answers: [...activeRun.answers.filter(item => item.questionId !== currentQuestion.id), answer],
      updatedAtClient: timestamp,
    };
    setStates(current => ({ ...current, [currentQuestion.id]: nextState }));
    setActiveRun(nextRun);
    setSubmitted(true);
    await Promise.all([
      cachePracticeState(uid, nextState),
      cachePracticeRun(nextRun),
    ]);
    void writeCloud("state", nextState);
    void writeCloud("run", nextRun);
    if (activeRun.mode === "exam") void advance(nextRun);
  };

  const finish = async (run: PracticeRun) => {
    const timestamp = new Date().toISOString();
    const complete: PracticeRun = {
      ...run,
      status: "completed",
      currentIndex: run.questionIds.length,
      updatedAtClient: timestamp,
      completedAtClient: timestamp,
    };
    setActiveRun(null);
    setLastCompletedRun(complete);
    setView("results");
    await cachePracticeRun(complete);
    void writeCloud("run", complete);
    const correct = complete.answers.filter(answer => answer.correct).length;
    const averageConfidence = complete.answers.length
      ? Math.round(complete.answers.reduce((sum, answer) => sum + answer.confidence, 0) / complete.answers.length)
      : 3;
    const topic = complete.moduleId
      ? banks.find(bank => bank.moduleIds.includes(complete.moduleId!))?.topic ?? "Quantitative Methods"
      : banks[0]?.topic ?? "Quantitative Methods";
    onComplete({
      date: today(),
      topic,
      attempted: complete.answers.length,
      correct,
      confidence: averageConfidence,
      source: `Practice Coach · ${modeLabel(complete.mode)}`,
      note: `${correct}/${complete.answers.length} correct; detailed adaptive review retained in Practice Coach.`,
    });
    notify("Practice set completed and synchronized with the tracker.");
  };

  const advance = async (run = activeRun) => {
    if (!run) return;
    if (run.currentIndex + 1 >= run.questionIds.length) {
      await finish(run);
      return;
    }
    const nextRun = {
      ...run,
      currentIndex: run.currentIndex + 1,
      updatedAtClient: new Date().toISOString(),
    };
    setActiveRun(nextRun);
    setSubmitted(false);
    setSelectedOption(null);
    await cachePracticeRun(nextRun);
    void writeCloud("run", nextRun);
  };

  const abandon = async () => {
    if (!activeRun) return;
    setView("hub");
  };

  const resume = () => {
    if (!activeRun) return;
    if (!runQuestions(activeRun, questionsById).length) {
      setMessage("This saved set needs a practice bank that is not available on this device.");
      return;
    }
    setView("run");
  };

  const completedAnswers = lastCompletedRun?.answers ?? [];
  const resultCorrect = completedAnswers.filter(answer => answer.correct).length;
  const globalAccuracy = practiceAccuracy(Object.values(states));

  if (view === "run" && activeRun && currentQuestion) {
    const progress = ((activeRun.currentIndex + (submitted ? 1 : 0)) / activeRun.questionIds.length) * 100;
    const correct = selectedOption === currentQuestion.correctOption;
    return (
      <section className="practice-player" aria-label={`${modeLabel(activeRun.mode)} practice set`}>
        <header className="practice-player__header">
          <button type="button" onClick={abandon} aria-label="Return to Practice home"><ArrowLeft /></button>
          <div>
            <span>{modeLabel(activeRun.mode)}</span>
          </div>
          <PracticeSync state={sync} />
        </header>
        <div className="practice-progress-segments" role="progressbar" aria-label="Practice-set progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          {activeRun.questionIds.map((id, index) => {
            const isFilled = index < activeRun.currentIndex || (index === activeRun.currentIndex && submitted);
            return <div key={id} className={`practice-progress-segment ${isFilled ? "is-filled" : ""}`} />;
          })}
        </div>
        <main className="practice-question practice-slide-in" key={currentQuestion.id}>
          <div className="practice-question__meta">
            <span>{currentQuestion.moduleId}</span>
            <span>Level {currentQuestion.difficulty}/5</span>
            <span><Clock3 size={14} /> {Math.ceil(currentQuestion.estimatedSeconds / 60)} min</span>
          </div>
          <h2>{currentQuestion.prompt}</h2>
          <div className="practice-options" role="radiogroup" aria-label="Answer choices">
            {currentQuestion.options.map((option, index) => {
              const optionIndex = index as 0 | 1 | 2;
              const selected = selectedOption === optionIndex;
              const className = submitted
                ? optionIndex === currentQuestion.correctOption
                  ? "is-correct"
                  : selected
                    ? "is-incorrect"
                    : ""
                : selected
                  ? "is-selected"
                  : "";
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={submitted}
                  className={className}
                  key={option}
                  onClick={() => setSelectedOption(optionIndex)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  <strong>{option}</strong>
                  {submitted && optionIndex === currentQuestion.correctOption && <CheckCircle2 size={20} className="icon-draw-in" />}
                  {submitted && selected && !correct && <X size={20} className="icon-draw-in" />}
                </button>
              );
            })}
          </div>
          {!submitted && (
            <fieldset className="practice-confidence">
              <legend>How confident are you?</legend>
              <div>
                {[1, 2, 3, 4, 5].map(value => (
                  <button type="button" aria-pressed={confidence === value} key={value} onClick={() => setConfidence(value)}>{value}</button>
                ))}
              </div>
              <small>1 = guessing · 5 = certain</small>
            </fieldset>
          )}
          {submitted && activeRun.mode !== "exam" && (
            <section className={`practice-feedback ${correct ? "is-correct" : "is-repair"}`} aria-live="polite">
              <header>{correct ? <CheckCircle2 /> : <CircleAlert />}<div><span>{correct ? "Correct" : "Repair this concept"}</span><strong>{currentQuestion.options[currentQuestion.correctOption]}</strong></div></header>
              <p>{currentQuestion.explanation}</p>
              {currentQuestion.formulae.length > 0 && <div className="practice-formulae">{currentQuestion.formulae.map(formula => <code className="financial-expression" key={formula}>{formula}</code>)}</div>}
              {currentQuestion.working.length > 0 && <ol className="practice-working financial-working">{currentQuestion.working.map(step => <li key={step}>{step}</li>)}</ol>}
              <details>
                <summary>Why the other choices are wrong <ChevronDown size={16} /></summary>
                {currentQuestion.options.map((option, index) => index === currentQuestion.correctOption ? null : (
                  <p key={option}><strong>{String.fromCharCode(65 + index)}.</strong> {currentQuestion.distractorExplanations[index]}</p>
                ))}
              </details>
              <aside><ShieldCheck size={17} /><p><strong>Exam trap</strong>{currentQuestion.examTrap}</p></aside>
            </section>
          )}
        </main>
        <footer className="practice-player__dock">
          {!submitted ? (
            <button type="button" disabled={selectedOption === null} onClick={() => void submitAnswer()}>
              Submit answer <ArrowRight size={20} />
            </button>
          ) : activeRun.mode !== "exam" ? (
            <button type="button" onClick={() => void advance()}>
              {activeRun.currentIndex + 1 >= activeRun.questionIds.length ? "View results" : "Next question"} <ArrowRight size={20} />
            </button>
          ) : null}
        </footer>
      </section>
    );
  }

  if (view === "results" && lastCompletedRun) {
    const percentage = completedAnswers.length ? Math.round((resultCorrect / completedAnswers.length) * 100) : 0;
    const repair = completedAnswers.filter(answer => !answer.correct || answer.confidence <= 2).length;
    return (
      <section className="practice-results">
        <div className="practice-celebration" aria-hidden="true" />
        <div className="practice-results__mark"><Target /></div>
        <p>Practice set complete</p>
        <h2>{percentage}% accuracy</h2>
        <div className="practice-results__metrics">
          <div><strong>{resultCorrect}/{completedAnswers.length}</strong><span>correct</span></div>
          <div><strong>{repair}</strong><span>review due</span></div>
          <div><strong>{modeLabel(lastCompletedRun.mode)}</strong><span>set</span></div>
        </div>
        <p className="practice-results__message">
          {percentage >= 80 ? "Strong execution. The adaptive queue will lengthen intervals only after repeated independent success." : "The missed and uncertain concepts are now prioritized in your Repair Queue."}
        </p>
        <div className="practice-results__actions">
          <button type="button" onClick={() => setView("hub")}>Return to Practice</button>
          {repair > 0 && <button type="button" className="is-primary" onClick={() => void begin("repair", Math.min(10, repair))}>Repair now</button>}
        </div>
      </section>
    );
  }

  return (
    <div className="practice-coach">
      <section className="practice-hero">
        <div>
          <p>Independent practice</p>
          <h2>What should you strengthen now?</h2>
          <span>The queue balances overdue concepts, mistakes, confidence, and response time.</span>
        </div>
        <PracticeSync state={sync} />
      </section>

      {activeRun && (
        <button className="practice-resume" type="button" onClick={resume}>
          <span><Play size={20} /></span>
          <div><small>Continue where you stopped</small><strong>{modeLabel(activeRun.mode)} · question {activeRun.currentIndex + 1} of {activeRun.questionIds.length}</strong></div>
          <ArrowRight />
        </button>
      )}

      {message && <div className="practice-message" role="status"><CircleAlert size={17} />{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss message"><X size={16} /></button></div>}

      {banks.length ? (
        <>
          <section className="practice-snapshot" aria-label="Practice snapshot">
            <article><BrainCircuit /><div><strong>{questions.length}</strong><span>available questions</span></div></article>
            <article><TimerReset /><div><strong>{dueCount}</strong><span>reviews due</span></div></article>
            <article><Target /><div><strong>{globalAccuracy === null ? "—" : `${globalAccuracy}%`}</strong><span>lifetime accuracy</span></div></article>
          </section>

          <section className="practice-actions" aria-label="Start practice">
            <button className="practice-action is-primary" type="button" onClick={() => void begin("quick", 5)}>
              <span><Sparkles /></span><div><small>Recommended now</small><strong>Quick 5</strong><p>Five adaptive questions for a focused mobile study break.</p></div><ArrowRight />
            </button>
            <button className="practice-action" type="button" onClick={() => void begin("repair", 10)}>
              <span><RotateCcw /></span><div><small>{dueCount} reviews due</small><strong>Repair Queue</strong><p>Revisit mistakes, uncertainty, and slow responses.</p></div><ArrowRight />
            </button>
            <button className="practice-action" type="button" onClick={() => void begin("mixed", 20)}>
              <span><Layers3 /></span><div><small>Across unlocked modules</small><strong>Mixed Review</strong><p>Twenty questions with deliberate topic variety.</p></div><ArrowRight />
            </button>
            <button className="practice-action" type="button" onClick={() => void begin("exam", 20)}>
              <span><Clock3 /></span><div><small>Feedback at the end</small><strong>Exam Drill</strong><p>Timed practice without immediate answer disclosure.</p></div><ArrowRight />
            </button>
          </section>

          <section className="practice-modules">
            <button type="button" className="practice-modules__heading" onClick={() => setModulePickerOpen(value => !value)} aria-expanded={modulePickerOpen}>
              <div><span>Choose a module</span><strong>Focused module practice</strong></div><ChevronDown />
            </button>
            {modulePickerOpen && <div>{modules.map(moduleId => {
              const moduleQuestions = questions.filter(question => question.moduleId === moduleId);
              const attempted = moduleQuestions.filter(question => states[question.id]).length;
              return <button type="button" key={moduleId} onClick={() => void begin("module", 10, moduleId)}><div><strong>{moduleId}</strong><span>{moduleQuestions.length} questions · {attempted} attempted</span></div><ArrowRight /></button>;
            })}</div>}
          </section>
        </>
      ) : (
        <section className="practice-empty">
          {sync === "loading" ? <><span className="practice-loading" /><h2>Preparing Practice Coach</h2><p>Loading assigned modules and your latest review schedule.</p></> : <><BookOpenCheck /><h2>No practice module is assigned yet</h2><p>Mohamed will publish and unlock an independent question bank here. Your existing manual Practice Log remains available below.</p></>}
        </section>
      )}

      <details className="practice-manual">
        <summary><BookOpenCheck size={18} /><div><strong>Practice history and manual log</strong><span>Record work completed outside Practice Coach.</span></div><ChevronDown size={18} /></summary>
        <div>{manualLog}</div>
      </details>
    </div>
  );
}

function PracticeSync({ state }: { state: CoachSync }) {
  const content = {
    loading: { icon: Cloud, label: "Loading" },
    saving: { icon: Cloud, label: "Saving" },
    synced: { icon: Check, label: "Synced" },
    offline: { icon: WifiOff, label: "Saved on device" },
    error: { icon: CloudOff, label: "Retry pending" },
  }[state];
  const Icon = content.icon;
  return <span className={`practice-sync is-${state}`} role="status"><Icon size={16} />{content.label}</span>;
}
