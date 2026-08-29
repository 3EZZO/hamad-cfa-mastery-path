import { describe, expect, it } from "vitest";
import { resolveLinearSessionAction } from "./linearSessionFlow";

describe("resolveLinearSessionAction", () => {
  it("moves through Teach, Ask, and Answer in order", () => {
    expect(
      resolveLinearSessionAction({
        phase: "teach",
        isProof: false,
        isCovered: false,
        evidenceReady: false,
      })
    ).toEqual({ kind: "move-to-phase", phase: "ask" });
    expect(
      resolveLinearSessionAction({
        phase: "ask",
        isProof: false,
        isCovered: false,
        evidenceReady: false,
      })
    ).toEqual({ kind: "move-to-phase", phase: "answer" });
  });

  it("adds an evidence step only for an uncovered proof", () => {
    expect(
      resolveLinearSessionAction({
        phase: "answer",
        isProof: true,
        isCovered: false,
        evidenceReady: false,
      })
    ).toEqual({ kind: "move-to-phase", phase: "evidence" });
    expect(
      resolveLinearSessionAction({
        phase: "evidence",
        isProof: true,
        isCovered: false,
        evidenceReady: true,
      })
    ).toEqual({ kind: "record-evidence" });
    expect(
      resolveLinearSessionAction({
        phase: "evidence",
        isProof: true,
        isCovered: false,
        evidenceReady: false,
      })
    ).toEqual({ kind: "focus-evidence" });
  });

  it("advances after a teaching deck or an already-covered proof", () => {
    expect(
      resolveLinearSessionAction({
        phase: "answer",
        isProof: false,
        isCovered: false,
        evidenceReady: false,
      })
    ).toEqual({ kind: "advance-deck" });
    expect(
      resolveLinearSessionAction({
        phase: "answer",
        isProof: true,
        isCovered: true,
        evidenceReady: false,
      })
    ).toEqual({ kind: "advance-deck" });
  });
});
