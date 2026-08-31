export type PacingStatus = "ahead" | "on-pace" | "behind";

export interface PacingAssistantInput {
  sessionDurationMinutes: number;
  elapsedMinutes: number;
  totalRouteDecks: number;
  currentDeck: number;
  completedDecks: number;
  breakAllowanceMinutes?: number;
}

export interface RecommendedDeckTargetInput {
  sessionDurationMinutes: number;
  expectedSeconds: Array<number | null | undefined>;
  breakAllowanceMinutes?: number;
  fallbackSecondsPerDeck?: number;
}

export interface PaceRange {
  fastestMinutesPerDeck: number;
  slowestMinutesPerDeck: number;
}

export interface PacingCheckpointGuidance {
  targetCompletedDecks: number;
  scheduledElapsedMinutes: number;
  minutesUntil: number;
  decksUntil: number;
  state: "upcoming" | "overdue";
}

export interface PacingBreakGuidance {
  recommendedAfterDeck: number;
  scheduledElapsedMinutes: number;
  minutesUntil: number;
  remainingBreakMinutes: number;
  state: "upcoming" | "due" | "complete";
}

export interface PacingAssistantResult {
  usableTeachingMinutes: number;
  breakAllowanceMinutes: number;
  elapsedTeachingMinutes: number;
  remainingDecks: number;
  averageMinutesPerCompletedDeck: number | null;
  targetMinutesPerDeck: number;
  targetPaceRange: PaceRange;
  expectedCompletedDecks: number;
  deckDelta: number;
  status: PacingStatus;
  projectedFinishMinutes: number;
  projectedOverrunMinutes: number;
  nextCheckpoint: PacingCheckpointGuidance | null;
  breakGuidance: PacingBreakGuidance | null;
  guidance: string;
}

const MIN_SESSION_MINUTES = 120;
const MAX_SESSION_MINUTES = 180;
const PACE_TOLERANCE = 0.1;
const CHECKPOINT_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

function finiteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function validateInput(
  input: PacingAssistantInput
): Required<PacingAssistantInput> {
  const sessionDurationMinutes = finiteNumber(
    input.sessionDurationMinutes,
    "sessionDurationMinutes"
  );
  const elapsedMinutes = finiteNumber(input.elapsedMinutes, "elapsedMinutes");
  const totalRouteDecks = finiteNumber(
    input.totalRouteDecks,
    "totalRouteDecks"
  );
  const currentDeck = finiteNumber(input.currentDeck, "currentDeck");
  const completedDecks = finiteNumber(input.completedDecks, "completedDecks");
  const breakAllowanceMinutes = finiteNumber(
    input.breakAllowanceMinutes ?? 0,
    "breakAllowanceMinutes"
  );

  if (
    sessionDurationMinutes < MIN_SESSION_MINUTES ||
    sessionDurationMinutes > MAX_SESSION_MINUTES
  ) {
    throw new RangeError("sessionDurationMinutes must be between 120 and 180.");
  }
  if (elapsedMinutes < 0) {
    throw new RangeError("elapsedMinutes cannot be negative.");
  }
  if (!Number.isInteger(totalRouteDecks) || totalRouteDecks < 1) {
    throw new RangeError("totalRouteDecks must be a positive integer.");
  }
  if (
    !Number.isInteger(currentDeck) ||
    currentDeck < 1 ||
    currentDeck > totalRouteDecks
  ) {
    throw new RangeError("currentDeck must identify a deck in the route.");
  }
  if (
    !Number.isInteger(completedDecks) ||
    completedDecks < 0 ||
    completedDecks > totalRouteDecks
  ) {
    throw new RangeError("completedDecks must be an integer within the route.");
  }
  if (
    breakAllowanceMinutes < 0 ||
    breakAllowanceMinutes >= sessionDurationMinutes
  ) {
    throw new RangeError(
      "breakAllowanceMinutes must be non-negative and shorter than the session."
    );
  }

  return {
    sessionDurationMinutes,
    elapsedMinutes,
    totalRouteDecks,
    currentDeck,
    completedDecks,
    breakAllowanceMinutes,
  };
}

