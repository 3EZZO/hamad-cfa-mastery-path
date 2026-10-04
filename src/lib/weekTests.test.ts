import { describe, expect, it } from "vitest";
import { PLAN } from "../data/plan";
import { testsForWeek, weekCatalogIds } from "./weekTests";

describe("testsForWeek", () => {
  it("finds the tests for the modules a week teaches", () => {
    // Week 5 teaches Modules 017-026: International Trade to Exchange Rate Calculations, then Corporate Issuers.
    expect(weekCatalogIds(5)).toContain("cfa-2027-outline-m017");
    expect(testsForWeek(5).map(module => module.id)).toEqual([
      "e06-international-trade",
      "e07-capital-flows-fx-market",
      "e08-exchange-rate-calculations",
    ]);
  });

  it("has no tests outside the plan", () => {
    expect(testsForWeek(0)).toEqual([]);
    expect(testsForWeek(PLAN.length + 1)).toEqual([]);
  });
});
