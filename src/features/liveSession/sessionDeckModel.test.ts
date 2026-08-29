import { describe, expect, it } from "vitest";
import type {
  LiveSessionEvidence,
  LiveSessionQuestion,
  LiveSessionStage,
} from "./types";
import {
  canRecordEvidenceDraft,
  calculateSessionDeckProgress,
  flattenSessionDecks,
  latestEvidenceByTarget,
  resolveForwardDeck,
  sessionDeckKey,
} from "./sessionDeckModel";

function question(
  id: string,
  kind: LiveSessionQuestion["kind"] = "question",
  expectedSeconds: number | null = 90,
): LiveSessionQuestion {
  return {
    id,
    kind,
    prompt: `Prompt for ${id}`,
    answer: `Answer for ${id}`,
    expectedSeconds,
  };
}

function stage(
  id: string,
  questions?: LiveSessionQuestion[],
): LiveSessionStage {
  return {
    id,
    order: 1,
    label: `Stage ${id}`,
    title: `Title ${id}`,
    durationMinutes: 10,
    objective: `Objective ${id}`,
    questions,
  };
}

function evidence(
  id: string,
  stageId: string,
  targetId: string,
  verdict: LiveSessionEvidence["verdict"],
): LiveSessionEvidence {
  return {
    id,
    stageId,
    targetId,
    targetLabel: targetId,
    verdict,
    confidence: 3,
    errorCodes: verdict === "repair" ? ["D"] : [],
    note: "",
    recordedAt: "2026-09-05T09:00:00.000Z",
  };
}

describe("flattenSessionDecks", () => {
  it("preserves route order and adds global and stage-local positions", () => {
    const stages = [
      stage("returns", [
        question("returns-teach", "concept", 60),
        question("returns-proof", "question", 120),
      ]),
      stage("bridge"),
      stage("tvm", [question("tvm-proof", "question", null)]),
    ];

    const decks = flattenSessionDecks(stages);

    expect(decks).toHaveLength(4);
    expect(decks.map(deck => deck.targetId)).toEqual([
      "returns-teach",
      "returns-proof",
      "bridge",
      "tvm-proof",
    ]);
    expect(decks.map(deck => deck.globalNumber)).toEqual([1, 2, 3, 4]);
    expect(decks.every(deck => deck.globalTotal === 4)).toBe(true);
    expect(decks[1]).toMatchObject({
      key: "returns::returns-proof",
      stageIndex: 0,
      questionIndex: 1,
      stageDeckIndex: 1,
      stageDeckNumber: 2,
      stageDeckTotal: 2,
      isProof: true,
      expectedSeconds: 120,
    });
    expect(decks[2]).toMatchObject({
      key: "bridge::bridge",
      stageIndex: 1,
      questionIndex: 0,
      stageDeckNumber: 1,
      stageDeckTotal: 1,
      isProof: false,
    });
    expect(decks[2]?.question).toBeUndefined();
  });

  it("returns an empty route without creating a phantom deck", () => {
    expect(flattenSessionDecks([])).toEqual([]);
  });
});

describe("latestEvidenceByTarget", () => {
  it("uses append-only action order when a proof is reassessed", () => {
    const first = evidence("e-1", "returns", "proof-1", "repair");
    const second = evidence("e-2", "returns", "proof-1", "correct");
    const other = evidence("e-3", "tvm", "proof-2", "partial");

    const latest = latestEvidenceByTarget([first, second, other]);

    expect(latest.size).toBe(2);
    expect(latest.get("proof-1")).toBe(second);
    expect(latest.get("proof-2")).toBe(other);
  });
});

describe("canRecordEvidenceDraft", () => {
  it("requires a repair code and a reason when a proof is deferred", () => {
    expect(canRecordEvidenceDraft({ verdict: null, confidence: 3, errorCodes: [], note: "" })).toBe(false);
    expect(canRecordEvidenceDraft({ verdict: "repair", confidence: 3, errorCodes: [], note: "" })).toBe(false);
    expect(canRecordEvidenceDraft({ verdict: "repair", confidence: 3, errorCodes: ["D"], note: "" })).toBe(true);
    expect(canRecordEvidenceDraft({ verdict: "parked", confidence: 3, errorCodes: [], note: "" })).toBe(false);
    expect(canRecordEvidenceDraft({ verdict: "parked", confidence: 3, errorCodes: [], note: "Return after repair." })).toBe(true);
  });
});

describe("resolveForwardDeck", () => {
  it("expands a filtered queue to the first uncovered curriculum deck", () => {
    const decks = flattenSessionDecks([
      stage("returns", [
        { ...question("core-1", "concept"), tier: "core" },
        { ...question("reinforcement-1", "demonstration"), tier: "reinforcement" },
      ]),
    ]);

    const result = resolveForwardDeck({
      currentDeck: decks[0]!,
      queueDecks: [decks[0]!],
      allDecks: decks,
      evidence: [],
      coveredDeckKeys: [],
      treatCurrentAsCovered: true,
    });

    expect(result).toMatchObject({
      nextDeck: decks[1],
      expandedToAll: true,
      canCloseout: false,
    });
  });

  it("does not allow closeout while the current proof has no evidence", () => {
    const decks = flattenSessionDecks([
      stage("returns", [question("proof-1")]),
    ]);

    expect(
      resolveForwardDeck({
        currentDeck: decks[0]!,
        queueDecks: decks,
        allDecks: decks,
        evidence: [],
      }),
    ).toEqual({ expandedToAll: false, canCloseout: false });
    expect(
      resolveForwardDeck({
        currentDeck: decks[0]!,
        queueDecks: decks,
        allDecks: decks,
        evidence: [evidence("e-1", "returns", "proof-1", "correct")],
      }),
    ).toEqual({ expandedToAll: false, canCloseout: true });
  });
});

describe("calculateSessionDeckProgress", () => {
  it("separates deliberate coverage from latest proof evidence", () => {
    const decks = flattenSessionDecks([
      stage("returns", [
        question("teach-1", "concept"),
        question("proof-1"),
        question("proof-2"),
      ]),
      stage("tvm", [question("proof-3"), question("proof-4")]),
    ]);
    const progress = calculateSessionDeckProgress({
      decks,
      coveredDeckKeys: [sessionDeckKey("returns", "teach-1")],
      evidence: [
        evidence("e-1", "returns", "proof-1", "repair"),
        evidence("e-2", "returns", "proof-1", "correct"),
        evidence("e-3", "returns", "proof-2", "partial"),
        evidence("e-4", "tvm", "proof-3", "repair"),
      ],
    });

    expect(progress).toEqual({
      totalDecks: 5,
      coveredDecks: 4,
      remainingDecks: 1,
      totalProofs: 4,
      recordedProofs: 3,
      openProofs: 1,
      secureProofs: 1,
      developingProofs: 1,
      repairProofs: 1,
      deferredProofs: 0,
      needsAttentionProofs: 2,
    });
  });

  it("returns zero-safe counts for an empty route", () => {
    expect(
      calculateSessionDeckProgress({ decks: [], evidence: [] }),
    ).toEqual({
      totalDecks: 0,
      coveredDecks: 0,
      remainingDecks: 0,
      totalProofs: 0,
      recordedProofs: 0,
      openProofs: 0,
      secureProofs: 0,
      developingProofs: 0,
      repairProofs: 0,
      deferredProofs: 0,
      needsAttentionProofs: 0,
    });
  });
});
