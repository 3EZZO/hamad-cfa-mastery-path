import { describe, expect, it } from "vitest";
import { mockModuleById } from "../data/mockModules";
import { practiceModuleForTest } from "./practiceLinks";

describe("practiceModuleForTest", () => {
  const fiscal = mockModuleById("e03-fiscal-policy")!;
  const rates = mockModuleById("m01-rates-and-returns")!;

  it("opens the weakest assigned practice set for the test's curriculum module", () => {
    const insights = [{ moduleId: "m002-return-types" }, { moduleId: "m014-fiscal-tools" }, { moduleId: "m014-fiscal-lags" }];
    expect(practiceModuleForTest(fiscal, insights)).toBe("m014-fiscal-tools");
    // QM1 covers Modules 001 and 002.
    expect(practiceModuleForTest(rates, insights)).toBe("m002-return-types");
  });

  it("returns null when no assigned set covers the test", () => {
    expect(practiceModuleForTest(fiscal, [{ moduleId: "m004-tvm" }, { moduleId: "fiscal-without-prefix" }])).toBeNull();
    expect(practiceModuleForTest(fiscal, [])).toBeNull();
  });
});
