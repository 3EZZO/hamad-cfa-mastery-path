/**
 * `#practice/<intent>` segments: a one-shot instruction for Practice Coach,
 * written by the command palette or a pasted link and cleared once acted on.
 */
export const PRACTICE_INTENTS = {
  quick5: { label: "Start Quick 5", hint: "Five adaptive questions", mode: "quick", count: 5 },
  repair: { label: "Start Repair Queue", hint: "Revisit mistakes and uncertainty", mode: "repair", count: 10 },
  exam: { label: "Start Exam Drill", hint: "Twenty timed questions", mode: "exam", count: 20 },
  calculator: { label: "Open BA II Plus", hint: "Calculator drawer", mode: null, count: 0 },
} as const;

export type PracticeIntent = keyof typeof PRACTICE_INTENTS;

export function parsePracticeIntent(segment: string): PracticeIntent | null {
  return Object.prototype.hasOwnProperty.call(PRACTICE_INTENTS, segment)
    ? (segment as PracticeIntent)
    : null;
}

/** Intents that start a run are for the student (or a rehearsal); the calculator is for anyone. */
export function intentAllowedFor(intent: PracticeIntent, canRun: boolean): boolean {
  return PRACTICE_INTENTS[intent].mode === null || canRun;
}
