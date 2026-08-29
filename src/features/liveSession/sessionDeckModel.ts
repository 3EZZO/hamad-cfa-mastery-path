import type {
  EvidenceDraft,
  LiveSessionEvidence,
  LiveSessionQuestion,
  LiveSessionStage,
} from "./types";

export interface SessionDeck {
  key: string;
  targetId: string;
  stageId: string;
  stageIndex: number;
  stageLabel: string;
  stageTitle: string;
  questionIndex: number;
  globalIndex: number;
  globalNumber: number;
  globalTotal: number;
  stageDeckIndex: number;
  stageDeckNumber: number;
  stageDeckTotal: number;
  isProof: boolean;
  expectedSeconds: number | null;
  stage: LiveSessionStage;
  question?: LiveSessionQuestion;
}

export interface SessionDeckProgress {
  totalDecks: number;
  coveredDecks: number;
  remainingDecks: number;
  totalProofs: number;
  recordedProofs: number;
  openProofs: number;
  secureProofs: number;
  developingProofs: number;
  repairProofs: number;
  deferredProofs: number;
  needsAttentionProofs: number;
}

export interface CalculateSessionDeckProgressOptions {
  decks: readonly SessionDeck[];
  evidence: readonly LiveSessionEvidence[];
  coveredDeckKeys?: Iterable<string>;
}

export interface ResolveForwardDeckOptions {
  currentDeck: SessionDeck;
  queueDecks: readonly SessionDeck[];
  allDecks: readonly SessionDeck[];
  evidence: readonly LiveSessionEvidence[];
  coveredDeckKeys?: Iterable<string>;
  treatCurrentAsCovered?: boolean;
}

export interface ForwardDeckResolution {
  nextDeck?: SessionDeck;
  expandedToAll: boolean;
  canCloseout: boolean;
}

export function canRecordEvidenceDraft(draft: EvidenceDraft): boolean {
  if (!draft.verdict) return false;
  if (draft.verdict === "repair" && !draft.errorCodes.length) return false;
  if (draft.verdict === "parked" && !draft.note.trim()) return false;
  return true;
}

/**
 * Produces a stable key for one route deck. Card IDs are expected to be unique,
 * but the stage prefix keeps coverage safe if a future package reuses one.
 */
export function sessionDeckKey(stageId: string, targetId: string): string {
  return `${stageId}::${targetId}`;
}

/**
 * Flattens route stages into their exact teaching order. A stage without cards
 * remains navigable as one stage-level teaching deck, matching Session Mode's
 * existing fallback behaviour.
 */
export function flattenSessionDecks(
  stages: readonly LiveSessionStage[],
): SessionDeck[] {
  const decks = stages.flatMap((stage, stageIndex) => {
    const questions: Array<LiveSessionQuestion | undefined> =
      stage.questions?.length ? [...stage.questions] : [undefined];
    const stageDeckTotal = questions.length;

    return questions.map((question, questionIndex) => {
      const targetId = question?.id ?? stage.id;
      return {
        key: sessionDeckKey(stage.id, targetId),
        targetId,
        stageId: stage.id,
        stageIndex,
        stageLabel: stage.label,
        stageTitle: stage.title,
        questionIndex,
        globalIndex: 0,
        globalNumber: 0,
        globalTotal: 0,
        stageDeckIndex: questionIndex,
        stageDeckNumber: questionIndex + 1,
        stageDeckTotal,
        isProof: question?.kind === "question",
        expectedSeconds: question?.expectedSeconds ?? null,
        stage,
        ...(question ? { question } : {}),
      } satisfies SessionDeck;
    });
  });

  return decks.map((deck, globalIndex) => ({
    ...deck,
    globalIndex,
    globalNumber: globalIndex + 1,
    globalTotal: decks.length,
  }));
}

/**
 * Returns the last recorded result for every proof target. Evidence is an
 * append-only action history, so array order is authoritative when two device
 * clocks do not agree.
 */
export function latestEvidenceByTarget(
  evidence: readonly LiveSessionEvidence[],
): ReadonlyMap<string, LiveSessionEvidence> {
  const latest = new Map<string, LiveSessionEvidence>();
  evidence.forEach(entry => latest.set(entry.targetId, entry));
  return latest;
}

/**
 * Resolves one guarded forward move. Exhausting a filtered queue never hides
 * unfinished curriculum: the result expands to the first uncovered deck in
 * the complete route before allowing closeout.
 */
export function resolveForwardDeck({
  currentDeck,
  queueDecks,
  allDecks,
  evidence,
  coveredDeckKeys = [],
  treatCurrentAsCovered = false,
}: ResolveForwardDeckOptions): ForwardDeckResolution {
  const queueIndex = queueDecks.findIndex(deck => deck.key === currentDeck.key);
  const nextInQueue = queueIndex >= 0
    ? queueDecks[queueIndex + 1]
    : queueDecks.find(deck => deck.globalIndex > currentDeck.globalIndex);
  if (nextInQueue) {
    return { nextDeck: nextInQueue, expandedToAll: false, canCloseout: false };
  }

  const covered = new Set(coveredDeckKeys);
  const latestEvidence = latestEvidenceByTarget(evidence);
  const isCovered = (deck: SessionDeck) =>
    covered.has(deck.key) ||
    (deck.isProof && latestEvidence.has(deck.targetId));
  const firstUncovered = allDecks.find(
    deck => deck.key !== currentDeck.key && !isCovered(deck),
  );
  if (firstUncovered) {
    return { nextDeck: firstUncovered, expandedToAll: true, canCloseout: false };
  }

  return {
    expandedToAll: false,
    canCloseout: treatCurrentAsCovered || isCovered(currentDeck),
  };
}

/**
 * Summarizes route coverage independently from mastery. Saving proof evidence
 * establishes that the proof deck was covered; non-proof decks must be present
 * in coveredDeckKeys after the tutor deliberately moves on.
 */
export function calculateSessionDeckProgress({
  decks,
  evidence,
  coveredDeckKeys = [],
}: CalculateSessionDeckProgressOptions): SessionDeckProgress {
  const covered = new Set(coveredDeckKeys);
  const latestEvidence = latestEvidenceByTarget(evidence);
  const proofDecks = decks.filter(deck => deck.isProof);
  const proofEvidence = proofDecks
    .map(deck => latestEvidence.get(deck.targetId))
    .filter((entry): entry is LiveSessionEvidence => Boolean(entry));
  const coveredDecks = decks.filter(
    deck =>
      covered.has(deck.key) ||
      (deck.isProof && latestEvidence.has(deck.targetId)),
  ).length;
  const secureProofs = proofEvidence.filter(
    entry => entry.verdict === "correct",
  ).length;
  const developingProofs = proofEvidence.filter(
    entry => entry.verdict === "partial",
  ).length;
  const repairProofs = proofEvidence.filter(
    entry => entry.verdict === "repair",
  ).length;
  const deferredProofs = proofEvidence.filter(
    entry => entry.verdict === "parked",
  ).length;

  return {
    totalDecks: decks.length,
    coveredDecks,
    remainingDecks: Math.max(0, decks.length - coveredDecks),
    totalProofs: proofDecks.length,
    recordedProofs: proofEvidence.length,
    openProofs: Math.max(0, proofDecks.length - proofEvidence.length),
    secureProofs,
    developingProofs,
    repairProofs,
    deferredProofs,
    needsAttentionProofs: developingProofs + repairProofs + deferredProofs,
  };
}
