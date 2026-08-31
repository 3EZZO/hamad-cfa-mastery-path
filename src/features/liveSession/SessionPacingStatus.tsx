import type { PacingAssistantResult } from "./pacingAssistant";

export type SessionPacingDisplayState =
  "calibrating" | "paused" | "ahead" | "on-pace" | "behind" | "complete";

export interface SessionPacingStatusProps {
  pacing: PacingAssistantResult | null;
  completedDecks: number;
  targetDecks: number;
  paused?: boolean;
  calibrating?: boolean;
  showDetails?: boolean;
  className?: string;
}

function normalizedCount(value: number, maximum?: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.max(0, Math.round(value));
  return maximum === undefined ? rounded : Math.min(maximum, rounded);
}

export function resolveSessionPacingDisplayState(
  pacing: PacingAssistantResult | null,
  completedDecks: number,
  targetDecks: number,
  paused: boolean,
  calibrating: boolean
): SessionPacingDisplayState {
  if (targetDecks > 0 && completedDecks >= targetDecks) return "complete";
  if (paused) return "paused";
  if (
    calibrating ||
    !pacing ||
    pacing.averageMinutesPerCompletedDeck === null
  ) {
    return "calibrating";
  }
  return pacing.status;
}

export function sessionPacingStateLabel(
  state: SessionPacingDisplayState,
  pacing: PacingAssistantResult | null
): string {
  if (state === "complete") return "Live target complete";
  if (state === "paused") return "Pace paused";
  if (state === "calibrating") return "Calibrating pace";
  if (state === "on-pace") return "On pace";
  const decks = Math.max(1, Math.round(Math.abs(pacing?.deckDelta ?? 0)));
  return state === "ahead"
    ? `Ahead ${decks} deck${decks === 1 ? "" : "s"}`
    : `Behind ${decks} deck${decks === 1 ? "" : "s"}`;
}

function projectionLabel(
  state: SessionPacingDisplayState,
  pacing: PacingAssistantResult | null
): string | null {
  if (!pacing || state === "calibrating" || state === "complete") return null;
  if (pacing.projectedOverrunMinutes > 0.5) {
    return `+${Math.ceil(pacing.projectedOverrunMinutes)} teaching min`;
  }
  return `Teaching finish near ${Math.round(pacing.projectedFinishMinutes)} min`;
}

function checkpointLabel(pacing: PacingAssistantResult): string | null {
  const checkpoint = pacing.nextCheckpoint;
  if (!checkpoint) return null;
  return checkpoint.state === "overdue"
    ? `Checkpoint overdue: reach ${checkpoint.targetCompletedDecks} decks`
    : `Checkpoint ${checkpoint.targetCompletedDecks} by minute ${Math.round(checkpoint.scheduledElapsedMinutes)}`;
}

function breakLabel(pacing: PacingAssistantResult): string | null {
  const guidance = pacing.breakGuidance;
  if (!guidance || guidance.state === "complete") return null;
  const minutes = Math.max(1, Math.round(pacing.breakAllowanceMinutes));
  return guidance.state === "due"
    ? `Pause timer for ${minutes}-minute break`
    : `Break in ${Math.ceil(guidance.minutesUntil)} min`;
}

/** Compact, presentation-only pacing copy suitable for the live action rail. */
export function SessionPacingStatus({
  pacing,
  completedDecks: completedValue,
  targetDecks: targetValue,
  paused = false,
  calibrating = false,
  showDetails = false,
  className,
}: SessionPacingStatusProps) {
  const targetDecks = Math.max(1, normalizedCount(targetValue));
  const completedDecks = normalizedCount(completedValue, targetDecks);
  const state = resolveSessionPacingDisplayState(
    pacing,
    completedDecks,
    targetDecks,
    paused,
    calibrating
  );
  const label = sessionPacingStateLabel(state, pacing);
  const projection = projectionLabel(state, pacing);
  const checkpoint = pacing ? checkpointLabel(pacing) : null;
  const nextBreak = pacing ? breakLabel(pacing) : null;
  const classes = ["ls-pacing-status", `is-${state}`, className]
    .filter(Boolean)
    .join(" ");
  // Projection changes as the clock advances. Keep the live announcement to
  // the pacing band and deck count so screen readers are not interrupted.
  const accessibleCopy = [
    label,
    `${completedDecks} of ${targetDecks} live-target decks complete`,
  ].join(". ");

  return (
    <span className={classes} data-pacing-state={state}>
      <span
        className="ls-sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {accessibleCopy}
      </span>
      <span className="ls-pacing-status__rail" aria-hidden="true">
        <strong>{label}</strong>
        <span aria-hidden="true">
          {completedDecks}/{targetDecks}
        </span>
        {projection && <small aria-hidden="true">{projection}</small>}
      </span>
      {showDetails && pacing && (
        <span className="ls-pacing-status__details">
          <small>
            {pacing.averageMinutesPerCompletedDeck === null
              ? `Target ${pacing.targetMinutesPerDeck.toFixed(1)} min/deck`
              : `${pacing.averageMinutesPerCompletedDeck.toFixed(1)} min/deck - target ${pacing.targetPaceRange.fastestMinutesPerDeck.toFixed(1)}-${pacing.targetPaceRange.slowestMinutesPerDeck.toFixed(1)}`}
          </small>
          {checkpoint && <small>{checkpoint}</small>}
          {nextBreak && <small>{nextBreak}</small>}
          <small>{pacing.guidance}</small>
        </span>
      )}
    </span>
  );
}
