export type LiveSessionPhase = "launch" | "running" | "closeout" | "complete";

export type EvidenceVerdict = "correct" | "partial" | "repair" | "parked";

export type MasteryDecision = "green" | "amber" | "red";

export type SyncPresentation = "synced" | "saving" | "offline" | "error";

export type LiveSessionLoadState = "ready" | "loading" | "error";

export type ErrorCode = "D" | "T" | "P" | "S" | "A" | "I" | "C";

export type SessionContentKind =
  | "concept"
  | "demonstration"
  | "question"
  | "calculator"
  | "repair"
  | "checkpoint";

export interface LiveSessionDescriptor {
  id: string;
  number: number;
  title: string;
  date: string;
  startTime: string;
  candidateName: string;
  topic: string;
}

export interface LiveSessionRoute {
  id: string;
  name: string;
  minutes: number;
  description: string;
  promise?: string;
  recommended?: boolean;
}

/**
 * One command-desk item. The explanation, prompt, and tutor answer are all
 * rendered at the same time. They are intentionally separate so a private
 * Firestore adapter can validate each field before passing it to the UI.
 */
export interface LiveSessionQuestion {
  id: string;
  label?: string;
  title?: string;
  concept?: string;
  kind?: SessionContentKind;
  explanation?: string;
  teachingScript?: string[];
  prompt: string;
  options?: string[];
  answer?: string;
  spokenAnswer?: string;
  rationale?: string;
  working?: string[];
  interpretation?: string;
  trap?: string;
  followUp?: string;
  formulae?: string[];
  write?: string[];
  listenFor?: string[];
  repair?: string[];
  hints?: string[];
  tags?: string[];
  difficulty?: number | null;
  expectedSeconds?: number | null;
}

export interface LiveSessionStage {
  id: string;
  order: number;
  label: string;
  title: string;
  durationMinutes: number;
  objective: string;
  explanation?: string;
  say?: string[];
  write?: string[];
  ask?: string[];
  listenFor?: string[];
  repair?: string[];
  questions?: LiveSessionQuestion[];
  referenceIds?: string[];
}

export interface LiveSessionReference {
  id: string;
  title: string;
  category: string;
  summary?: string;
  content: string[];
  formulae?: string[];
  tags?: string[];
}

export interface LiveSessionPlaybook {
  id: string;
  version: string;
  title: string;
  routes: LiveSessionRoute[];
  stagesByRoute: Record<string, LiveSessionStage[]>;
  references: LiveSessionReference[];
}

export interface LiveSessionEvidence {
  id: string;
  stageId: string;
  targetId: string;
  targetLabel: string;
  verdict: EvidenceVerdict;
  confidence: number;
  errorCodes: ErrorCode[];
  note: string;
  recordedAt: string;
}

export interface EvidenceDraft {
  verdict: EvidenceVerdict | null;
  confidence: number;
  errorCodes: ErrorCode[];
  note: string;
}

export interface SessionTimerSnapshot {
  status: "idle" | "running" | "paused" | "complete";
  durationMs: number;
  runningSince: string | null;
  elapsedBeforeRunMs: number;
  updatedAt: string;
}

export interface LiveSessionRunSnapshot {
  phase: LiveSessionPhase;
  routeId: string | null;
  stageIndex: number;
  questionIndex: number;
  evidence: LiveSessionEvidence[];
  timer: SessionTimerSnapshot | null;
  updatedAt: string;
}

export interface StageMasteryDecision {
  stageId: string;
  stageTitle: string;
  decision: MasteryDecision;
}

export interface LiveSessionCloseoutResult {
  sessionId: string;
  routeId: string;
  actualMinutes: number;
  evidence: LiveSessionEvidence[];
  mastery: StageMasteryDecision[];
  outcome: string;
  nextAction: string;
  homework: string;
  delayedRetest: string;
  privateTutorNote: string;
  completedAt: string;
}

export interface LiveSessionConsoleProps {
  session: LiveSessionDescriptor;
  playbook: LiveSessionPlaybook | null;
  loadState?: LiveSessionLoadState;
  loadMessage?: string;
  initialRun?: LiveSessionRunSnapshot | null;
  syncState?: SyncPresentation;
  syncMessage?: string;
  offlineReady?: boolean;
  onRetry?: () => void;
  onPrepareOffline?: () => void | Promise<void>;
  onRemoveOffline?: () => void | Promise<void>;
  onRunChange?: (snapshot: LiveSessionRunSnapshot) => void;
  onComplete: (result: LiveSessionCloseoutResult) => void | Promise<void>;
  onExit?: () => void;
}

export const ERROR_CODE_COPY: Record<
  ErrorCode,
  { label: string; description: string; repairCue: string }
> = {
  D: {
    label: "Definition",
    description: "Wrong measure or decision rule",
    repairCue: "Name what the question measures before choosing a formula.",
  },
  T: {
    label: "Timeline",
    description: "Cash-flow timing or external-flow error",
    repairCue: "Draw the dates and place every external cash flow before calculating.",
  },
  P: {
    label: "Periodicity",
    description: "Rate and period units do not match",
    repairCue: "Make N, the rate, and the payment frequency describe the same period.",
  },
  S: {
    label: "Sign",
    description: "Sign or quotation direction is reversed",
    repairCue: "State the cash-flow direction or currency quote aloud first.",
  },
  A: {
    label: "Arithmetic",
    description: "Calculation or algebra broke",
    repairCue: "Estimate direction and magnitude, then rebuild one line at a time.",
  },
  I: {
    label: "Interpretation",
    description: "Number lacks economic meaning",
    repairCue: "Finish with asset, period, units, and economic meaning.",
  },
  C: {
    label: "Confidence",
    description: "Confidence and evidence disagree",
    repairCue: "Use a fresh no-cue proof before accepting confidence as calibrated.",
  },
};
