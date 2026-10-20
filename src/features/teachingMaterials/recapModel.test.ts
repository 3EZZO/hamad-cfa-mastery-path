import { describe, expect, it } from "vitest";
import {
  parseRecap, recapHasContent, recapTitle, requestStudentPage, sanitizeRecapInput, sortRecaps, takeStudentPage,
} from "./recapModel";

const base = { runId: "session-03", sessionNumber: 3, covered: [], keyPages: [], checks: null, nextStep: "" };

describe("session recaps", () => {
  it("keeps only valid, bounded content", () => {
    const input = sanitizeRecapInput({
      ...base,
      covered: [{ label: " Reading 13 · Fiscal Policy ", pages: "4,1-3" }, { label: "", pages: "1" }, { label: "No pages", pages: "x" }],
      keyPages: [{ versionId: "v1", label: "Fiscal Policy — Exhibit 3", page: 9 }, { versionId: "", label: "bad", page: 1 }, { versionId: "v2", label: "bad", page: 0 }],
      checks: { correct: 3, total: 4 },
      nextStep: "  Re-read pp. 15–20.  ",
    })!;
    expect(input.covered).toEqual([{ label: "Reading 13 · Fiscal Policy", pages: "1-4" }]);
    expect(input.keyPages).toEqual([{ versionId: "v1", label: "Fiscal Policy — Exhibit 3", page: 9 }]);
    expect(input.checks).toEqual({ correct: 3, total: 4 });
    expect(input.nextStep).toBe("Re-read pp. 15–20.");
    expect(recapHasContent(input)).toBe(true);
    expect(sanitizeRecapInput({ ...base, checks: { correct: 5, total: 4 } })!.checks).toBeNull();
    expect(sanitizeRecapInput({ ...base, runId: "x" })).toBeNull();
    expect(sanitizeRecapInput({ ...base, sessionNumber: 26 })).toBeNull();
    expect(recapHasContent(sanitizeRecapInput(base)!)).toBe(false);
  });

  it("parses stored recaps and sorts newest session first", () => {
    const stored = { ...base, status: "active", revision: 2, nextStep: "Do the module questions." };
    expect(parseRecap("session-03", stored, 10)).toMatchObject({ status: "active", revision: 2, sentAtMs: 10 });
    expect(parseRecap("session-04", stored, 10)).toBeNull();
    expect(parseRecap("session-03", { ...stored, status: "deleted" }, 10)).toBeNull();
    const sorted = sortRecaps([{ sessionNumber: 2, sentAtMs: 5 }, { sessionNumber: 3, sentAtMs: 1 }]);
    expect(sorted.map(item => item.sessionNumber)).toEqual([3, 2]);
    expect(recapTitle({ sessionNumber: 3 })).toBe("Session 03 recap");
  });

  it("hands a key-page request to the reader exactly once", () => {
    requestStudentPage("v1", 9);
    expect(takeStudentPage("v1")).toBe(9);
    expect(takeStudentPage("v1")).toBeNull();
  });
});
