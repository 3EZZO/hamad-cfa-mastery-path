import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BookX,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Cloud,
  CloudOff,
  Calculator,
  Layers3,
  Play,
  RotateCcw,
  ShieldCheck,
  Sigma,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
  UserRoundCheck,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  listActiveStudentMembers,
  listPracticeRuns,
  listPublishedPracticeBanks,
  loadPracticeAssignment,
  loadPracticeQuestionStates,
  savePracticeQuestionState,
  savePracticeRun,
} from "../../lib/cloud";
import {
  selectPracticeQuestions,
  updatePracticeQuestionState,
} from "../../lib/practiceEngine";
import { BA2Plus } from "./BA2Plus";
import { defaultTVMState, type TVMState } from "../../lib/calculator";
import { analyzeKeystrokes } from "../../lib/calculatorDiagnostics";
import {
  buildPracticeInsights,
  type PracticeInsights,
} from "../../lib/practiceInsights";
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
import type { ErrorEntry } from "../../types";
import { buildPracticeMistake } from "../../lib/practiceMistakeBridge";
import { useDialogFocus } from "../liveSession/useDialogFocus";
import { buildFormulaSheet, countFormulae } from "../../lib/formulaSheet";
import { FormulaSheet } from "./FormulaSheet";
import { buildExamReport, examRemainingMs, formatClock } from "../../lib/examDrill";
import { setShellBusy } from "../../lib/shellBusy";
import { intentAllowedFor, parsePracticeIntent, PRACTICE_INTENTS } from "../../lib/practiceIntents";
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
  /** Files a Practice Coach miss in Mistake Review; the parent dedupes by question. */
  onAddMistake?: (entry: ErrorEntry) => void;
  /** Question ids already in Mistake Review, so the bridge can show its state. */
  bridgedQuestionIds?: ReadonlySet<string>;
  /** `#practice/<intent>` segment from the palette or a link; acted on once, then cleared. */
  intent?: string;
  onIntentHandled?: () => void;
}

