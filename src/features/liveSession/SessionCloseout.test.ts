import { describe, expect, it } from "vitest";
import type {
  EvidenceVerdict,
  LiveSessionEvidence,
  LiveSessionStage,
} from "./types";
import { inferMastery } from "./SessionCloseout";

const stage: LiveSessionStage = {
  id: "statistics",
  order: 1,
  label: "Stage 01",
  title: "Statistical Characteristics of Asset Returns",
  durationMinutes: 20,
  objective: "Interpret covariance and correlation.",
  questions: [
    {
      id: "correlation-proof",
      kind: "question",
      prompt: "Calculate and interpret correlation.",
      answer: "0.40",
    },
  ],
};

function evidence(
  id: string,
  verdict: EvidenceVerdict,
): LiveSessionEvidence {
  return {
    id,
    stageId: stage.id,
    targetId: "correlation-proof",
    targetLabel: "Correlation proof",
    verdict,
    confidence: 3,
    errorCodes: verdict === "repair" ? ["A"] : [],
    note: "",
    recordedAt: "2026-09-05T09:00:00.000Z",
  };
}

describe("inferMastery", () => {
  it("uses the latest reassessment instead of retaining a repaired result", () => {
    expect(
      inferMastery(stage, [
        evidence("first", "repair"),
        evidence("retest", "correct"),
      ]),
    ).toBe("green");
  });

  it("keeps a stage amber when the latest proof still needs repair", () => {
    expect(
      inferMastery(stage, [
        evidence("first", "correct"),
        evidence("retest", "repair"),
      ]),
    ).toBe("amber");
  });
});
