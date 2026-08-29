import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  Cloud,
  CloudOff,
  Command,
  Flag,
  Layers3,
  MonitorUp,
  Pause,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandidatePromptView } from "./CandidatePromptView";
import { EvidenceRepairFlow } from "./EvidenceRepairFlow";
import { MasteryRadar } from "./MasteryRadar";
import { ReferenceDrawer } from "./ReferenceDrawer";
import {
  canRecordEvidenceDraft,
  calculateSessionDeckProgress,
  flattenSessionDecks,
  latestEvidenceByTarget,
  resolveForwardDeck,
  sessionDeckKey,
  type SessionDeck,
} from "./sessionDeckModel";
import { StageCard } from "./StageCard";
import type { SessionTimerController } from "./useSessionTimer";
import { formatSessionTime } from "./useSessionTimer";
import type {
  EvidenceDraft,
  EvidenceVerdict,
  LiveSessionDescriptor,
  LiveSessionEvidence,
  LiveSessionQuestion,
  LiveSessionReference,
  LiveSessionRoute,
  LiveSessionStage,
  SyncPresentation,
  TeachingFlowStep,
} from "./types";

export interface LiveSessionRunnerProps {
  session: LiveSessionDescriptor;
  route: LiveSessionRoute;
  stages: LiveSessionStage[];
  references: LiveSessionReference[];
  timer: SessionTimerController;
  evidence: LiveSessionEvidence[];
  completedDeskIds: string[];
  initialStageIndex?: number;
  initialQuestionIndex?: number;
  syncState?: SyncPresentation;
  syncMessage?: string;
  onEvidence: (entry: LiveSessionEvidence) => void;
  onDeskCompletionChange: (deskKey: string, complete: boolean) => void;
  onPositionChange?: (stageIndex: number, questionIndex: number) => void;
  onRequestCloseout: () => void;
  onExit?: () => void;
}

type ResultFilter =
  | "all"
  | "uncovered"
  | "core"
  | "reinforcement"
  | "stretch"
  | "open"
  | EvidenceVerdict;
type QueueMode = "core" | "core-plus" | "all" | "stretch";

interface CommandDeskResult {
  key: string;
  stageIndex: number;
  questionIndex: number;
  stage: LiveSessionStage;
  question?: LiveSessionQuestion;
  verdict?: EvidenceVerdict;
  deck: SessionDeck;
  searchable: string;
}

const EMPTY_DRAFT: EvidenceDraft = {
  verdict: null,
  confidence: 3,
  errorCodes: [],
  note: "",
};

function makeEvidenceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `evidence-${crypto.randomUUID()}`;
  }
  return `evidence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable='true'], [role='dialog']",
    ),
  );
}

function syncCopy(state: SyncPresentation): { label: string; icon: typeof Cloud } {
  if (state === "offline") return { label: "Offline ready", icon: CloudOff };
  if (state === "error") return { label: "Sync issue", icon: CircleAlert };
  if (state === "saving") return { label: "Saving", icon: Cloud };
  return { label: "Synced", icon: CheckCircle2 };
}

function resultLabel(result: CommandDeskResult): string {
  return result.question?.title || result.question?.label || result.stage.title;
}

function isEvidenceTarget(question?: LiveSessionQuestion): boolean {
  return question?.kind === "question";
}

function deckMatchesQueue(deck: SessionDeck, mode: QueueMode): boolean {
  const tier = deck.question?.tier ?? "core";
  if (mode === "all") return true;
  if (mode === "stretch") return tier === "stretch";
  if (mode === "core-plus") return tier !== "stretch";
  return tier === "core";
}

function queueName(mode: QueueMode): string {
  if (mode === "all") return "All curriculum decks";
  if (mode === "core-plus") return "Core + reinforcement";
  if (mode === "stretch") return "Stretch proofs";
  return "Core session queue";
}

const REFERENCE_STOP_WORDS = new Set([
  "about", "after", "answer", "before", "calculate", "explain", "from",
  "hamad", "into", "method", "question", "return", "stage", "that",
  "their", "this", "what", "when", "which", "with", "your",
]);

function referenceTokens(value: string): string[] {
  return [...new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(token => token.length >= 4 && !REFERENCE_STOP_WORDS.has(token)),
  )];
}

export function LiveSessionRunner({
  session,
  route,
  stages,
  references,
  timer,
  evidence,
  completedDeskIds,
  initialStageIndex = 0,
  initialQuestionIndex = 0,
  syncState = "synced",
  syncMessage,
  onEvidence,
  onDeskCompletionChange,
  onPositionChange,
  onRequestCloseout,
  onExit,
}: LiveSessionRunnerProps) {
  const safeInitialStage = Math.min(
    Math.max(0, initialStageIndex),
    Math.max(0, stages.length - 1),
  );
  const [stageIndex, setStageIndex] = useState(safeInitialStage);
  const [questionIndex, setQuestionIndex] = useState(Math.max(0, initialQuestionIndex));
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [queueMode, setQueueMode] = useState<QueueMode>("all");
  const [flowStep, setFlowStep] = useState<TeachingFlowStep>("teach");
  const [deskElapsedSeconds, setDeskElapsedSeconds] = useState(0);
  const [deskTimerRunning, setDeskTimerRunning] = useState(false);
  const [advanceHint, setAdvanceHint] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const stage = stages[stageIndex] ?? stages[0];
  const questions = stage?.questions ?? [];
  const safeQuestionIndex = Math.min(questionIndex, Math.max(0, questions.length - 1));
  const question = questions[safeQuestionIndex];
  const allDecks = useMemo(() => flattenSessionDecks(stages), [stages]);
  const currentDeck = allDecks.find(
    deck =>
      deck.stageIndex === stageIndex &&
      deck.questionIndex === safeQuestionIndex,
  );
  const queueDecks = useMemo(
    () => allDecks.filter(deck => deckMatchesQueue(deck, queueMode)),
    [allDecks, queueMode],
  );
  const evidenceTarget = isEvidenceTarget(question);
  const targetId = question?.id ?? stage?.id ?? "unknown";
  const currentDeskKey = sessionDeckKey(stage?.id ?? "unknown", targetId);
  const deskComplete = completedDeskIds.includes(currentDeskKey);
  const targetLabel = question
    ? `${question.label ?? `Proof ${safeQuestionIndex + 1}`} · ${question.id}`
    : stage?.title ?? "Stage evidence";
  const stageTargetIds = new Set(
    questions.filter(isEvidenceTarget).map(item => item.id),
  );
  const currentEvidence = evidence.filter(
    item => item.stageId === stage?.id && stageTargetIds.has(item.targetId),
  );
  const stageEvidenceCount = new Set(currentEvidence.map(item => item.targetId)).size;
  const stageTargetCount = stageTargetIds.size;
  const latestEvidence = useMemo(() => latestEvidenceByTarget(evidence), [evidence]);
  const SyncIcon = syncCopy(syncState).icon;

  const isDeckCovered = useCallback(
    (deck: SessionDeck) =>
      completedDeskIds.includes(deck.key) ||
      (deck.isProof && latestEvidence.has(deck.targetId)),
    [completedDeskIds, latestEvidence],
  );

  useEffect(() => {
    if (questionIndex !== safeQuestionIndex) setQuestionIndex(safeQuestionIndex);
  }, [questionIndex, safeQuestionIndex]);

  useEffect(() => {
    onPositionChange?.(stageIndex, safeQuestionIndex);
  }, [onPositionChange, safeQuestionIndex, stageIndex]);

  const changePosition = useCallback(
    (nextStage: number, nextQuestion: number) => {
      setStageIndex(Math.min(Math.max(0, nextStage), Math.max(0, stages.length - 1)));
      setQuestionIndex(Math.max(0, nextQuestion));
      setDraft(EMPTY_DRAFT);
      setFlowStep("teach");
      setDeskTimerRunning(false);
      setAdvanceHint("");
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [stages.length],
  );

  const navigateToDeck = useCallback(
    (deck: SessionDeck) => changePosition(deck.stageIndex, deck.questionIndex),
    [changePosition],
  );

  const moveForward = useCallback((treatCurrentAsCovered = false) => {
    if (!currentDeck) return;
    const resolution = resolveForwardDeck({
      currentDeck,
      queueDecks,
      allDecks,
      evidence,
      coveredDeckKeys: completedDeskIds,
      treatCurrentAsCovered,
    });
    if (resolution.nextDeck) {
      if (resolution.expandedToAll) setQueueMode("all");
      return navigateToDeck(resolution.nextDeck);
    }
    if (!resolution.canCloseout) {
      setAdvanceHint("Cover this teaching deck or record evidence before closeout.");
      return;
    }
    onRequestCloseout();
  }, [
    allDecks,
    completedDeskIds,
    currentDeck,
    evidence,
    navigateToDeck,
    onRequestCloseout,
    queueDecks,
  ]);

  const goPrevious = useCallback(() => {
    if (!currentDeck) return;
    const exactIndex = queueDecks.findIndex(deck => deck.key === currentDeck.key);
    const previous = exactIndex >= 0
      ? queueDecks[exactIndex - 1]
      : [...queueDecks]
          .reverse()
          .find(deck => deck.globalIndex < currentDeck.globalIndex);
    if (previous) navigateToDeck(previous);
  }, [currentDeck, navigateToDeck, queueDecks]);

  const recordEvidence = useCallback(() => {
    const verdict = draft.verdict;
    if (!stage || !evidenceTarget || !verdict || !canRecordEvidenceDraft(draft)) return;
    onEvidence({
      id: makeEvidenceId(),
      stageId: stage.id,
      targetId,
      targetLabel,
      verdict,
      confidence: draft.confidence,
      errorCodes: verdict === "repair" ? draft.errorCodes : [],
      note: draft.note.trim(),
      recordedAt: new Date().toISOString(),
    });
    onDeskCompletionChange(currentDeskKey, true);
    setDraft(EMPTY_DRAFT);
    moveForward(true);
  }, [
    currentDeskKey,
    draft,
    evidenceTarget,
    moveForward,
    onDeskCompletionChange,
    onEvidence,
    stage,
    targetId,
    targetLabel,
  ]);

  const selectVerdict = useCallback((verdict: EvidenceVerdict) => {
    if (!evidenceTarget) return;
    setDraft(current => ({
      ...current,
      verdict,
      errorCodes: verdict === "repair" ? current.errorCodes : [],
    }));
  }, [evidenceTarget]);

  useEffect(() => {
    setDeskElapsedSeconds(0);
    setDeskTimerRunning(false);
  }, [currentDeskKey]);

  useEffect(() => {
    if (!deskTimerRunning || timer.status !== "running") return;
    const interval = window.setInterval(
      () => setDeskElapsedSeconds(value => value + 1),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, [deskTimerRunning, timer.status]);

  const markDeskCompleteAndContinue = useCallback(() => {
    if (!deskComplete) onDeskCompletionChange(currentDeskKey, true);
    moveForward(true);
  }, [currentDeskKey, deskComplete, moveForward, onDeskCompletionChange]);

  const selectFlowStep = useCallback(
    (step: TeachingFlowStep) => {
      if (step === "ask" && flowStep !== "ask") {
        setDeskElapsedSeconds(0);
        setDeskTimerRunning(true);
      } else if (step !== "ask") {
        setDeskTimerRunning(false);
      }
      setFlowStep(step);
    },
    [flowStep],
  );

  const openCandidateView = useCallback(() => {
    selectFlowStep("ask");
    setCandidateOpen(true);
  }, [selectFlowStep]);

  const focusEvidencePanel = useCallback(() => {
    setDeskTimerRunning(false);
    setAdvanceHint(
      "Choose a verdict and save the evidence. Use Defer with a short reason when this proof must wait.",
    );
    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>("#ls-evidence-panel");
      const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      panel?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
      panel?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const advanceCurrentDeck = useCallback(() => {
    if (!currentDeck) return;
    if (evidenceTarget && !isDeckCovered(currentDeck)) {
      if (canRecordEvidenceDraft(draft)) {
        recordEvidence();
      } else {
        focusEvidencePanel();
      }
      return;
    }
    if (!evidenceTarget && !deskComplete) {
      onDeskCompletionChange(currentDeskKey, true);
    }
    moveForward(true);
  }, [
    currentDeck,
    currentDeskKey,
    deskComplete,
    draft,
    evidenceTarget,
    focusEvidencePanel,
    isDeckCovered,
    moveForward,
    onDeskCompletionChange,
    recordEvidence,
  ]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (candidateOpen || referenceOpen) return;
      if (event.key === "/" && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isInteractiveTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        timer.toggle();
      } else if (key === "v") {
        event.preventDefault();
        openCandidateView();
      } else if (key === "1") {
        event.preventDefault();
        selectFlowStep("teach");
      } else if (key === "2") {
        event.preventDefault();
        selectFlowStep("ask");
      } else if (key === "3") {
        event.preventDefault();
        selectFlowStep("answer");
      } else if (key === "f") {
        event.preventDefault();
        setReferenceOpen(true);
      } else if (key === "c") {
        event.preventDefault();
        selectVerdict("correct");
      } else if (key === "l") {
        event.preventDefault();
        selectVerdict("partial");
      } else if (key === "r") {
        event.preventDefault();
        selectVerdict("repair");
      } else if (key === "p") {
        event.preventDefault();
        selectVerdict("parked");
      } else if (key === "n") {
        event.preventDefault();
        advanceCurrentDeck();
      } else if (key === "b") {
        event.preventDefault();
        goPrevious();
      } else if (key === "enter" && draft.verdict) {
        event.preventDefault();
        recordEvidence();
      } else if (key === "?") {
        event.preventDefault();
        setShortcutsOpen(value => !value);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    advanceCurrentDeck,
    candidateOpen,
    draft.verdict,
    goPrevious,
    openCandidateView,
    recordEvidence,
    referenceOpen,
    selectFlowStep,
    selectVerdict,
    timer,
  ]);
  const commandDeskResults = useMemo<CommandDeskResult[]>(() => {
    return allDecks.map(deck => {
      const item = deck.stage;
      const itemQuestion = deck.question;
      const verdict = latestEvidence.get(deck.targetId)?.verdict;
      return {
        key: deck.key,
        stageIndex: deck.stageIndex,
        questionIndex: deck.questionIndex,
        stage: item,
        question: itemQuestion,
        verdict,
        deck,
        searchable: [
          item.label,
          item.title,
          item.objective,
          itemQuestion?.id,
          itemQuestion?.title,
          itemQuestion?.concept,
          itemQuestion?.explanation,
          itemQuestion?.prompt,
          itemQuestion?.answer,
          itemQuestion?.spokenAnswer,
          itemQuestion?.rationale,
          itemQuestion?.tier,
          ...(itemQuestion?.tags ?? []),
        ].filter(Boolean).join(" ").toLowerCase(),
      };
    });
  }, [allDecks, latestEvidence]);

  const filteredResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return commandDeskResults.filter(result => {
      const searchMatch = !normalized || result.searchable.includes(normalized);
      const covered =
        completedDeskIds.includes(result.deck.key) || Boolean(result.verdict);
      const filterMatch =
        resultFilter === "all"
          ? true
          : resultFilter === "uncovered"
            ? !covered
            : ["core", "reinforcement", "stretch"].includes(resultFilter)
              ? (result.question?.tier ?? "core") === resultFilter
              : resultFilter === "open"
                ? isEvidenceTarget(result.question) && !result.verdict
                : isEvidenceTarget(result.question) && result.verdict === resultFilter;
      return searchMatch && filterMatch;
    });
  }, [commandDeskResults, completedDeskIds, query, resultFilter]);

  const showSearchResults = Boolean(query.trim()) || resultFilter !== "all";
  const evidenceTargetIds = useMemo(
    () =>
      new Set(
        commandDeskResults
          .filter(result => isEvidenceTarget(result.question))
          .map(result => result.question!.id),
      ),
    [commandDeskResults],
  );
  const targetEvidence = useMemo(
    () =>
      [...latestEvidence.values()].filter(entry =>
        evidenceTargetIds.has(entry.targetId),
      ),
    [evidenceTargetIds, latestEvidence],
  );
  const activeReferenceIds = useMemo(() => {
    const tokens = referenceTokens(
      [
        stage?.title,
        stage?.objective,
        question?.title,
        question?.concept,
        question?.prompt,
        ...(question?.tags ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    );
    return references
      .map(reference => {
        const searchable = [
          reference.title,
          reference.category,
          reference.summary ?? "",
          ...(reference.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return {
          id: reference.id,
          score: tokens.reduce(
            (total, token) => total + (searchable.includes(token) ? 1 : 0),
            0,
          ),
        };
      })
      .filter(item => item.score >= 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(item => item.id);
  }, [question, references, stage]);
  const progress = useMemo(
    () =>
      calculateSessionDeckProgress({
        decks: allDecks,
        evidence,
        coveredDeckKeys: completedDeskIds,
      }),
    [allDecks, completedDeskIds, evidence],
  );
  const stageProgress = useMemo(
    () =>
      stages.map(item => {
        const stageDecks = allDecks.filter(deck => deck.stageId === item.id);
        const stageSummary = calculateSessionDeckProgress({
          decks: stageDecks,
          evidence,
          coveredDeckKeys: completedDeskIds,
        });
        return {
          ...item,
          coveredCount: stageSummary.coveredDecks,
          deckCount: stageSummary.totalDecks,
        };
      }),
    [allDecks, completedDeskIds, evidence, stages],
  );
  const deskTargetSeconds = Math.max(30, question?.expectedSeconds ?? 90);
  const deskOvertime = deskElapsedSeconds > deskTargetSeconds;
  const deskDisplay = deskOvertime
    ? `+${formatSessionTime((deskElapsedSeconds - deskTargetSeconds) * 1_000)}`
    : formatSessionTime((deskTargetSeconds - deskElapsedSeconds) * 1_000);
  const nextOpenDeck = allDecks.find(deck => !isDeckCovered(deck));
  const currentQueueIndex = currentDeck
    ? queueDecks.findIndex(deck => deck.key === currentDeck.key)
    : -1;
  const hasPreviousQueueDeck = currentDeck
    ? currentQueueIndex > 0 ||
      (currentQueueIndex < 0 &&
        queueDecks.some(deck => deck.globalIndex < currentDeck.globalIndex))
    : false;
  const hasNextQueueDeck = currentDeck
    ? (currentQueueIndex >= 0 && currentQueueIndex < queueDecks.length - 1) ||
      (currentQueueIndex < 0 &&
        queueDecks.some(deck => deck.globalIndex > currentDeck.globalIndex))
    : false;

  if (!stage) {
    return (
      <section className="ls-state ls-state--empty">
        <CircleAlert size={30} />
        <p className="ls-eyebrow">Nothing to run</p>
        <h2>This route has no teaching stages</h2>
        <p>Choose a different route or republish the private playbook package.</p>
        {onExit && <button className="ls-button ls-button--primary" type="button" onClick={onExit}>Return to tracker</button>}
      </section>
    );
  }

  return (
    <section className="ls-runner" aria-label={`Live ${session.title}`}>
      <header className="ls-livebar">
        <div className="ls-livebar__identity">
          <span className="ls-live-dot" aria-hidden="true" />
          <div>
            <span>Session {String(session.number).padStart(2, "0")} · {route.name}</span>
            <strong>{stage.title}</strong>
          </div>
        </div>
        <MasteryRadar evidence={targetEvidence} total={evidenceTargetIds.size} />
        <div className="ls-clock-cluster" aria-label="Session timers">
          <div className={`ls-clock${timer.expired ? " is-overtime" : ""}`}>
            <span>{timer.expired ? "Session overtime" : "Session left"}</span>
            <time>{timer.display}</time>
          </div>
          <div className={`ls-clock ls-clock--desk${deskOvertime ? " is-overtime" : ""}`}>
            <span>{deskOvertime ? "Response overtime" : "Response time"}</span>
            <time>{deskDisplay}</time>
            <div>
              <button
                type="button"
                onClick={() => setDeskTimerRunning(value => !value)}
                aria-label={deskTimerRunning ? "Pause response timer" : "Resume response timer"}
              >
                {deskTimerRunning ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button
                type="button"
                onClick={() => setDeskElapsedSeconds(0)}
                aria-label="Reset response timer"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>
          <button
            className="ls-timer-toggle"
            type="button"
            disabled={timer.status === "complete"}
            onClick={timer.toggle}
            aria-label={timer.status === "running" ? "Pause session timer" : "Resume session timer"}
          >
            {timer.status === "running" ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
        </div>
        <div className="ls-livebar__actions">
          <span className={`ls-sync ls-sync--${syncState}`} title={syncMessage}>
            <SyncIcon size={15} /> {syncCopy(syncState).label}
          </span>
          <button className="ls-icon-button" type="button" onClick={() => setShortcutsOpen(value => !value)} aria-label="Show keyboard shortcuts">
            <Command size={19} />
          </button>
          <button className="ls-button ls-button--quiet" type="button" onClick={onRequestCloseout}>
            <Flag size={16} /> Complete
          </button>
        </div>
      </header>

      <nav className="ls-stage-strip" aria-label="Session stages">
        <div className="ls-stage-strip__progress">
          <span>Stage {stageIndex + 1} of {stages.length}</span>
          <strong>{stage.label}</strong>
        </div>
        <div className="ls-stage-strip__items">
          {stageProgress.map((item, index) => {
            const complete = item.deckCount > 0 && item.coveredCount >= item.deckCount;
            return (
              <button
                type="button"
                className={`${index === stageIndex ? "is-current" : ""}${complete ? " is-complete" : ""}`}
                aria-current={index === stageIndex ? "step" : undefined}
                title={`${item.label}: ${item.title}`}
                key={item.id}
                onClick={() => changePosition(index, 0)}
              >
                {complete ? <CheckCircle2 size={15} /> : <span>{index + 1}</span>}
              </button>
            );
          })}
        </div>
        <button className="ls-button ls-button--quiet" type="button" onClick={() => setReferenceOpen(true)}>
          <BookOpenCheck size={16} /> Knowledge desk <kbd>F</kbd>
        </button>
      </nav>

      <section className="ls-deck-console" aria-label="Teaching deck control centre">
        <div className="ls-deck-console__coverage">
          <div>
            <span>Curriculum coverage</span>
            <strong>{progress.coveredDecks} / {progress.totalDecks}</strong>
          </div>
          <div
            className="ls-deck-console__bar"
            role="progressbar"
            aria-label="Teaching deck coverage"
            aria-valuemin={0}
            aria-valuemax={progress.totalDecks}
            aria-valuenow={progress.coveredDecks}
          >
            <span
              style={{
                width: `${progress.totalDecks
                  ? (progress.coveredDecks / progress.totalDecks) * 100
                  : 0}%`,
              }}
            />
          </div>
          <small>
            {progress.recordedProofs} / {progress.totalProofs} proofs recorded
            {progress.needsAttentionProofs
              ? ` · ${progress.needsAttentionProofs} need attention`
              : " · no recorded proof needs attention"}
          </small>
        </div>
        <label className="ls-deck-select">
          <Layers3 size={17} />
          <span>Jump to deck</span>
          <select
            value={currentDeck?.key ?? ""}
            onChange={event => {
              const selected = allDecks.find(deck => deck.key === event.target.value);
              if (selected) navigateToDeck(selected);
            }}
          >
            {stages.map((item, itemStageIndex) => (
              <optgroup label={`${item.label} · ${item.title}`} key={item.id}>
                {allDecks
                  .filter(deck => deck.stageIndex === itemStageIndex)
                  .map(deck => (
                    <option value={deck.key} key={deck.key}>
                      {String(deck.globalNumber).padStart(3, "0")} · {deck.question?.title ?? deck.stageTitle}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="ls-deck-select ls-deck-select--queue">
          <SlidersHorizontal size={17} />
          <span>Next / previous queue</span>
          <select
            value={queueMode}
            onChange={event => setQueueMode(event.target.value as QueueMode)}
          >
            <option value="core">Core session queue</option>
            <option value="core-plus">Core + reinforcement</option>
            <option value="stretch">Stretch proofs</option>
            <option value="all">All curriculum decks</option>
          </select>
          <small>{queueDecks.length} decks · {queueName(queueMode)}</small>
        </label>
        <button
          className="ls-button ls-button--quiet ls-next-open"
          type="button"
          disabled={!nextOpenDeck}
          onClick={() => nextOpenDeck && navigateToDeck(nextOpenDeck)}
        >
          <CheckCircle2 size={16} />
          {nextOpenDeck ? `First open: ${nextOpenDeck.globalNumber}` : "All decks covered"}
        </button>
      </section>

      <section className="ls-command-search" aria-label="Find any playbook item">
        <label>
          <Search size={18} />
          <span className="ls-sr-only">Search the private playbook</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Find a concept, formula, question, or model response"
            onChange={event => setQuery(event.target.value)}
          />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button> : <kbd>/</kbd>}
        </label>
        <label className="ls-filter-control">
          <SlidersHorizontal size={17} />
          <span className="ls-sr-only">Filter by evidence result</span>
          <select value={resultFilter} onChange={event => setResultFilter(event.target.value as ResultFilter)}>
            <option value="all">All route desks</option>
            <option value="uncovered">All uncovered decks</option>
            <option value="core">Core decks</option>
            <option value="reinforcement">Reinforcement decks</option>
            <option value="stretch">Stretch decks</option>
            <option value="open">Proof not recorded</option>
            <option value="correct">Secure</option>
            <option value="partial">Developing</option>
            <option value="repair">Needs repair</option>
            <option value="parked">Deferred</option>
          </select>
        </label>
      </section>

      {showSearchResults && (
        <section className="ls-search-results" aria-live="polite" aria-label="Playbook search results">
          <header>
            <div><strong>{filteredResults.length} matches</strong><span>Ordered by teaching route</span></div>
            <button type="button" onClick={() => { setQuery(""); setResultFilter("all"); }}>Clear</button>
          </header>
          {filteredResults.length ? (
            <div className="ls-search-results__list">
              {filteredResults.map(result => {
                const covered =
                  completedDeskIds.includes(result.deck.key) || Boolean(result.verdict);
                return (
                  <button
                    type="button"
                    key={result.key}
                    onClick={() => {
                      changePosition(result.stageIndex, result.questionIndex);
                      setQuery("");
                      setResultFilter("all");
                    }}
                  >
                    <span>
                      Deck {result.deck.globalNumber} · {result.stage.label} · {result.question?.tier ?? "core"}
                    </span>
                    <strong>{resultLabel(result)}</strong>
                    <small>{result.question?.prompt ?? result.stage.objective}</small>
                    <em className={result.verdict ? `is-${result.verdict}` : covered ? "is-covered" : "is-open"}>
                      {result.verdict ?? (covered ? "covered" : "open")}
                    </em>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ls-no-results">
              <Search size={23} />
              <strong>No teaching desk matches</strong>
              <p>Try fewer words, a formula fragment, or clear the proof filter.</p>
            </div>
          )}
        </section>
      )}

      {shortcutsOpen && (
        <div className="ls-shortcuts" role="status">
          <span><kbd>/</kbd> search</span><span><kbd>Space</kbd> timers</span>
          <span><kbd>V</kbd> candidate</span><span><kbd>C</kbd> correct</span>
          <span><kbd>L</kbd> developing</span><span><kbd>R</kbd> repair</span>
          <span><kbd>P</kbd> defer</span><span><kbd>B</kbd> back</span><span><kbd>N</kbd> next</span>
          <button type="button" onClick={() => setShortcutsOpen(false)} aria-label="Hide shortcuts"><X size={15} /></button>
        </div>
      )}

      <div className="ls-runner__grid">
        <main className="ls-runner__main">
          <div className="ls-proof-progress">
            <span>
              Deck {currentDeck?.globalNumber ?? 1} of {allDecks.length}
              {question?.tier ? ` · ${question.tier}` : ""}
              {deskComplete ? " · covered" : " · open"}
            </span>
            <span>
              {stageTargetCount
                ? `${stageEvidenceCount} of ${stageTargetCount} stage proofs recorded`
                : "Teaching stage · no formal proof required"}
            </span>
          </div>
          <StageCard
            stage={stage}
            question={question}
            questionIndex={safeQuestionIndex}
            flowStep={flowStep}
            complete={deskComplete}
            onFlowStepChange={selectFlowStep}
            onShowCandidate={openCandidateView}
          />
          {advanceHint ? (
            <p className="ls-advance-hint" role="status" aria-live="polite">
              <CircleAlert size={16} /> {advanceHint}
            </p>
          ) : null}
          <nav className="ls-page-controls" aria-label="Command desk navigation">
            <button className="ls-button ls-button--quiet" type="button" disabled={!hasPreviousQueueDeck} onClick={goPrevious}>
              <ArrowLeft size={17} /> Previous <kbd>B</kbd>
            </button>
            <button className="ls-button ls-button--candidate" type="button" onClick={openCandidateView}>
              <MonitorUp size={17} /> Candidate view <kbd>V</kbd>
            </button>
            <button className="ls-button ls-button--quiet" type="button" onClick={advanceCurrentDeck}>
              {evidenceTarget && !deskComplete && !latestEvidence.has(targetId)
                ? "Record evidence"
                : hasNextQueueDeck || nextOpenDeck
                  ? "Cover & next"
                  : "Closeout"}
              <ArrowRight size={17} /> <kbd>N</kbd>
            </button>
          </nav>
        </main>

        {evidenceTarget ? (
          <EvidenceRepairFlow
            targetLabel={targetLabel}
            value={draft}
            repairInstructions={question?.repair?.length ? question.repair : stage.repair}
            onChange={setDraft}
            onRecord={recordEvidence}
          />
        ) : (
          <aside className="ls-evidence ls-evidence--teaching" aria-label="Teaching move">
            <header className="ls-evidence__header">
              <div>
                <p className="ls-eyebrow">Teaching move</p>
                <h2>Build the mental model</h2>
              </div>
              <BookOpenCheck size={20} aria-hidden="true" />
            </header>
            <p className="ls-evidence__target">
              {deskComplete
                ? "This teaching deck is recorded as covered."
                : "Teach, check understanding, then record this deck as covered."}
            </p>
            <ol className="ls-teaching-move-list">
              <li>Explain the core idea in your own natural voice.</li>
              <li>Ask the displayed check and wait for Hamad to commit.</li>
              <li>Use the model response to sharpen the explanation.</li>
              <li>Move forward to the next independent proof.</li>
            </ol>
            <button
              className="ls-button ls-button--primary ls-button--block"
              type="button"
              onClick={markDeskCompleteAndContinue}
            >
              {deskComplete ? "Covered · continue" : "Mark covered & continue"}
              <ArrowRight size={17} /> <kbd>N</kbd>
            </button>
            {deskComplete ? (
              <button
                className="ls-button ls-button--quiet ls-button--block"
                type="button"
                onClick={() => onDeskCompletionChange(currentDeskKey, false)}
              >
                Reopen this deck
              </button>
            ) : null}
          </aside>
        )}
      </div>

      <nav className="ls-mobile-session-dock" aria-label="Mobile session controls">
        <button type="button" disabled={!hasPreviousQueueDeck} onClick={goPrevious} aria-label="Previous teaching deck">
          <ArrowLeft size={18} />
        </button>
        {(["teach", "ask", "answer"] as const).map((step, index) => (
          <button
            type="button"
            className={flowStep === step ? "is-current" : ""}
            onClick={() => {
              selectFlowStep(step);
              const tone = step === "teach" ? "explain" : step === "ask" ? "question" : "answer";
              window.setTimeout(() => {
                const reducedMotion = window.matchMedia?.(
                  "(prefers-reduced-motion: reduce)",
                ).matches;
                document
                  .querySelector<HTMLElement>(`.ls-command-block--${tone}`)
                  ?.scrollIntoView({
                    behavior: reducedMotion ? "auto" : "smooth",
                    block: "start",
                  });
              }, 0);
            }}
            aria-label={`Go to ${step} panel`}
            key={step}
          >
            <span>{index + 1}</span>
            {step}
          </button>
        ))}
        <button
          type="button"
          className={evidenceTarget && !deskComplete && !latestEvidence.has(targetId) ? "is-attention" : ""}
          onClick={advanceCurrentDeck}
          aria-label={
            evidenceTarget && !deskComplete && !latestEvidence.has(targetId)
              ? "Record evidence before continuing"
              : "Cover this deck and continue"
          }
        >
          {evidenceTarget && !deskComplete && !latestEvidence.has(targetId)
            ? <Flag size={18} />
            : <ArrowRight size={18} />}
        </button>
      </nav>

      <CandidatePromptView
        open={candidateOpen}
        sessionLabel={`Session ${String(session.number).padStart(2, "0")}`}
        stageLabel={stage.title}
        prompt={question?.prompt ?? stage.ask?.[0] ?? stage.objective}
        options={question?.options}
        timeDisplay={deskDisplay}
        onClose={() => {
          setCandidateOpen(false);
          selectFlowStep("answer");
          window.setTimeout(() => {
            const reducedMotion = window.matchMedia?.(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            document
              .querySelector<HTMLElement>(".ls-command-block--answer")
              ?.scrollIntoView({
                behavior: reducedMotion ? "auto" : "smooth",
                block: "start",
              });
          }, 0);
        }}
      />
      <ReferenceDrawer
        open={referenceOpen}
        references={references}
        activeReferenceIds={stage.referenceIds?.length ? stage.referenceIds : activeReferenceIds}
        onClose={() => setReferenceOpen(false)}
      />
    </section>
  );
}