type CoachView = "hub" | "run" | "results" | "formulas";
type CoachSync = "loading" | "synced" | "offline" | "saving" | "error";
type PerformanceContext = ProjectRole | "rehearsal";

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
  onAddMistake,
  bridgedQuestionIds,
  intent = "",
  onIntentHandled,
}: PracticeCoachProps) {
  const [banks, setBanks] = useState<PublishedPracticeBank[]>([]);
  const [states, setStates] = useState<Record<string, PracticeQuestionState>>({});
  const [runs, setRuns] = useState<PracticeRun[]>([]);
  const [assignedBankIds, setAssignedBankIds] = useState<string[]>([]);
  const [assignmentLoaded, setAssignmentLoaded] = useState(false);
  const [isRehearsal, setIsRehearsal] = useState(false);
  const [rehearsalStates, setRehearsalStates] = useState<Record<string, PracticeQuestionState>>({});
  const [rehearsalRuns, setRehearsalRuns] = useState<PracticeRun[]>([]);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [practiceOwnerUid, setPracticeOwnerUid] = useState<string | null>(
    role === "student" ? uid : null
  );
  const [activeRun, setActiveRun] = useState<PracticeRun | null>(null);
  const [lastCompletedRun, setLastCompletedRun] = useState<PracticeRun | null>(null);
  const [view, setView] = useState<CoachView>("hub");
  // A question on screen defers the app-update toast until the set ends.
  useEffect(() => {
    if (view !== "run") return;
    setShellBusy("practice");
    return () => setShellBusy(null);
  }, [view]);
  const [sync, setSync] = useState<CoachSync>("loading");
  const [message, setMessage] = useState("");
  const [selectedOption, setSelectedOption] = useState<0 | 1 | 2 | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [submitted, setSubmitted] = useState(false);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorLog, setCalculatorLog] = useState<any[]>([]);
  // Exam Drill clock: ticks once a second while a timed run is on screen.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const examExpiring = useRef(false);
  const [calculatorState, setCalculatorState] = useState(defaultTVMState());
  const answerStartedAt = useRef(Date.now());
  const calculatorCloseRef = useRef<HTMLButtonElement>(null);
  const calculatorDialogRef = useRef<HTMLDivElement>(null);
  const closeCalculator = useCallback(() => setShowCalculator(false), []);

  const questions = useMemo(() => banks.flatMap(bank => bank.questions), [banks]);
  const rehearsalBanks = useMemo(
    () => banks.filter(bank => assignedBankIds.includes(bank.storageId)),
    [assignedBankIds, banks]
  );
  const runnerBanks = isRehearsal ? rehearsalBanks : banks;
  // Reference material from the same cached banks, so it is available offline.
  const formulaGroups = useMemo(() => buildFormulaSheet(runnerBanks), [runnerBanks]);
  const formulaCount = countFormulae(formulaGroups);
  const runnerQuestions = useMemo(
    () => runnerBanks.flatMap(bank => bank.questions),
    [runnerBanks]
  );
  const runnerQuestionsById = useMemo(
    () => new Map(runnerQuestions.map(question => [question.id, question])),
    [runnerQuestions]
  );
  const runnerBankByQuestion = useMemo(() => {
    const result = new Map<string, string>();
    runnerBanks.forEach(bank => bank.questions.forEach(question => result.set(question.id, bank.storageId)));
    return result;
  }, [runnerBanks]);
  const runnerTopicByQuestion = useMemo(() => {
    const result = new Map<string, string>();
    runnerBanks.forEach(bank => bank.questions.forEach(question => result.set(question.id, bank.topic)));
    return result;
  }, [runnerBanks]);
  // Rehearsal never writes to Hamad's record, so the bridge is off there.
  const bridgeMiss = !isRehearsal && onAddMistake
    ? (question: PracticeQuestion, selectedOption: 0 | 1 | 2): boolean => {
        if (bridgedQuestionIds?.has(question.id)) return false;
        const entry = buildPracticeMistake({
          question,
          topic: runnerTopicByQuestion.get(question.id) ?? "",
          bankId: runnerBankByQuestion.get(question.id) ?? "unknown",
          selectedOption,
          date: today(),
        });
        if (!entry) {
          notify("This bank's topic is not a curriculum area, so the miss cannot be filed.", "warning");
          return false;
        }
        onAddMistake(entry);
        return true;
      }
    : null;
  const modules = useMemo(
    () => [...new Set(runnerQuestions.map(question => question.moduleId))],
    [runnerQuestions]
  );
  const insights = useMemo(
    () => buildPracticeInsights({ questions, states, runs }),
    [questions, runs, states]
  );
  const rehearsalInsights = useMemo(
    () => buildPracticeInsights({ questions: runnerQuestions, states: rehearsalStates, runs: rehearsalRuns }),
    [rehearsalRuns, rehearsalStates, runnerQuestions]
  );
  const runnerStates = isRehearsal ? rehearsalStates : states;
  const displayedInsights = isRehearsal ? rehearsalInsights : insights;
  const dueCount = displayedInsights.dueQuestions;
  const currentQuestions = useMemo(
    () => runQuestions(activeRun, runnerQuestionsById),
    [activeRun, runnerQuestionsById]
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

  const rememberRun = useCallback((run: PracticeRun) => {
    const update = (current: PracticeRun[]) => [run, ...current.filter(item => item.id !== run.id)];
    if (isRehearsal) setRehearsalRuns(update);
    else setRuns(update);
  }, [isRehearsal]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let ownerUid = uid;
      if (role === "tutor") {
        try {
          const students = await listActiveStudentMembers();
          ownerUid = students[0]?.uid ?? "";
          if (!ownerUid) {
            if (active) {
              setPracticeOwnerUid(null);
              setMessage("No active student membership is available for Practice reporting.");
              setSync("error");
            }
            return;
          }
        } catch {
          if (active) {
            setPracticeOwnerUid(null);
            setMessage("Hamad's Practice record could not be opened. Confirm that the latest Firestore rules are deployed.");
            setSync("error");
          }
          return;
        }
      }
      if (!active) return;
      setPracticeOwnerUid(ownerUid);
      const [cachedBanks, cachedStates, cachedRuns] = await Promise.all([
        loadCachedPracticeBanks(),
        loadCachedPracticeStates(ownerUid),
        loadCachedPracticeRuns(),
      ]);
      if (!active) return;
      if (cachedBanks.length) setBanks(cachedBanks);
      if (cachedStates.length) {
        setStates(Object.fromEntries(cachedStates.map(state => [state.questionId, state])));
      }
      const ownerCachedRuns = cachedRuns.filter(run => run.uid === ownerUid);
      setRuns(ownerCachedRuns);
      const cachedActive = cachedRuns
        .filter(run => run.uid === ownerUid && run.status === "active")
        .sort((a, b) => b.updatedAtClient.localeCompare(a.updatedAtClient))[0];
      if (role === "student" && cachedActive) setActiveRun(cachedActive);
      try {
        const [cloudBanks, assignment, cloudStates, cloudRuns] = await Promise.all([
          listPublishedPracticeBanks(),
          loadPracticeAssignment(),
          loadPracticeQuestionStates(ownerUid),
          listPracticeRuns(ownerUid),
        ]);
        if (!active) return;
        setAssignedBankIds(assignment?.bankStorageIds ?? []);
        setAssignmentLoaded(true);
        const assigned = role === "tutor"
          ? cloudBanks
          : cloudBanks.filter(bank => assignment?.bankStorageIds.includes(bank.storageId));
        setBanks(assigned);
        setStates(Object.fromEntries(cloudStates.map(state => [state.questionId, state])));
        setRuns(cloudRuns);
        const cloudActive = cloudRuns.find(run => run.status === "active");
        if (role === "student" && cloudActive) setActiveRun(cloudActive);
        await cachePracticeBanks(assigned);
        await Promise.all(cloudStates.map(state => cachePracticeState(ownerUid, state)));
        await Promise.all(cloudRuns.map(cachePracticeRun));
        setSync("synced");
        if (role === "student") void flushPending();
      } catch {
        if (!active) return;
        setAssignmentLoaded(true);
        setSync(cachedBanks.length ? "offline" : "error");
      }
    };
    void load();
    const online = () => {
      if (role === "student") void flushPending();
    };
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

  // Escape is intercepted in the document capture phase so it closes the
  // drawer without reaching the calculator's own window listener.
  useDialogFocus(showCalculator, calculatorDialogRef, calculatorCloseRef, closeCalculator);

  const begin = async (
    mode: PracticeRunMode,
    count: number,
    moduleId: string | null = null
  ) => {
    const selected = selectPracticeQuestions({
      questions: runnerQuestions,
      states: runnerStates,
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
      bankStorageIds: [...new Set(selected.map(question => runnerBankByQuestion.get(question.id)).filter(Boolean))] as string[],
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
    rememberRun(run);
    setMessage("");
    setView("run");
    if (!isRehearsal) {
      await cachePracticeRun(run);
      void writeCloud("run", run);
    }
  };

  const submitAnswer = async (options: { finishAfter?: boolean } = {}) => {
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
      calculatorLog,
    };
    const nextState = updatePracticeQuestionState({
      previous: runnerStates[currentQuestion.id],
      question: currentQuestion,
      bankStorageId: runnerBankByQuestion.get(currentQuestion.id) ?? activeRun.bankStorageIds[0] ?? "unknown",
      correct,
      confidence,
      responseMs,
    });
    const nextRun = {
      ...activeRun,
      answers: [...activeRun.answers.filter(item => item.questionId !== currentQuestion.id), answer],
      updatedAtClient: timestamp,
    };
    if (isRehearsal) {
      setRehearsalStates(current => ({ ...current, [currentQuestion.id]: nextState }));
    } else {
      setStates(current => ({ ...current, [currentQuestion.id]: nextState }));
    }
    setActiveRun(nextRun);
    rememberRun(nextRun);
    setSubmitted(true);
    if (!isRehearsal) {
      await Promise.all([
        cachePracticeState(uid, nextState),
        cachePracticeRun(nextRun),
      ]);
      void writeCloud("state", nextState);
      void writeCloud("run", nextRun);
    }
    if (options.finishAfter) await finish(nextRun);
    else if (activeRun.mode === "exam") void advance(nextRun);
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
    rememberRun(complete);
    setView("results");
    if (!isRehearsal) {
      await cachePracticeRun(complete);
      void writeCloud("run", complete);
    }
    const correct = complete.answers.filter(answer => answer.correct).length;
    // An exam counts every question: unanswered ones when the clock ran out are wrong.
    const attempted = complete.mode === "exam" ? complete.questionIds.length : complete.answers.length;
    const unanswered = complete.questionIds.length - complete.answers.length;
    const averageConfidence = complete.answers.length
      ? Math.round(complete.answers.reduce((sum, answer) => sum + answer.confidence, 0) / complete.answers.length)
      : 3;
    const topic = complete.moduleId
      ? runnerBanks.find(bank => bank.moduleIds.includes(complete.moduleId!))?.topic ?? "Quantitative Methods"
      : runnerBanks[0]?.topic ?? "Quantitative Methods";
    if (!isRehearsal) {
      onComplete({
        date: today(),
        topic,
        attempted,
        correct,
        confidence: averageConfidence,
        source: `Practice Coach · ${modeLabel(complete.mode)}`,
        note: `${correct}/${attempted} correct${complete.mode === "exam" && unanswered > 0 ? `; ${unanswered} unanswered when time expired` : ""}; detailed adaptive review retained in Practice Coach.`,
      });
      notify("Practice set completed and synchronized with the tracker.");
    }
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
    rememberRun(nextRun);
    setSubmitted(false);
    setSelectedOption(null);
    setConfidence(3);
    setCalculatorLog([]);
    setShowCalculator(false);
    answerStartedAt.current = Date.now();
    if (!isRehearsal) {
      await cachePracticeRun(nextRun);
      void writeCloud("run", nextRun);
    }
  };

  const enterRehearsal = () => {
    setRehearsalStates({});
    setRehearsalRuns([]);
    setActiveRun(null);
    setLastCompletedRun(null);
    setSelectedOption(null);
    setSubmitted(false);
    setModulePickerOpen(false);
    setMessage("");
    setView("hub");
    setIsRehearsal(true);
  };

  const exitRehearsal = () => {
    setIsRehearsal(false);
    setExitConfirmationOpen(false);
    setRehearsalStates({});
    setRehearsalRuns([]);
    setActiveRun(null);
    setLastCompletedRun(null);
    setSelectedOption(null);
    setSubmitted(false);
    setShowCalculator(false);
    setMessage("");
    setView("hub");
  };

  const requestRehearsalExit = () => {
    if (activeRun?.status === "active") setExitConfirmationOpen(true);
    else exitRehearsal();
  };

  const abandon = async () => {
    if (!activeRun) return;
    setView("hub");
  };

  // One-shot intents: wait for the banks, run the action, then clear the
  // segment so reload or back/forward does not repeat it.
  const handledIntent = useRef("");
  useEffect(() => {
    const parsed = parsePracticeIntent(intent);
    if (!parsed) { handledIntent.current = ""; return; }
    if (handledIntent.current === intent || !assignmentLoaded) return;
    handledIntent.current = intent;
    const canRun = role === "student" || isRehearsal;
    if (!intentAllowedFor(parsed, canRun)) {
      onIntentHandled?.();
      return;
    }
    const action = PRACTICE_INTENTS[parsed];
    if (action.mode === null) {
      setShowCalculator(true);
    } else if (activeRun) {
      setMessage(`Finish or leave the current ${modeLabel(activeRun.mode)} set before starting ${action.label.replace(/^Start /, "")}.`);
    } else {
      void begin(action.mode, action.count);
    }
    onIntentHandled?.();
    // `begin`/`setMessage` are stable enough for a one-shot; re-running on their identity would repeat the action.
  }, [intent, assignmentLoaded]);

  const resume = () => {
    if (!activeRun) return;
    if (!runQuestions(activeRun, runnerQuestionsById).length) {
      setMessage("This saved set needs a practice bank that is not available on this device.");
      return;
    }
    // Time away from the question is not response time.
    answerStartedAt.current = Date.now();
    setView("run");
  };

  const examOnScreen = view === "run" && activeRun?.mode === "exam" && activeRun.status === "active";
  useEffect(() => {
    if (!examOnScreen) return;
    setNowMs(Date.now());
    const handle = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(handle);
  }, [examOnScreen, activeRun?.id]);
  const examRemaining = examOnScreen && activeRun
    ? examRemainingMs(activeRun, answerStartedAt.current, nowMs)
    : null;
  useEffect(() => {
    if (examRemaining !== 0 || examExpiring.current || !activeRun) return;
    examExpiring.current = true;
    // Time is up: a marked answer counts, everything else stays unanswered.
    void (async () => {
      try {
        if (selectedOption !== null && !submitted) await submitAnswer({ finishAfter: true });
        else await finish(activeRun);
      } finally {
        examExpiring.current = false;
      }
    })();
    // Runs only on the transition to zero; the handlers read current state.
  }, [examRemaining]);

  const completedAnswers = lastCompletedRun?.answers ?? [];
  const resultCorrect = completedAnswers.filter(answer => answer.correct).length;
  // The BA II Plus drawer serves the player and the hub; keystrokes are
  // logged against an answer only while a question is on screen.
  const inRun = view === "run" && Boolean(activeRun && currentQuestion);
  const calculatorDrawer = showCalculator && (
    <>
      <div
        className="practice-calculator-backdrop"
        onClick={closeCalculator}
        aria-hidden="true"
      />
      <div
        ref={calculatorDialogRef}
        tabIndex={-1}
        className="practice-calculator-wrapper"
        role="dialog"
        aria-modal="true"
        aria-label="BA II Plus Calculator"
        onKeyDown={event => {
          // Let Enter activate the Close button natively instead of
          // being consumed as "=" by the calculator's window listener.
          if (event.key === "Enter" && event.target === calculatorCloseRef.current) event.stopPropagation();
        }}
      >
        <div className="practice-calculator-header">
          <h3>Calculator</h3>
          <button type="button" ref={calculatorCloseRef} onClick={closeCalculator} aria-label="Close calculator">
            <X size={20} />
          </button>
        </div>
        <BA2Plus
          onLog={inRun ? (log) => setCalculatorLog(prev => [...prev, log]) : () => {}}
          startTime={answerStartedAt.current}
          tvmState={calculatorState}
          onStateChange={setCalculatorState}
        />
      </div>
    </>
  );
  if ((role === "student" || isRehearsal) && view === "run" && activeRun && currentQuestion) {
    const progress = ((activeRun.currentIndex + (submitted ? 1 : 0)) / activeRun.questionIds.length) * 100;
    const correct = selectedOption === currentQuestion.correctOption;
    return (
      <section className="practice-player" aria-label={`${modeLabel(activeRun.mode)} practice set`}>
        {isRehearsal && <RehearsalBanner onExit={requestRehearsalExit} />}
        <header className="practice-player__header">
          <button type="button" onClick={abandon} aria-label="Return to Practice home"><ArrowLeft /></button>
          <div className="practice-player__identity">
            <span>{modeLabel(activeRun.mode)}</span>
            {examRemaining !== null && (
              <span
                className={`practice-exam-clock${examRemaining <= 120_000 ? " is-urgent" : ""}`}
                role="timer"
                aria-label={`Time remaining ${formatClock(examRemaining)}`}
              >
                <Clock3 size={15} aria-hidden="true" />{formatClock(examRemaining)}
              </span>
            )}
          </div>
          <div className="practice-player__utilities">
            <button
              type="button"
              className={`practice-calculator-toggle${showCalculator ? " is-active" : ""}`}
              aria-pressed={showCalculator}
              onClick={() => setShowCalculator(!showCalculator)}
            >
              <Calculator size={17} aria-hidden="true" />
              <span>BA II Plus</span>
            </button>
            {isRehearsal ? <RehearsalStatus /> : <PracticeSync state={sync} />}
          </div>
        </header>
        <div className="practice-progress-wrapper">
          <div className="practice-progress-segments" role="progressbar" aria-label="Practice-set progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            {activeRun.questionIds.map((id, index) => {
              const isFilled = index < activeRun.currentIndex || (index === activeRun.currentIndex && submitted);
              return <div key={id} className={`practice-progress-segment ${isFilled ? "is-filled" : ""}`} />;
            })}
          </div>
          <span className="practice-progress-text">
            {activeRun.currentIndex + 1} of {activeRun.questionIds.length}
          </span>
        </div>
        <div className="practice-player__layout">
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
          {calculatorDrawer}
        </div>
        <footer className="practice-player__dock">
          {!submitted ? (
            <div className="practice-submit-container">
              <button type="button" disabled={selectedOption === null} onClick={() => void submitAnswer()}>
                Submit answer <ArrowRight size={20} />
              </button>
              {selectedOption === null && <span className="practice-submit-help">Select an option to enable</span>}
            </div>
          ) : activeRun.mode !== "exam" ? (
            <button type="button" onClick={() => void advance()}>
              {activeRun.currentIndex + 1 >= activeRun.questionIds.length ? "View results" : "Next question"} <ArrowRight size={20} />
            </button>
          ) : null}
        </footer>
        {exitConfirmationOpen && (
          <RehearsalExitDialog
            onCancel={() => setExitConfirmationOpen(false)}
            onConfirm={exitRehearsal}
          />
        )}
      </section>
    );
  }

  if (view === "formulas") {
    return (
      <div className="practice-coach">
        {isRehearsal && <RehearsalBanner onExit={requestRehearsalExit} />}
        <FormulaSheet groups={formulaGroups} onBack={() => setView("hub")} />
      </div>
    );
  }

  if ((role === "student" || isRehearsal) && view === "results" && lastCompletedRun) {
    const examReport = lastCompletedRun.mode === "exam"
      ? buildExamReport(lastCompletedRun, runnerQuestionsById, id => runnerTopicByQuestion.get(id))
      : null;
    const scored = examReport ? examReport.total : completedAnswers.length;
    const percentage = scored ? Math.round((resultCorrect / scored) * 100) : 0;
    const repair = completedAnswers.filter(answer => !answer.correct || answer.confidence <= 2).length;
    
    // Analyze keystrokes for diagnostics
    const allDiagnostics = completedAnswers.flatMap(answer => 
      answer.calculatorLog ? analyzeKeystrokes(answer.calculatorLog) : []
    );
    const uniqueDiagnostics = Array.from(new Map(allDiagnostics.map(d => [d.type, d])).values());

    return (
      <section className="practice-results">
        {isRehearsal && <RehearsalBanner onExit={requestRehearsalExit} />}
        <div className="practice-celebration" aria-hidden="true" />
        <div className="practice-results__mark"><Target /></div>
        <p>{isRehearsal ? "Rehearsal complete" : "Practice set complete"}</p>
        <h2>{percentage}% accuracy</h2>
        <div className="practice-results__metrics">
          <div><strong>{resultCorrect}/{scored}</strong><span>correct</span></div>
          <div><strong>{repair}</strong><span>review due</span></div>
          <div><strong>{modeLabel(lastCompletedRun.mode)}</strong><span>set</span></div>
        </div>
        <p className="practice-results__message">
          {isRehearsal
            ? percentage >= 80
              ? "Strong rehearsal. These temporary results will be discarded when you exit."
              : "Missed and uncertain concepts are available in this rehearsal's Repair Queue until you exit."
            : percentage >= 80
              ? "Strong execution. The adaptive queue will lengthen intervals only after repeated independent success."
              : "The missed and uncertain concepts are now prioritized in your Repair Queue."}
        </p>
        
        {examReport && (
          <section className="practice-exam-report" aria-labelledby="practice-exam-report-title">
            <h3 id="practice-exam-report-title"><Clock3 size={16} aria-hidden="true" /> Exam report</h3>
            <p className="practice-exam-report__time">
              {examReport.expired
                ? `Time expired with ${examReport.unanswered} ${examReport.unanswered === 1 ? "question" : "questions"} unanswered (counted as wrong).`
                : `Finished in ${formatClock(examReport.elapsedMs)} of ${formatClock(examReport.timeLimitMs)}.`}
            </p>
            <table>
              <thead><tr><th scope="col">Section</th><th scope="col">Correct</th><th scope="col">Accuracy</th><th scope="col">Avg time</th></tr></thead>
              <tbody>
                {examReport.sections.map(section => (
                  <tr key={section.label} className={section.accuracy < 70 ? "is-weak" : undefined}>
                    <th scope="row">{section.label}</th>
                    <td>{section.correct}/{section.attempted + section.unanswered}{section.unanswered > 0 && <small> · {section.unanswered} blank</small>}</td>
                    <td>{section.accuracy}%</td>
                    <td>{section.averageResponseMs === null ? "—" : formatClock(section.averageResponseMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {uniqueDiagnostics.length > 0 && (
          <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(234, 179, 85, 0.1)', border: '1px solid #eab355', borderRadius: '8px', textAlign: 'left' }}>
            <h3 style={{ color: '#eab355', margin: '0 0 12px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CircleAlert size={16} /> Calculator Diagnostics
            </h3>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#c3cfd9', fontSize: '13px' }}>
              {uniqueDiagnostics.map(diag => (
                <li key={diag.type} style={{ marginBottom: '8px' }}>{diag.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="practice-results__actions">
          <button type="button" onClick={() => setView("hub")}>Return to Practice</button>
          {repair > 0 && <button type="button" className="is-primary" onClick={() => void begin("repair", Math.min(10, repair))}>Repair now</button>}
        </div>
      </section>
    );
  }

  return (
    <div className="practice-coach">
      {isRehearsal && <RehearsalBanner onExit={requestRehearsalExit} />}
      <section className="practice-hero">
        <div>
          <p>{isRehearsal ? "Tutor rehearsal" : role === "tutor" ? "Student performance" : "Independent practice"}</p>
          <h2>{isRehearsal ? "Experience practice as Hamad does" : role === "tutor" ? "Hamad's practice evidence" : "What should you strengthen now?"}</h2>
          <span>{isRehearsal
            ? "Use Hamad's assigned question banks in a clean sandbox. Nothing attempted here is saved."
            : role === "tutor"
            ? "A read-only view of Hamad's attempts, accuracy, confidence gaps, module health, and questions requiring review."
            : "The queue balances overdue concepts, mistakes, confidence, and response time."}</span>
        </div>
        <div className="practice-hero__actions">
          {role === "tutor" && !isRehearsal && (
            <button
              className="practice-rehearsal-launch"
              type="button"
              onClick={enterRehearsal}
              disabled={!assignmentLoaded || rehearsalBanks.length === 0}
              title={assignmentLoaded && rehearsalBanks.length === 0 ? "Assign and publish a practice bank before rehearsing." : undefined}
            >
              <Play size={17} /> Rehearse as student
            </button>
          )}
          {role === "tutor" && !isRehearsal && assignmentLoaded && rehearsalBanks.length === 0 && (
            <small className="practice-rehearsal-unavailable">Assign and publish a practice bank first.</small>
          )}
          <button
            className={`practice-calculator-toggle practice-calculator-toggle--hub${showCalculator ? " is-active" : ""}`}
            type="button"
            aria-pressed={showCalculator}
            onClick={() => setShowCalculator(value => !value)}
          >
            <Calculator size={17} aria-hidden="true" />
            <span>BA II Plus</span>
          </button>
          {isRehearsal ? <RehearsalStatus /> : <PracticeSync state={sync} />}
        </div>
      </section>
      {calculatorDrawer}

      {(role === "student" || isRehearsal) && activeRun && (
        <button className="practice-resume" type="button" onClick={resume}>
          <span><Play size={20} /></span>
          <div><small>Continue where you stopped</small><strong>{modeLabel(activeRun.mode)} · question {activeRun.currentIndex + 1} of {activeRun.questionIds.length}</strong></div>
          <ArrowRight />
        </button>
      )}

      {message && <div className="practice-message" role="status"><CircleAlert size={17} />{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss message"><X size={16} /></button></div>}

      {banks.length ? (
        <>
          <PracticePerformance
            context={isRehearsal ? "rehearsal" : role}
            insights={displayedInsights}
            bridged={isRehearsal ? undefined : bridgedQuestionIds}
            onBridgeMiss={bridgeMiss ? miss => { if (bridgeMiss(miss.question, miss.selectedOption)) notify("Added to Mistake Review with a retest in three days."); } : undefined}
          />

          {role === "tutor" && !isRehearsal && <PracticeLibrary questions={questions} />}

          {(role === "student" || isRehearsal) && <section className="practice-actions" aria-label="Start practice">
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
              <span><Clock3 /></span><div><small>Feedback at the end</small><strong>Exam Drill</strong><p>Twenty questions in 30 minutes, 90 seconds each; answers and a section report at the end.</p></div><ArrowRight />
            </button>
          </section>}

          {formulaCount > 0 && <section className="practice-reference" aria-label="Reference">
            <button className="practice-action practice-action--reference" type="button" onClick={() => setView("formulas")}>
              <span><Sigma /></span><div><small>Works offline · printable</small><strong>Formula sheet</strong><p>{formulaCount === 1 ? "1 formula" : `${formulaCount} formulae`} across {formulaGroups.length} {formulaGroups.length === 1 ? "module" : "modules"}, from the assigned banks.</p></div><ArrowRight />
            </button>
          </section>}

          {(role === "student" || isRehearsal) && <section className="practice-modules">
            <button type="button" className="practice-modules__heading" onClick={() => setModulePickerOpen(value => !value)} aria-expanded={modulePickerOpen}>
              <div><span>Choose a module</span><strong>Focused module practice</strong></div><ChevronDown />
            </button>
            {modulePickerOpen && <div>{modules.map(moduleId => {
              const moduleQuestions = runnerQuestions.filter(question => question.moduleId === moduleId);
              const attempted = moduleQuestions.filter(question => runnerStates[question.id]).length;
              return <button type="button" key={moduleId} onClick={() => void begin("module", 10, moduleId)}><div><strong>{moduleId}</strong><span>{moduleQuestions.length} questions · {attempted} attempted</span></div><ArrowRight /></button>;
            })}</div>}
          </section>}
        </>
      ) : (
        <section className="practice-empty">
          {sync === "loading" ? <><span className="practice-loading" /><h2>Preparing Practice Coach</h2><p>Loading assigned modules and the latest review schedule.</p></> : role === "tutor" && !practiceOwnerUid ? <><UserRoundCheck /><h2>Student record unavailable</h2><p>Deploy the updated Firestore rules and confirm that Hamad has one active student membership.</p></> : <><BookOpenCheck /><h2>No practice module is assigned yet</h2><p>Publish and unlock an independent question bank here. The existing manual Practice Log remains available below.</p></>}
        </section>
      )}

      {!isRehearsal && <details className="practice-manual">
        <summary><BookOpenCheck size={18} /><div><strong>Practice history and manual log</strong><span>Record work completed outside Practice Coach.</span></div><ChevronDown size={18} /></summary>
        <div>{manualLog}</div>
      </details>}
    </div>
  );
}

function RehearsalStatus() {
  return <span className="practice-rehearsal-status"><ShieldCheck size={16} />Not saved</span>;
}

function RehearsalBanner({ onExit }: { onExit: () => void }) {
  return (
    <aside className="practice-rehearsal-banner" role="status">
      <div><ShieldCheck size={18} /><span><strong>Tutor rehearsal</strong>Results are not saved to Hamad's record.</span></div>
      <button type="button" onClick={onExit}>Exit rehearsal</button>
    </aside>
  );
}

function RehearsalExitDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Same contract as the calculator drawer: focus trapped, Escape cancels
  // wherever focus is, and "Exit rehearsal" regains focus on close.
  useDialogFocus(true, dialogRef, cancelRef, onCancel);
  return (
    <div className="practice-rehearsal-dialog-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="practice-rehearsal-dialog" role="dialog" aria-modal="true" aria-labelledby="rehearsal-exit-title" aria-describedby="rehearsal-exit-description">
        <CircleAlert />
        <h2 id="rehearsal-exit-title">Discard this rehearsal?</h2>
        <p id="rehearsal-exit-description">Your unfinished answers exist only in this rehearsal and will be permanently discarded.</p>
        <div>
          <button ref={cancelRef} type="button" onClick={onCancel}>Continue rehearsing</button>
          <button type="button" className="is-danger" onClick={onConfirm}>Discard and exit</button>
        </div>
      </section>
    </div>
  );
}

function formatPracticeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function PracticePerformance({
  context,
  insights,
  bridged,
  onBridgeMiss,
}: {
  context: PerformanceContext;
  insights: PracticeInsights;
  bridged?: ReadonlySet<string>;
  onBridgeMiss?: (miss: PracticeInsights["missedQuestions"][number]) => void;
}) {
  const [showAllMisses, setShowAllMisses] = useState(false);
  const visibleMisses = showAllMisses
    ? insights.missedQuestions
    : insights.missedQuestions.slice(0, 4);
  const attemptedCoverage = insights.availableQuestions
    ? Math.round((insights.practicedQuestions / insights.availableQuestions) * 100)
    : 0;

  if (!insights.totalAttempts) {
    return (
      <section className="practice-performance practice-performance--empty">
        <BarChart3 />
        <div>
          <h3>{context === "tutor" ? "No student attempts yet" : context === "rehearsal" ? "Rehearsal evidence starts here" : "Your performance record starts here"}</h3>
          <p>{context === "tutor"
            ? "Hamad's accuracy, weak modules, and missed-question review will appear after his first submitted answers."
            : context === "rehearsal"
              ? "Complete a set to review temporary accuracy and mistakes. Everything resets when you exit rehearsal."
              : "Complete the first set to unlock accuracy, module health, and a private review of missed questions."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="practice-performance" aria-label="Practice performance and review">
      <header className="practice-performance__header">
        <div>
          <span>{context === "tutor" ? "Live student evidence" : context === "rehearsal" ? "This rehearsal" : "Your evidence"}</span>
          <h3>Performance and review</h3>
          <p>{context === "tutor"
            ? "Use the weak-module ranking and confidence gaps to choose the next coaching intervention."
            : context === "rehearsal"
              ? "Review the temporary pattern, then retry or exit without changing Hamad's record."
              : "Understand the pattern behind mistakes before starting the next set."}</p>
        </div>
        <div className="practice-performance__accuracy" aria-label={`${insights.accuracy ?? 0}% ${context === "rehearsal" ? "rehearsal" : "lifetime"} accuracy`}>
          <strong>{insights.accuracy ?? 0}%</strong>
          <span>{context === "rehearsal" ? "rehearsal accuracy" : "lifetime accuracy"}</span>
        </div>
      </header>

      <div className="practice-performance__metrics">
        <article><BookOpenCheck /><strong>{insights.totalAttempts}</strong><span>answers submitted</span></article>
        <article><TrendingUp /><strong>{insights.recentAccuracy === null ? "—" : `${insights.recentAccuracy}%`}</strong><span>last 7 days · {insights.recentAttempts} answers</span></article>
        <article><TimerReset /><strong>{insights.dueQuestions}</strong><span>questions due now</span></article>
        <article><CircleAlert /><strong>{insights.confidenceGaps}</strong><span>confidence gaps</span></article>
      </div>

      <div className="practice-performance__coverage">
        <div><strong>Question coverage</strong><span>{insights.practicedQuestions} of {insights.availableQuestions} seen · {insights.masteredQuestions} stable{insights.averageResponseSeconds === null ? "" : ` · ${insights.averageResponseSeconds}s average response`}</span></div>
        <div className="practice-performance__bar" role="progressbar" aria-label="Question coverage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={attemptedCoverage}><span style={{ width: `${attemptedCoverage}%` }} /></div>
      </div>

      <div className="practice-performance__grid">
        <section className="practice-module-health">
          <header><div><span>Priority order</span><h4>Module health</h4></div><BrainCircuit /></header>
          <div className="practice-module-health__list">
            {insights.modules.map(module => (
              <article key={module.moduleId}>
                <div className="practice-module-health__title"><strong>{module.moduleId}</strong><span>{module.attempted ? `${module.attempted} attempts` : "Not started"}</span></div>
                <div className="practice-module-health__score"><strong>{module.accuracy === null ? "—" : `${module.accuracy}%`}</strong><span>{module.due} due · {module.lapses} lapses</span></div>
                <div className="practice-performance__bar"><span style={{ width: `${module.accuracy ?? 0}%` }} /></div>
              </article>
            ))}
          </div>
        </section>

        <section className="practice-recent-sets">
          <header><div><span>Latest evidence</span><h4>Recent sets</h4></div><BarChart3 /></header>
          {insights.recentRuns.length ? (
            <div>
              {insights.recentRuns.slice(0, 6).map(run => (
                <article key={run.id}>
                  <div><strong>{modeLabel(run.mode)}</strong><span>{formatPracticeDate(run.completedAt)}</span></div>
                  <div><strong>{run.accuracy}%</strong><span>{run.correct}/{run.attempted} · confidence {run.averageConfidence}/5</span></div>
                </article>
              ))}
            </div>
          ) : <p className="practice-performance__quiet">No completed sets yet. Submitted answers are still included in the totals.</p>}
        </section>
      </div>

      <section className="practice-mistake-review">
        <header>
          <div><span>Review ledger</span><h4>Questions answered incorrectly</h4><p>{insights.missedQuestions.length} unique {insights.missedQuestions.length === 1 ? "question" : "questions"} retained with the chosen answer and correction.</p></div>
          <BookX />
        </header>
        {visibleMisses.length ? (
          <div className="practice-mistake-review__list">
            {visibleMisses.map(miss => {
              const diagnostics = miss.calculatorLog ? analyzeKeystrokes(miss.calculatorLog) : [];
              return (
              <details key={miss.question.id}>
                <summary>
                  <div><span>{miss.question.moduleId} · {formatPracticeDate(miss.answeredAt)}</span><strong>{miss.question.prompt}</strong></div>
                  <div className="practice-mistake-review__status"><span className={miss.recovered ? "is-recovered" : "is-due"}>{miss.recovered ? "Recovered" : "Review due"}</span><small>{miss.missCount > 1 ? `${miss.missCount} misses` : `confidence ${miss.confidence}/5`}</small></div>
                  <ChevronDown />
                </summary>
                <div className="practice-mistake-review__detail">
                  <div className="practice-mistake-review__answers"><p><span>Answer chosen</span><strong>{String.fromCharCode(65 + miss.selectedOption)}. {miss.question.options[miss.selectedOption]}</strong></p><p><span>Correct answer</span><strong>{String.fromCharCode(65 + miss.question.correctOption)}. {miss.question.options[miss.question.correctOption]}</strong></p></div>
                  <p>{miss.question.explanation}</p>
                  
                  {context === "tutor" && miss.calculatorLog && miss.calculatorLog.length > 0 && (
                    <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#c3cfd9' }}>Tutor Telemetry: Calculator Replay</h4>
                      {diagnostics.length > 0 && (
                        <div style={{ padding: '12px', background: 'rgba(234, 179, 85, 0.1)', border: '1px solid #eab355', borderRadius: '6px', marginBottom: '16px' }}>
                          <h5 style={{ color: '#eab355', margin: '0 0 8px 0', fontSize: '12px' }}>Diagnosed Errors</h5>
                          <ul style={{ margin: 0, paddingLeft: '16px', color: '#c3cfd9', fontSize: '12px' }}>
                            {diagnostics.map(d => <li key={d.type}>{d.message}</li>)}
                          </ul>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {miss.calculatorLog.map((log: any, i: number) => (
                          <div key={i} style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '11px', color: '#a0aec0', fontFamily: 'monospace' }}>
                            <strong style={{ color: '#fff' }}>{log.key}</strong> <span style={{ opacity: 0.5 }}>→</span> {log.display}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {miss.question.formulae.length > 0 && <div className="practice-formulae" style={{ marginTop: '16px' }}>{miss.question.formulae.map(formula => <code className="financial-expression" key={formula}>{formula}</code>)}</div>}
                  {miss.question.working.length > 0 && <ol className="practice-working financial-working">{miss.question.working.map(step => <li key={step}>{step}</li>)}</ol>}
                  <aside><ShieldCheck size={17} /><p><strong>Exam trap</strong>{miss.question.examTrap}</p></aside>
                  {onBridgeMiss && (
                    bridged?.has(miss.question.id)
                      ? <p className="practice-mistake-review__bridge is-filed"><BookX size={15} aria-hidden="true" /> In Mistake Review</p>
                      : <button type="button" className="practice-mistake-review__bridge" onClick={() => onBridgeMiss(miss)}><BookX size={15} aria-hidden="true" /> Add to Mistake Review</button>
                  )}
                </div>
              </details>
            )})}
            {insights.missedQuestions.length > 4 && <button className="practice-mistake-review__more" type="button" onClick={() => setShowAllMisses(value => !value)}>{showAllMisses ? "Show recent four" : `Show all ${insights.missedQuestions.length} questions`}</button>}
          </div>
        ) : <p className="practice-performance__quiet">No incorrect answers are recorded. Low-confidence correct answers still remain in the adaptive queue.</p>}
      </section>
    </section>
  );
}

function PracticeSync({ state }: { state: CoachSync }) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const prevState = useRef<CoachSync>(state);

  useEffect(() => {
    if (state === "synced" && prevState.current === "saving") {
      setLastSaved(new Date());
    }
    prevState.current = state;
  }, [state]);

  const content = {
    loading: { icon: Cloud, label: "Loading" },
    saving: { icon: Cloud, label: "Saving" },
    synced: { 
      icon: Check, 
      label: lastSaved ? `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Synced" 
    },
    offline: { icon: WifiOff, label: "Saved on device" },
    error: { icon: CloudOff, label: "Retry pending" },
  }[state];
  const Icon = content.icon;
  return <span className={`practice-sync is-${state}`} role="status"><Icon size={16} />{content.label}</span>;
}

function PracticeLibrary({ questions }: { questions: PracticeQuestion[] }) {
  const [openModule, setOpenModule] = useState<string | null>(null);

  const modules = useMemo(() => {
    const map = new Map<string, PracticeQuestion[]>();
    for (const q of questions) {
      const list = map.get(q.moduleId) ?? [];
      list.push(q);
      map.set(q.moduleId, list);
    }
    return Array.from(map.entries());
  }, [questions]);

  return (
    <section className="practice-library panel">
      <header className="panel-heading">
        <div>
          <p className="eyebrow">Question Library</p>
          <h3>Browse all practice questions</h3>
        </div>
        <BookOpenCheck size={21} />
      </header>
      <p className="practice-library__intro">View the complete set of questions currently assigned to the student.</p>
      <div className="practice-library__list">
        {modules.map(([moduleId, moduleQuestions]) => (
          <details
            key={moduleId}
            className="practice-library__module"
            open={openModule === moduleId}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) setOpenModule(moduleId);
              else if (openModule === moduleId) setOpenModule(null);
            }}
          >
            <summary>
              <div>
                <strong>{moduleId}</strong>
                <span>{moduleQuestions.length} questions</span>
              </div>
              <ChevronDown />
            </summary>
            <div className="practice-library__questions">
              {moduleQuestions.map((q, index) => (
                <article key={q.id} className="practice-library__question">
                  <div className="practice-question__meta">
                    <span>{q.type}</span>
                    <span>Level {q.difficulty}/5</span>
                    <span><Clock3 size={14} /> {Math.ceil(q.estimatedSeconds / 60)} min</span>
                  </div>
                  <h4>{index + 1}. {q.prompt}</h4>
                  <ul className="practice-library__options">
                    {q.options.map((opt, i) => (
                      <li key={i} className={i === q.correctOption ? "is-correct" : ""}>
                        <strong>{String.fromCharCode(65 + i)}.</strong> {opt}
                        {i === q.correctOption && <span className="practice-library__correct-badge"><CheckCircle2 size={16} /></span>}
                      </li>
                    ))}
                  </ul>
                  <div className="practice-library__explanation">
                    <p>{q.explanation}</p>
                    {q.formulae.length > 0 && <div className="practice-formulae">{q.formulae.map(formula => <code className="financial-expression" key={formula}>{formula}</code>)}</div>}
                    {q.working.length > 0 && <ol className="practice-working financial-working">{q.working.map(step => <li key={step}>{step}</li>)}</ol>}
                    {q.examTrap && (
                      <aside><ShieldCheck size={17} /><p><strong>Exam trap</strong>{q.examTrap}</p></aside>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
