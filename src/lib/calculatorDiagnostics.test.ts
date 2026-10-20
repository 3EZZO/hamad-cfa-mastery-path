import { describe, expect, it } from "vitest";
import { analyzeKeystrokes } from "./calculatorDiagnostics";
import { defaultTVMState } from "./calculator";
import type { KeystrokeLog } from "../features/practice/BA2Plus";

const log = (key: string): KeystrokeLog => ({
  key,
  timestamp: 0,
  display: "1,000.00",
  registers: { ...defaultTVMState(), N: 10, IY: 5, PV: 1000, FV: 2000 },
});

describe("calculator coaching across worksheets", () => {
  it("does not issue TVM sign or stale-register warnings for another worksheet", () => {
    expect(analyzeKeystrokes([log("CPT NPV"), log("CPT IRR"), log("CPT PRI")])).toEqual([]);
  });
  it("preserves TVM sign and stale-register coaching for a TVM computation", () => {
    expect(analyzeKeystrokes([log("CPT PMT")]).map((warning) => warning.type)).toEqual([
      "STALE_DATA",
      "SIGN_CONVENTION",
    ]);
  });
  it("does not count a worksheet computation as solving entered TVM registers", () => {
    expect(
      analyzeKeystrokes([log("N"), log("IY"), log("PV"), log("CPT NPV")]).map(
        (warning) => warning.type,
      ),
    ).toEqual(["MISSING_CPT"]);
  });
});
