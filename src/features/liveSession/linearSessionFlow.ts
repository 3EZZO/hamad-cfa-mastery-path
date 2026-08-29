import type { TeachingFlowStep } from "./types";

export type LinearSessionPhase = TeachingFlowStep | "evidence";

export type LinearSessionAction =
  | { kind: "move-to-phase"; phase: LinearSessionPhase }
  | { kind: "focus-evidence" }
  | { kind: "record-evidence" }
  | { kind: "advance-deck" };

export interface ResolveLinearSessionActionOptions {
  phase: LinearSessionPhase;
  isProof: boolean;
  isCovered: boolean;
  evidenceReady: boolean;
}

/**
 * Keeps the tutor on one deliberate route: Teach -> Ask -> Answer -> optional
 * evidence -> next deck. This is also the single source of truth for Space and
 * the primary Next button, so the two controls can never skip different work.
 */
export function resolveLinearSessionAction({
  phase,
  isProof,
  isCovered,
  evidenceReady,
}: ResolveLinearSessionActionOptions): LinearSessionAction {
  if (phase === "teach") return { kind: "move-to-phase", phase: "ask" };
  if (phase === "ask") return { kind: "move-to-phase", phase: "answer" };

  if (isProof && !isCovered) {
    if (phase === "answer") {
      return { kind: "move-to-phase", phase: "evidence" };
    }
    return evidenceReady
      ? { kind: "record-evidence" }
      : { kind: "focus-evidence" };
  }

  return { kind: "advance-deck" };
}
