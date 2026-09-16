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
  Map,
  Maximize2,
  Minimize2,
  MonitorUp,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CandidatePromptView } from "./CandidatePromptView";
import { EvidenceRepairFlow } from "./EvidenceRepairFlow";
import {
  resolveLinearSessionAction,
  type LinearSessionPhase,
} from "./linearSessionFlow";
import { MasteryRadar } from "./MasteryRadar";
import {
  calculateSessionPacing,
  deriveRecommendedDeckTarget,
} from "./pacingAssistant";
import { ReferenceDrawer } from "./ReferenceDrawer";
import {
  resolveSessionPacingDisplayState,
  sessionPacingStateLabel,
  SessionPacingStatus,
} from "./SessionPacingStatus";
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
import { SessionReadingContext } from "./SessionReadingContext";
import { PlanRouteGraphic } from "../../components/PlanRouteGraphic";
import { SyncRecoveryNotice } from "../../components/SyncRecoveryNotice";
import { SessionCountLegend, SESSION_TERMS } from "./sessionGlossary";
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
  mode?: "live" | "rehearsal";
  persistPreferences?: boolean;
  session: LiveSessionDescriptor;
  route: LiveSessionRoute;
  stages: LiveSessionStage[];
  references: LiveSessionReference[];
  libraryDecks?: number;
  timer: SessionTimerController;
  evidence: LiveSessionEvidence[];
  completedDeskIds: string[];
  initialStageIndex?: number;
  initialQuestionIndex?: number;
  syncState?: SyncPresentation;
  syncMessage?: string;
  sessionTools?: ReactNode;
  onRehearse?: () => void;
  onEvidence: (entry: LiveSessionEvidence) => void;
  onDeskCompletionChange: (deskKey: string, complete: boolean) => void;
  onPositionChange?: (stageIndex: number, questionIndex: number) => void;
  onSyncRetry?: () => void;
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
type SessionDensity = "compact" | "comfortable";

interface SessionWorkspaceMemory {
  deckKey?: string;
  phase?: LinearSessionPhase;
  scrollByDeck?: Record<string, Partial<Record<TeachingFlowStep, number>>>;
}

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

function readLocalValue<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

function writeLocalValue(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Session Mode remains usable when device storage is unavailable. */
  }
}

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
      "input, textarea, select, button, summary, a, [contenteditable='true'], [role='dialog'], [role='alertdialog']"
    )
  );
}

function syncCopy(state: SyncPresentation): {
  label: string;
  icon: typeof Cloud;
} {
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
  if (mode === "all") return "All route decks";
  if (mode === "core-plus") return "Core + reinforcement";
  if (mode === "stretch") return "Stretch decks";
  return "Core decks";
}

const REFERENCE_STOP_WORDS = new Set([
  "about",
  "after",
  "answer",
  "before",
  "calculate",
  "explain",
  "from",
  "hamad",
  "into",
  "method",
  "question",
  "return",
  "stage",
  "that",
  "their",
  "this",
  "what",
  "when",
  "which",
  "with",
  "your",
]);

function referenceTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter(token => token.length >= 4 && !REFERENCE_STOP_WORDS.has(token))
    ),
  ];
}