/**
 * Converts the authored per-deck timing estimates into a realistic live target.
 * The full 120-deck library remains available; this target only governs pacing
 * for the ordered subset that fits inside today's teaching window.
 */
export function deriveRecommendedDeckTarget(
  input: RecommendedDeckTargetInput
): number {
  const sessionDurationMinutes = finiteNumber(
    input.sessionDurationMinutes,
    "sessionDurationMinutes"
  );
  const breakAllowanceMinutes = finiteNumber(
    input.breakAllowanceMinutes ?? 5,
    "breakAllowanceMinutes"
  );
  const fallbackSecondsPerDeck = finiteNumber(
    input.fallbackSecondsPerDeck ?? 150,
    "fallbackSecondsPerDeck"
  );
  if (
    sessionDurationMinutes < MIN_SESSION_MINUTES ||
    sessionDurationMinutes > MAX_SESSION_MINUTES
  ) {
    throw new RangeError("sessionDurationMinutes must be between 120 and 180.");
  }
  if (
    breakAllowanceMinutes < 0 ||
    breakAllowanceMinutes >= sessionDurationMinutes
  ) {
    throw new RangeError(
      "breakAllowanceMinutes must be non-negative and shorter than the session."
    );
  }
  if (fallbackSecondsPerDeck < 30) {
    throw new RangeError("fallbackSecondsPerDeck must be at least 30 seconds.");
  }
  if (!input.expectedSeconds.length) return 0;

  const budgetSeconds = (sessionDurationMinutes - breakAllowanceMinutes) * 60;
  let usedSeconds = 0;
  let target = 0;
  for (const expectedValue of input.expectedSeconds) {
    const expectedSeconds =
      typeof expectedValue === "number" &&
      Number.isFinite(expectedValue) &&
      expectedValue >= 30
        ? expectedValue
        : fallbackSecondsPerDeck;
    if (target > 0 && usedSeconds + expectedSeconds > budgetSeconds) break;
    usedSeconds += expectedSeconds;
    target += 1;
  }
  return Math.min(input.expectedSeconds.length, Math.max(1, target));
}

function checkpointGuidance(
  input: Required<PacingAssistantInput>,
  usableTeachingMinutes: number
): PacingCheckpointGuidance | null {
  for (const fraction of CHECKPOINT_FRACTIONS) {
    const targetCompletedDecks = Math.ceil(input.totalRouteDecks * fraction);
    if (targetCompletedDecks <= input.completedDecks) continue;
    const scheduledElapsedMinutes = usableTeachingMinutes * fraction;
    const minutesUntil = Math.max(
      0,
      scheduledElapsedMinutes - input.elapsedMinutes
    );
    return {
      targetCompletedDecks,
      scheduledElapsedMinutes,
      minutesUntil,
      decksUntil: Math.max(
        0,
        targetCompletedDecks -
          Math.max(input.completedDecks, input.currentDeck - 1)
      ),
      state:
        input.elapsedMinutes > scheduledElapsedMinutes ? "overdue" : "upcoming",
    };
  }
  return null;
}

function breakGuidance(
  input: Required<PacingAssistantInput>,
  usableTeachingMinutes: number
): PacingBreakGuidance | null {
  if (!input.breakAllowanceMinutes) return null;
  const scheduledElapsedMinutes = usableTeachingMinutes / 2;
  const recommendedAfterDeck = Math.ceil(input.totalRouteDecks / 2);
  // The live timer pauses with the tutor, so elapsedMinutes cannot tell us how
  // much wall-clock break time passed. Advancing beyond the midpoint deck is
  // the durable signal that teaching resumed after the break opportunity.
  if (input.completedDecks > recommendedAfterDeck) {
    return {
      recommendedAfterDeck,
      scheduledElapsedMinutes,
      minutesUntil: 0,
      remainingBreakMinutes: 0,
      state: "complete",
    };
  }
  const due =
    input.elapsedMinutes >= scheduledElapsedMinutes ||
    input.completedDecks >= recommendedAfterDeck;
  return {
    recommendedAfterDeck,
    scheduledElapsedMinutes,
    minutesUntil: due
      ? 0
      : Math.max(0, scheduledElapsedMinutes - input.elapsedMinutes),
    remainingBreakMinutes: input.breakAllowanceMinutes,
    state: due ? "due" : "upcoming",
  };
}

