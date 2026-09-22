import { describe, expect, it } from "vitest";
import { intentAllowedFor, parsePracticeIntent, PRACTICE_INTENTS } from "./practiceIntents";
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

  it("limits run-starting intents to accounts that can practise", () => {
    expect(intentAllowedFor("quick5", false)).toBe(false);
    expect(intentAllowedFor("quick5", true)).toBe(true);
    expect(intentAllowedFor("calculator", false)).toBe(true);
  });
});
