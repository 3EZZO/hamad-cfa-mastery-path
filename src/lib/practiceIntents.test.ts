import { describe, expect, it } from "vitest";
import { intentAllowedFor, parsePracticeIntent, parsePracticeModuleSegment, practiceModuleSegment, PRACTICE_INTENTS } from "./practiceIntents";
import { buildHash, parseHash } from "./hashRoute";

describe("practice intents", () => {
  it("round-trips through the hash grammar", () => {
    for (const intent of Object.keys(PRACTICE_INTENTS)) {
      expect(parsePracticeIntent(parseHash(buildHash("practice", intent)).segment)).toBe(intent);
    }
  });

  it("rejects unknown or prototype segments", () => {
    expect(parsePracticeIntent("")).toBeNull();
    expect(parsePracticeIntent("week-7")).toBeNull();
    expect(parsePracticeIntent("toString")).toBeNull();
    expect(parsePracticeIntent("__proto__")).toBeNull();
  });

  it("round-trips a module segment through the hash grammar", () => {
    const segment = parseHash(buildHash("practice", practiceModuleSegment("m004-tvm-valuation"))).segment;
    expect(parsePracticeModuleSegment(segment)).toBe("m004-tvm-valuation");
    expect(parsePracticeIntent(segment)).toBeNull();
    expect(parsePracticeModuleSegment("quick5")).toBeNull();
    expect(parsePracticeModuleSegment("module-")).toBeNull();
  });

  it("runs due review as an ordinary quick set (no new run mode)", () => {
    expect(PRACTICE_INTENTS.review).toMatchObject({ mode: "quick", count: 10 });
    expect(intentAllowedFor("review", false)).toBe(false);
  });

  it("limits run-starting intents to accounts that can practise", () => {
    expect(intentAllowedFor("quick5", false)).toBe(false);
    expect(intentAllowedFor("quick5", true)).toBe(true);
    expect(intentAllowedFor("calculator", false)).toBe(true);
  });
});