function statusGuidance(
  status: PacingStatus,
  deckDelta: number,
  nextCheckpoint: PacingCheckpointGuidance | null
): string {
  const checkpoint = nextCheckpoint
    ? `Next checkpoint: ${nextCheckpoint.targetCompletedDecks} decks by minute ${Math.round(nextCheckpoint.scheduledElapsedMinutes)}.`
    : "The route checkpoint target is complete.";
  if (status === "ahead") {
    return `Ahead by about ${Math.max(1, Math.round(deckDelta))} deck(s). Protect explanation quality. ${checkpoint}`;
  }
  if (status === "behind") {
    return `Behind by about ${Math.max(1, Math.round(-deckDelta))} deck(s). Fast-pass secure material and park unresolved items. ${checkpoint}`;
  }
  return `On pace. Keep the current Teach–Ask–Answer rhythm. ${checkpoint}`;
}

/**
 * Produces an active-teaching-clock forecast. The Session Mode timer stops
 * while paused, so a configured midpoint break is reserved from the teaching
 * budget but never subtracted from elapsed time a second time.
 */
export function calculateSessionPacing(
  inputValue: PacingAssistantInput
): PacingAssistantResult {
  const input = validateInput(inputValue);
  const usableTeachingMinutes =
    input.sessionDurationMinutes - input.breakAllowanceMinutes;
  const elapsedTeachingMinutes = input.elapsedMinutes;
  const remainingDecks = input.totalRouteDecks - input.completedDecks;
  const targetMinutesPerDeck = usableTeachingMinutes / input.totalRouteDecks;
  const targetPaceRange = {
    fastestMinutesPerDeck: targetMinutesPerDeck * (1 - PACE_TOLERANCE),
    slowestMinutesPerDeck: targetMinutesPerDeck * (1 + PACE_TOLERANCE),
  };
  const averageMinutesPerCompletedDeck = input.completedDecks
    ? elapsedTeachingMinutes / input.completedDecks
    : null;
  const expectedCompletedDecks = Math.min(
    input.totalRouteDecks,
    (elapsedTeachingMinutes / usableTeachingMinutes) * input.totalRouteDecks
  );
  const deckDelta = input.completedDecks - expectedCompletedDecks;
  const deckTolerance = Math.max(1, input.totalRouteDecks * 0.02);
  const status: PacingStatus =
    deckDelta > deckTolerance
      ? "ahead"
      : deckDelta < -deckTolerance
        ? "behind"
        : "on-pace";
  const observedMinutesPerDeck =
    averageMinutesPerCompletedDeck ?? targetMinutesPerDeck;
  const projectedFinishMinutes =
    remainingDecks === 0
      ? input.elapsedMinutes
      : input.elapsedMinutes + remainingDecks * observedMinutesPerDeck;
  const nextCheckpoint = checkpointGuidance(input, usableTeachingMinutes);

  return {
    usableTeachingMinutes,
    breakAllowanceMinutes: input.breakAllowanceMinutes,
    elapsedTeachingMinutes,
    remainingDecks,
    averageMinutesPerCompletedDeck,
    targetMinutesPerDeck,
    targetPaceRange,
    expectedCompletedDecks,
    deckDelta,
    status,
    projectedFinishMinutes,
    projectedOverrunMinutes: projectedFinishMinutes - usableTeachingMinutes,
    nextCheckpoint,
    breakGuidance: breakGuidance(input, usableTeachingMinutes),
    guidance: statusGuidance(status, deckDelta, nextCheckpoint),
  };
}