export function LiveSessionRunner({
  session,
  route,
  stages,
  references,
  libraryDecks,
  timer,
  evidence,
  completedDeskIds,
  initialStageIndex = 0,
  initialQuestionIndex = 0,
  syncState = "synced",
  syncMessage,
  sessionTools,
  onRehearse,
  onEvidence,
  onDeskCompletionChange,
  onPositionChange,
  onSyncRetry,
  onRequestCloseout,
  onExit,
  mode = "live",
  persistPreferences = true,
}: LiveSessionRunnerProps) {
  const safeInitialStage = Math.min(
    Math.max(0, initialStageIndex),
    Math.max(0, stages.length - 1)
  );
  const initialStage = stages[safeInitialStage];
  const initialQuestion = initialStage?.questions?.[
    Math.max(0, initialQuestionIndex)
  ];
  const initialDeckKey = sessionDeckKey(
    initialStage?.id ?? "unknown",
    initialQuestion?.id ?? initialStage?.id ?? "unknown"
  );
  const workspaceStorageKey = `hamad-session-workspace:${session.id}:${route.id}`;
  const workspaceMemoryRef = useRef<SessionWorkspaceMemory>(
    persistPreferences
      ? readLocalValue<SessionWorkspaceMemory>(workspaceStorageKey, {})
      : {}
  );
  const [stageIndex, setStageIndex] = useState(safeInitialStage);
  const [questionIndex, setQuestionIndex] = useState(
    Math.max(0, initialQuestionIndex)
  );
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const hasUnrecordedDraft = Boolean(draft.verdict || draft.note || draft.errorCodes.length || draft.confidence !== 3);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [queueMode, setQueueMode] = useState<QueueMode>("all");
  const [linearPhase, setLinearPhase] = useState<LinearSessionPhase>(() =>
    workspaceMemoryRef.current.deckKey === initialDeckKey &&
    workspaceMemoryRef.current.phase
      ? workspaceMemoryRef.current.phase
      : "teach"
  );
  const [focusMode, setFocusMode] = useState(false);
  const [density, setDensity] = useState<SessionDensity>(() =>
    persistPreferences
      ? readLocalValue<SessionDensity>(
          "hamad-session-density",
          "comfortable"
        )
      : "comfortable"
  );
  const [highContrast, setHighContrast] = useState(() =>
    persistPreferences
      ? readLocalValue("hamad-session-high-contrast", false)
      : false
  );
  const [hideCoaching, setHideCoaching] = useState(() =>
    persistPreferences
      ? readLocalValue("hamad-session-hide-coaching", false)
      : false
  );
  const [equalColumns, setEqualColumns] = useState(() =>
    persistPreferences
      ? readLocalValue("hamad-session-equal-columns", false)
      : false
  );
  const [resumeNoticeOpen, setResumeNoticeOpen] = useState(
    initialStageIndex > 0 ||
      initialQuestionIndex > 0 ||
      completedDeskIds.length > 0 ||
      timer.elapsedMs > 0
  );

  useEffect(() => {
    if (resumeNoticeOpen) {
      const t = setTimeout(() => setResumeNoticeOpen(false), 5000);
      return () => clearTimeout(t);
    }
  }, [resumeNoticeOpen]);
  const [deskElapsedSeconds, setDeskElapsedSeconds] = useState(0);
  const [deskTimerRunning, setDeskTimerRunning] = useState(false);
  const [advanceHint, setAdvanceHint] = useState("");
  const [evidenceAnnouncement, setEvidenceAnnouncement] = useState("");
  const [readerSize, setReaderSize] = useState(() => {
    if (!persistPreferences) return 1;
    try {
      const saved = Number(localStorage.getItem("hamad-session-reader-size"));
      return [1, 1.1, 1.2].includes(saved) ? saved : 1;
    } catch {
      return 1;
    }
  });
  const changeReaderSize = (direction: number) => {
    const next = Math.min(
      1.2,
      Math.max(1, Math.round((readerSize + direction * 0.1) * 10) / 10)
    );
    setReaderSize(next);
    if (!persistPreferences) return;
    try {
      localStorage.setItem("hamad-session-reader-size", String(next));
    } catch {
      /* Session viewing works without storage. */
    }
  };
  const searchRef = useRef<HTMLInputElement>(null);
  const toolsRef = useRef<HTMLDetailsElement>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);
  const flowStep: TeachingFlowStep =
    linearPhase === "evidence" ? "answer" : linearPhase;

  const stage = stages[stageIndex] ?? stages[0];
  const questions = stage?.questions ?? [];
  const safeQuestionIndex = Math.min(
    questionIndex,
    Math.max(0, questions.length - 1)
  );
  const question = questions[safeQuestionIndex];
  const allDecks = useMemo(() => flattenSessionDecks(stages), [stages]);
  const currentDeck = allDecks.find(
    deck =>
      deck.stageIndex === stageIndex && deck.questionIndex === safeQuestionIndex
  );
  const queueDecks = useMemo(
    () => allDecks.filter(deck => deckMatchesQueue(deck, queueMode)),
    [allDecks, queueMode]
  );
  const evidenceTarget = isEvidenceTarget(question);
  const targetId = question?.id ?? stage?.id ?? "unknown";
  const currentDeskKey = sessionDeckKey(stage?.id ?? "unknown", targetId);
  const panelScrollPositions =
    workspaceMemoryRef.current.scrollByDeck?.[currentDeskKey] ?? {};
  const deskComplete = completedDeskIds.includes(currentDeskKey);
  const targetLabel = question
    ? `${question.label ?? `Proof ${safeQuestionIndex + 1}`} Â· ${question.id}`
    : (stage?.title ?? "Stage evidence");
  const stageTargetIds = new Set(
    questions.filter(isEvidenceTarget).map(item => item.id)
  );
  const currentEvidence = evidence.filter(
    item => item.stageId === stage?.id && stageTargetIds.has(item.targetId)
  );
  const stageEvidenceCount = new Set(currentEvidence.map(item => item.targetId))
    .size;
  const stageTargetCount = stageTargetIds.size;
  const latestEvidence = useMemo(
    () => latestEvidenceByTarget(evidence),
    [evidence]
  );
  const SyncIcon = syncCopy(syncState).icon;

  useEffect(() => {
    if (!persistPreferences) return;
    writeLocalValue("hamad-session-density", density);
    writeLocalValue("hamad-session-high-contrast", highContrast);
    writeLocalValue("hamad-session-hide-coaching", hideCoaching);
    writeLocalValue("hamad-session-equal-columns", equalColumns);
  }, [density, equalColumns, hideCoaching, highContrast, persistPreferences]);

  useEffect(() => {
    workspaceMemoryRef.current.deckKey = currentDeskKey;
    workspaceMemoryRef.current.phase = linearPhase;
    if (persistPreferences)
      writeLocalValue(workspaceStorageKey, workspaceMemoryRef.current);
  }, [currentDeskKey, linearPhase, persistPreferences, workspaceStorageKey]);

  useEffect(
    () => () => {
      if (scrollSaveTimerRef.current !== null)
        window.clearTimeout(scrollSaveTimerRef.current);
    },
    []
  );

  const rememberPanelScroll = useCallback(
    (step: TeachingFlowStep, scrollTop: number) => {
      const scrollByDeck = workspaceMemoryRef.current.scrollByDeck ?? {};
      workspaceMemoryRef.current.scrollByDeck = {
        ...scrollByDeck,
        [currentDeskKey]: {
          ...(scrollByDeck[currentDeskKey] ?? {}),
          [step]: scrollTop,
        },
      };
      if (!persistPreferences) return;
      if (scrollSaveTimerRef.current !== null)
        window.clearTimeout(scrollSaveTimerRef.current);
      scrollSaveTimerRef.current = window.setTimeout(() => {
        writeLocalValue(workspaceStorageKey, workspaceMemoryRef.current);
        scrollSaveTimerRef.current = null;
      }, 120);
    },
    [currentDeskKey, persistPreferences, workspaceStorageKey]
  );

  const resetWorkspaceLayout = useCallback(() => {
    setDensity("comfortable");
    setHighContrast(false);
    setHideCoaching(false);
    setEqualColumns(false);
    setFocusMode(false);
    setReaderSize(1);
    workspaceMemoryRef.current.scrollByDeck = {};
    document
      .querySelectorAll<HTMLElement>(".ls-command-block__body")
      .forEach(panel => {
        panel.scrollTop = 0;
      });
    if (persistPreferences) {
      writeLocalValue("hamad-session-reader-size", 1);
      writeLocalValue(workspaceStorageKey, workspaceMemoryRef.current);
    }
    setAdvanceHint("Workspace layout reset. Session progress was not changed.");
  }, [persistPreferences, workspaceStorageKey]);

  const isDeckCovered = useCallback(
    (deck: SessionDeck) =>
      completedDeskIds.includes(deck.key) ||
      (deck.isProof && latestEvidence.has(deck.targetId)),
    [completedDeskIds, latestEvidence]
  );

  useEffect(() => {
    if (questionIndex !== safeQuestionIndex)
      setQuestionIndex(safeQuestionIndex);
  }, [questionIndex, safeQuestionIndex]);

  useEffect(() => {
    const closeDeckToolsOnOutsidePress = (event: PointerEvent) => {
      const tools = toolsRef.current;
      if (!tools?.open || tools.contains(event.target as Node)) return;
      tools.open = false;
    };
    document.addEventListener("pointerdown", closeDeckToolsOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeDeckToolsOnOutsidePress);
  }, []);

  useEffect(() => {
    onPositionChange?.(stageIndex, safeQuestionIndex);
  }, [onPositionChange, safeQuestionIndex, stageIndex]);

  const changePosition = useCallback(
    (nextStage: number, nextQuestion: number) => {
      const clampedStage = Math.min(
        Math.max(0, nextStage),
        Math.max(0, stages.length - 1)
      );
      const clampedQuestion = Math.max(0, nextQuestion);
      const nextStageValue = stages[clampedStage];
      const nextQuestionValue = nextStageValue?.questions?.[clampedQuestion];
      const nextDeckKey = sessionDeckKey(
        nextStageValue?.id ?? "unknown",
        nextQuestionValue?.id ?? nextStageValue?.id ?? "unknown"
      );
      setStageIndex(clampedStage);
      setQuestionIndex(clampedQuestion);
      setDraft(EMPTY_DRAFT);
      setLinearPhase(
        workspaceMemoryRef.current.deckKey === nextDeckKey
          ? (workspaceMemoryRef.current.phase ?? "teach")
          : "teach"
      );
      setDeskTimerRunning(false);
      setAdvanceHint("");
      window.scrollTo({ top: 0, behavior: "auto" });
    },
    [stages]
  );

  const navigateToDeck = useCallback(
    (deck: SessionDeck) => changePosition(deck.stageIndex, deck.questionIndex),
    [changePosition]
  );

  const navigateManuallyToDeck = useCallback(
    (deck: SessionDeck) => {
      if (hasUnrecordedDraft) {
        setAdvanceHint(
          "Save or clear the current evidence draft before changing decks."
        );
        return false;
      }
      navigateToDeck(deck);
      return true;
    },
    [hasUnrecordedDraft, navigateToDeck]
  );

  const moveForward = useCallback(
    (treatCurrentAsCovered = false) => {
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
        setAdvanceHint(
          "Cover this teaching deck or record evidence before closeout."
        );
        return;
      }
      onRequestCloseout();
    },
    [
      allDecks,
      completedDeskIds,
      currentDeck,
      evidence,
      navigateToDeck,
      onRequestCloseout,
      queueDecks,
    ]
  );

  const goPrevious = useCallback(() => {
    if (!currentDeck) return;
    const exactIndex = queueDecks.findIndex(
      deck => deck.key === currentDeck.key
    );
    const previous =
      exactIndex >= 0
        ? queueDecks[exactIndex - 1]
        : [...queueDecks]
            .reverse()
            .find(deck => deck.globalIndex < currentDeck.globalIndex);
    if (previous) navigateManuallyToDeck(previous);
  }, [currentDeck, navigateManuallyToDeck, queueDecks]);

  const moveToAdjacentRouteDeck = useCallback(
    (direction: -1 | 1) => {
      if (!currentDeck) return;
      const adjacentDeck = allDecks[currentDeck.globalIndex + direction];
      if (adjacentDeck) {
        navigateManuallyToDeck(adjacentDeck);
        return;
      }
      setAdvanceHint(
        direction > 0
          ? "You are already on the final deck in this route."
          : "You are already on the first deck in this route."
      );
    },
    [allDecks, currentDeck, navigateManuallyToDeck]
  );

  const recordEvidence = useCallback(() => {
    const verdict = draft.verdict;
    if (!stage || !evidenceTarget || !verdict || !canRecordEvidenceDraft(draft))
      return;
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
    setEvidenceAnnouncement(`${mode === "rehearsal" ? "Practice" : "Tutor"} evidence recorded: ${targetLabel}. ${mode === "rehearsal" ? "Nothing is saved." : "Check sync status for cloud confirmation."}`);
    setDraft(EMPTY_DRAFT);
    moveForward(true);
  }, [
    currentDeskKey,
    draft,
    mode,
    evidenceTarget,
    moveForward,
    onDeskCompletionChange,
    onEvidence,
    stage,
    targetId,
    targetLabel,
  ]);

  const selectVerdict = useCallback(
    (verdict: EvidenceVerdict) => {
      if (!evidenceTarget) return;
      setDraft(current => ({
        ...current,
        verdict,
        errorCodes: verdict === "repair" ? current.errorCodes : [],
      }));
    },
    [evidenceTarget]
  );

  useEffect(() => {
    setDeskElapsedSeconds(0);
    setDeskTimerRunning(false);
  }, [currentDeskKey]);

  useEffect(() => {
    if (!deskTimerRunning || timer.status !== "running") return;
    const interval = window.setInterval(
      () => setDeskElapsedSeconds(value => value + 1),
      1_000
    );
    return () => window.clearInterval(interval);
  }, [deskTimerRunning, timer.status]);

  const selectFlowStep = useCallback(
    (step: TeachingFlowStep) => {
      if (step === "ask" && flowStep !== "ask") {
        setDeskElapsedSeconds(0);
        setDeskTimerRunning(true);
      } else if (step !== "ask") {
        setDeskTimerRunning(false);
      }
      setLinearPhase(step);
      setAdvanceHint("");
    },
    [flowStep]
  );

  const openCandidateView = useCallback(() => {
    if (!(question?.prompt || stage.ask?.[0])) return;
    selectFlowStep("ask");
    setCandidateOpen(true);
  }, [question?.prompt, stage.ask, selectFlowStep]);

  const focusEvidencePanel = useCallback(() => {
    setDeskTimerRunning(false);
    setAdvanceHint(
      "Choose a verdict and save the evidence. Use Defer with a short reason when this proof must wait."
    );
    window.setTimeout(() => {
      const panel = document.querySelector<HTMLElement>("#ls-evidence-panel");
      const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      panel?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
      panel?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const advanceLinearSequence = useCallback(() => {
    if (!currentDeck) return;
    const action = resolveLinearSessionAction({
      phase: linearPhase,
      isProof: evidenceTarget,
      isCovered: isDeckCovered(currentDeck),
      evidenceReady: canRecordEvidenceDraft(draft),
    });
    if (action.kind === "move-to-phase") {
      if (action.phase === "evidence") {
        setLinearPhase("evidence");
        focusEvidencePanel();
      } else {
        selectFlowStep(action.phase);
        const tone =
          action.phase === "teach"
            ? "explain"
            : action.phase === "ask"
              ? "question"
              : "answer";
        window.setTimeout(() => {
          const reducedMotion = window.matchMedia?.(
            "(prefers-reduced-motion: reduce)"
          ).matches;
          document
            .querySelector<HTMLElement>(`.ls-command-block--${tone}`)
            ?.scrollIntoView({
              behavior: reducedMotion ? "auto" : "smooth",
              block: window.matchMedia?.("(max-width: 899px)").matches
                ? "start"
                : "nearest",
            });
        }, 0);
      }
      return;
    }
    if (action.kind === "focus-evidence") {
      focusEvidencePanel();
      return;
    }
    if (action.kind === "record-evidence") {
      recordEvidence();
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
    linearPhase,
    moveForward,
    onDeskCompletionChange,
    recordEvidence,
    selectFlowStep,
  ]);

  const requestCloseoutSafely = useCallback(() => {
    if (hasUnrecordedDraft) {
      setAdvanceHint(
        "Save or clear the current evidence draft before opening closeout."
      );
      return;
    }
    onRequestCloseout();
  }, [hasUnrecordedDraft, onRequestCloseout]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (candidateOpen || referenceOpen) return;
      if (event.key === "Escape" && focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (event.key === "Escape" && toolsRef.current?.open) {
        event.preventDefault();
        toolsRef.current.open = false;
        return;
      }
      if (event.key === "/" && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        if (toolsRef.current) toolsRef.current.open = true;
        window.setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      if (isInteractiveTarget(event.target)) return;
      if (
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        if (!event.repeat) {
          moveToAdjacentRouteDeck(event.key === "ArrowRight" ? 1 : -1);
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        if (!event.repeat) advanceLinearSequence();
      } else if (key === "t") {
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
        if (!event.repeat) advanceLinearSequence();
      } else if (key === "b") {
        event.preventDefault();
        goPrevious();
      } else if (key === "enter" && draft.verdict) {
        event.preventDefault();
        recordEvidence();
      } else if (key === "?") {
        event.preventDefault();
        setShortcutsOpen(value => !value);
      } else if (key === "z") {
        event.preventDefault();
        setFocusMode(value => !value);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    advanceLinearSequence,
    candidateOpen,
    draft.verdict,
    focusMode,
    goPrevious,
    moveToAdjacentRouteDeck,
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
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
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
                : isEvidenceTarget(result.question) &&
                  result.verdict === resultFilter;
      return searchMatch && filterMatch;
    });
  }, [commandDeskResults, completedDeskIds, query, resultFilter]);

  const showSearchResults = Boolean(query.trim()) || resultFilter !== "all";
  const evidenceTargetIds = useMemo(
    () =>
      new Set(
        commandDeskResults
          .filter(result => isEvidenceTarget(result.question))
          .map(result => result.question!.id)
      ),
    [commandDeskResults]
  );
  const targetEvidence = useMemo(
    () =>
      [...latestEvidence.values()].filter(entry =>
        evidenceTargetIds.has(entry.targetId)
      ),
    [evidenceTargetIds, latestEvidence]
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
        .join(" ")
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
            0
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
    [allDecks, completedDeskIds, evidence]
  );
  const pacingBreakMinutes = 5;
  const pacingDurationMinutes = Math.min(180, Math.max(120, route.minutes));
  const liveTargetDecks = useMemo(
    () =>
      Math.max(
        1,
        route.curated ? allDecks.length : deriveRecommendedDeckTarget({
          sessionDurationMinutes: pacingDurationMinutes,
          expectedSeconds: allDecks.map(
            deck => deck.question?.expectedSeconds ?? null
          ),
          breakAllowanceMinutes: pacingBreakMinutes,
        })
      ),
    [allDecks, pacingDurationMinutes, route.curated]
  );
  const completedLiveTargetDecks = useMemo(
    () =>
      allDecks.slice(0, liveTargetDecks).filter(deck => isDeckCovered(deck))
        .length,
    [allDecks, isDeckCovered, liveTargetDecks]
  );
  const pacing = useMemo(
    () =>
      calculateSessionPacing({
        sessionDurationMinutes: pacingDurationMinutes,
        elapsedMinutes: timer.elapsedMs / 60_000,
        totalRouteDecks: liveTargetDecks,
        currentDeck: Math.min(
          liveTargetDecks,
          Math.max(1, currentDeck?.globalNumber ?? 1)
        ),
        completedDecks: completedLiveTargetDecks,
        breakAllowanceMinutes: pacingBreakMinutes,
      }),
    [
      completedLiveTargetDecks,
      currentDeck?.globalNumber,
      liveTargetDecks,
      pacingDurationMinutes,
      timer.elapsedMs,
    ]
  );
  const pacingPaused = timer.status !== "running";
  const pacingCalibrating =
    !pacingPaused &&
    (completedLiveTargetDecks < 2 || timer.elapsedMs < 5 * 60_000);
  const pacingDisplayState = resolveSessionPacingDisplayState(
    pacing,
    completedLiveTargetDecks,
    liveTargetDecks,
    pacingPaused,
    pacingCalibrating
  );
  const pacingLabel = sessionPacingStateLabel(pacingDisplayState, pacing);
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
    [allDecks, completedDeskIds, evidence, stages]
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
  const currentDeckCovered = currentDeck ? isDeckCovered(currentDeck) : false;
  const linearAction = resolveLinearSessionAction({
    phase: linearPhase,
    isProof: evidenceTarget,
    isCovered: currentDeckCovered,
    evidenceReady: canRecordEvidenceDraft(draft),
  });
  const linearStepNumber =
    linearPhase === "teach"
      ? 1
      : linearPhase === "ask"
        ? 2
        : linearPhase === "answer"
          ? 3
          : 4;
  const linearStepTotal = evidenceTarget && !currentDeckCovered ? 4 : 3;
  const linearStepLabel =
    linearPhase === "teach"
      ? "Teach the concept"
      : linearPhase === "ask"
        ? "Ask and wait for commitment"
        : linearPhase === "answer"
          ? "Explain the model answer"
          : "Record Hamad's evidence";
  const primaryActionLabel =
    linearAction.kind === "move-to-phase"
      ? linearAction.phase === "ask"
        ? "Next: ask Hamad"
        : linearAction.phase === "answer"
          ? "Next: explain answer"
          : "Next: record evidence"
      : linearAction.kind === "record-evidence"
        ? mode === "rehearsal" ? "Practice evidence & next" : "Save evidence & next"
        : linearAction.kind === "focus-evidence"
          ? "Complete evidence details"
          : hasNextQueueDeck || nextOpenDeck
            ? currentDeckCovered
              ? "Next deck"
              : "Cover & next deck"
            : mode === "rehearsal" ? "Finish rehearsal" : "Finish session";

  if (!stage) {
    return (
      <section className="ls-state ls-state--empty">
        <CircleAlert size={30} />
        <p className="ls-eyebrow">Nothing to run</p>
        <h2>This route has no teaching stages</h2>
        <p>
          Choose a different route or republish the private playbook package.
        </p>
        {onExit && (
          <button
            className="ls-button ls-button--primary"
            type="button"
            onClick={onExit}
          >
            Return to tracker
          </button>
        )}
      </section>
    );
  }

  return (
    <SessionReadingContext.Provider value={readerSize}>
    <section
      className="ls-runner"
      data-reader-size={readerSize}
      data-density={density}
      data-contrast={highContrast ? "high" : "standard"}
      data-focus={focusMode ? "true" : "false"}
      data-flow-step={flowStep}
      data-equal-columns={equalColumns ? "true" : "false"}
      aria-label={`Live ${session.title}`}
    >
      <header className="ls-unified-header">
        <p className="ls-sr-only" role="status" aria-live="polite" aria-atomic="true">
          Session timer {timer.status}{timer.expired ? "; planned time has elapsed" : ""}. Response timer {deskTimerRunning ? "running" : "paused"}.
        </p>
        <p className="ls-sr-only" role="status" aria-live="polite" aria-atomic="true">{evidenceAnnouncement}</p>
        
        <div className="ls-unified-header__left">
          <button
            className="ls-icon-button"
            type="button"
            disabled={!hasPreviousQueueDeck}
            onClick={goPrevious}
            aria-label="Return to the previous teaching deck"
          >
            <ArrowLeft size={16} />
          </button>
          <button className="ls-button ls-button--quiet ls-reference-shortcut" type="button" onClick={() => setReferenceOpen(true)}><BookOpenCheck size={16} /> References <kbd>F</kbd></button>
          
          <div className="ls-unified-header__identity">
            <h2 title={stage.title}>{stage.title}</h2>
            
            <div className="ls-unified-header__path">
              <PlanRouteGraphic 
                nodes={allDecks.map((deck) => ({
                  id: deck.key,
                  isPast: deck.globalNumber < (currentDeck?.globalNumber ?? 1),
                  isCurrent: deck.globalNumber === (currentDeck?.globalNumber ?? 1),
                  isComplete: completedDeskIds.includes(deck.key),
                }))}
                columns={15}
                compact={true}
              />
            </div>

            <div className="ls-unified-header__meta">
              <span className="ls-meta-pill">Step {linearStepNumber} of {linearStepTotal}</span>
              <SessionPacingStatus
                pacing={pacing}
                completedDecks={completedLiveTargetDecks}
                targetDecks={liveTargetDecks}
                paused={pacingPaused}
                calibrating={pacingCalibrating}
                className="ls-pacing-status--compact"
              />
              <span className="ls-meta-pill">Target {evidenceTargetIds.size}/120</span>
              <span className="ls-meta-pill">{deskComplete ? "Covered" : "Open"}</span>
              
              <details className="ls-deck-tools" ref={toolsRef}>
                <summary aria-label="Session tools">
                  <SlidersHorizontal size={14} /> Tools
                </summary>
                <div className="ls-deck-tools__popover">
                  <div className="ls-deck-console__coverage" aria-label="Session route map" role="group">
                    <PlanRouteGraphic 
                      nodes={allDecks.map((deck) => ({
                        id: deck.key,
                        isPast: deck.globalNumber < (currentDeck?.globalNumber ?? 1),
                        isCurrent: deck.globalNumber === (currentDeck?.globalNumber ?? 1),
                        isComplete: completedDeskIds.includes(deck.key),
                      }))}
                    />
                    <div className="ls-deck-console__matrix" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginTop: '0.5rem' }}>
                      {allDecks.map(deck => (
                        <button
                          key={deck.key}
                          type="button"
                          aria-current={deck.globalNumber === (currentDeck?.globalNumber ?? 1) ? "step" : undefined}
                          aria-label={`Jump to deck ${deck.globalNumber}`}
                          className={`ls-matrix-node${completedDeskIds.includes(deck.key) ? " is-complete" : ""}`}
                          style={{ width: '8px', height: '8px', padding: 0, minHeight: 0 }}
                          onClick={() => {
                            if (navigateManuallyToDeck(deck) && toolsRef.current) {
                              toolsRef.current.open = false;
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <nav className="ls-stage-strip" aria-label="Session stages">
                    <div className="ls-stage-strip__progress">
                      <span>Stage {stageIndex + 1} of {stages.length}</span>
                      <strong>{stage.title}</strong>
                    </div>
                    <div className="ls-stage-strip__items">
                      {stageProgress.map((item, index) => {
                        const complete = item.deckCount > 0 && item.coveredCount >= item.deckCount;
                        return (
                          <button
                            type="button"
                            className={`${index === stageIndex ? "is-current" : ""}${complete ? " is-complete" : ""}`}
                            aria-current={index === stageIndex ? "step" : undefined}
                            aria-label={`Stage ${index + 1}: ${item.title}${complete ? ", covered" : ""}`}
                            title={`${item.label}: ${item.title}`}
                            key={item.id}
                            onClick={() => {
                              const destination = allDecks.find(deck => deck.stageIndex === index);
                              if (destination && navigateManuallyToDeck(destination) && toolsRef.current) {
                                toolsRef.current.open = false;
                              }
                            }}
                          >
                            {complete ? <CheckCircle2 size={15} /> : <span>{index + 1}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </nav>
                  
                  <div className="ls-reading-settings">
                    <div>
                      <strong>Make yourself comfortable</strong>
                      <span>Adjust the teaching text on this device.</span>
                    </div>
                    <div role="group" aria-label="Teaching text size">
                      <button type="button" aria-label="Decrease text size" disabled={readerSize <= 1} onClick={() => changeReaderSize(-1)}><Minus size={16} /></button>
                      <output aria-live="polite">{Math.round(readerSize * 100)}%</output>
                      <button type="button" aria-label="Increase text size" disabled={readerSize >= 1.2} onClick={() => changeReaderSize(1)}><Plus size={16} /></button>
                    </div>
                  </div>
                  
                  <section className="ls-comfort-settings">
                    <header>
                      <strong>Workspace comfort</strong>
                    </header>
                    <div>
                      <button type="button" aria-pressed={density === "compact"} onClick={() => setDensity(value => value === "compact" ? "comfortable" : "compact")}>Compact density</button>
                      <button type="button" aria-pressed={highContrast} onClick={() => setHighContrast(value => !value)}>High contrast</button>
                      <button type="button" aria-pressed={hideCoaching} onClick={() => setHideCoaching(value => !value)}>Hide coaching cues</button>
                      <button type="button" aria-pressed={equalColumns} onClick={() => setEqualColumns(value => !value)}>Equal panel widths</button>
                      <button type="button" onClick={resetWorkspaceLayout}><RotateCcw size={15} /> Reset layout</button>
                    </div>
                  </section>
                  
                  {sessionTools}
                  <div style={{ display: "flex", gap: "0.5rem", padding: "1rem" }}>
                    <button className="ls-button ls-button--quiet" type="button" onClick={requestCloseoutSafely}>
                      <Flag size={16} /> {mode === "rehearsal" ? "Finish rehearsal" : "Finish session"}
                    </button>
                    {onRehearse && (
                      <button className="ls-button ls-button--quiet" type="button" onClick={() => { if (!hasUnrecordedDraft) onRehearse(); }} disabled={hasUnrecordedDraft}>
                        Rehearse without saving
                      </button>
                    )}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>

        <div className="ls-unified-header__right">
          {mode === "live" && <SyncRecoveryNotice state={syncState} message={syncMessage} onRetry={onSyncRetry} />}
          
          <div className="ls-clock-cluster" aria-label="Session timers">
            <div className={`ls-clock${timer.expired ? " is-overtime" : ""}`}>
              <svg className="ls-clock-ring" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="20" stroke="var(--border)" strokeWidth="4" fill="none" />
                <circle 
                  cx="24" cy="24" r="20" 
                  stroke={timer.expired ? "var(--alert-red)" : (timer.remainingMs !== undefined && timer.remainingMs < 5 * 60_000) ? "var(--gold-bright)" : "var(--theme-blue)"} 
                  strokeWidth="4" fill="none"
                  strokeDasharray={2 * Math.PI * 20}
                  strokeDashoffset={timer.progress !== undefined ? (Math.min(timer.progress, 1)) * (2 * Math.PI * 20) : 0}
                  strokeLinecap="round"
                  transform="rotate(-90 24 24)"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
                />
              </svg>
              <div className="ls-clock-text">
                <span>{timer.status === "paused" ? "Paused" : timer.expired ? "Overtime" : "Remaining"}</span>
                <time>{timer.display}</time>
              </div>
            </div>
            
            <div className={`ls-clock ls-clock--desk${deskOvertime ? " is-overtime" : ""}`}>
              <span>{deskOvertime ? "Response overtime" : "Response time"}</span>
              <time>{deskDisplay}</time>
              <div>
                <button className="ls-clock-control" aria-label="Toggle response timer" type="button" onClick={() => setDeskTimerRunning(value => !value)}>
                  {deskTimerRunning ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button className="ls-clock-control" aria-label="Reset response timer" type="button" onClick={() => setDeskElapsedSeconds(0)}>
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
            
            <button className="ls-timer-toggle" aria-label={timer.status === "running" ? "Pause session timer" : "Start session timer"} type="button" disabled={timer.status === "complete"} onClick={timer.toggle}>
              {timer.status === "running" ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
          </div>

          <button
            className="ls-focus-toggle"
            type="button"
            aria-label={focusMode ? "Exit laptop focus mode" : "Enter laptop focus mode"}
            onClick={() => setFocusMode(value => !value)}
            aria-pressed={focusMode}
          >
            {focusMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{focusMode ? "Exit focus" : "Teaching focus"}</span>
            <kbd>Z</kbd>
          </button>
          
          <button
            className="ls-linear-control__next"
            type="button"
            onClick={advanceLinearSequence}
          >
            <span>{primaryActionLabel}</span>
            <kbd>Space</kbd>
            <ArrowRight size={20} />
          </button>
        </div>
      </header>

      {resumeNoticeOpen && (
        <aside className="ls-resume-notice" role="status">
          <div>
            <strong>Workspace restored</strong>
            <span>
              Deck {currentDeck?.globalNumber ?? 1} of {allDecks.length} | {linearStepLabel} | timer {timer.status}
            </span>
          </div>
          <button type="button" onClick={() => setResumeNoticeOpen(false)}>
            Continue here <ArrowRight size={15} />
          </button>
        </aside>
      )}

      <div
        className={`ls-runner__grid${evidenceTarget ? " has-evidence-rail" : " is-teaching-deck"}${linearPhase === "evidence" ? " is-evidence-step" : ""}`}
      >
        <main className="ls-runner__main">


          <StageCard
            key={currentDeck?.key ?? `${stage.id}:${safeQuestionIndex}`}
            stage={stage}
            question={question}
            questionIndex={safeQuestionIndex}
            flowStep={flowStep}
            complete={deskComplete}
            onFlowStepChange={selectFlowStep}
            onShowCandidate={openCandidateView}
            hideCoaching={hideCoaching}
            panelScrollPositions={panelScrollPositions}
            onPanelScroll={rememberPanelScroll}
          />
          {advanceHint ? (
            <p className="ls-advance-hint" role="status" aria-live="polite">
              <CircleAlert size={16} /> {advanceHint}
            </p>
          ) : null}
        </main>

        {evidenceTarget ? (
          <EvidenceRepairFlow
            mode={mode}
            targetLabel={targetLabel}
            value={draft}
            repairInstructions={
              question?.repair?.length ? question.repair : stage.repair
            }
            onChange={setDraft}
            onRecord={recordEvidence}
            onClose={() => {
              selectFlowStep("answer");
              window.setTimeout(() => {
                const answerPanel = document.querySelector<HTMLElement>(
                  ".ls-command-block--answer .ls-panel-step"
                );
                answerPanel?.focus({ preventScroll: true });
                answerPanel?.scrollIntoView({ block: "nearest" });
              }, 0);
            }}
          />
        ) : (
          <aside
            className="ls-evidence ls-evidence--teaching"
            aria-label="Teaching move"
          >
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
            <p className="ls-teaching-move-next">
              Use the single blue Next control. After Answer it records this
              deck as covered and opens the next deck in route order.
            </p>
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

      <nav
        className="ls-mobile-session-dock"
        aria-label="Mobile session controls"
      >
        <button
          type="button"
          disabled={!hasPreviousQueueDeck}
          onClick={goPrevious}
          aria-label="Previous teaching deck"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          className="ls-mobile-session-dock__next"
          onClick={advanceLinearSequence}
          aria-label={`${primaryActionLabel}. ${pacingLabel}. ${completedLiveTargetDecks} of ${liveTargetDecks} live-target decks complete.`}
        >
          <span>
            Step {linearStepNumber}/{linearStepTotal} - {pacingLabel}
          </span>
          <strong>{primaryActionLabel}</strong>
          <ArrowRight size={19} />
        </button>
      </nav>

      <CandidatePromptView
        open={candidateOpen}
        sessionLabel={`Session ${String(session.number).padStart(2, "0")}`}
        stageLabel={stage.title}
        prompt={question?.prompt || stage.ask?.[0] || ""}
        options={question?.options}
        timeDisplay={deskDisplay}
        onClose={() => {
          setCandidateOpen(false);
          selectFlowStep("answer");
          window.setTimeout(() => {
            const reducedMotion = window.matchMedia?.(
              "(prefers-reduced-motion: reduce)"
            ).matches;
            document
              .querySelector<HTMLElement>(".ls-command-block--answer")
              ?.scrollIntoView({
                behavior: reducedMotion ? "auto" : "smooth",
                block: "nearest",
              });
          }, 0);
        }}
      />
      <ReferenceDrawer
        open={referenceOpen}
        references={references}
        activeReferenceIds={
          stage.referenceIds?.length ? stage.referenceIds : activeReferenceIds
        }
        onClose={() => setReferenceOpen(false)}
      />
    </section>
    </SessionReadingContext.Provider>
  );
}

