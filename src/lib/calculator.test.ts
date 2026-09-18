import { describe, it, expect } from "vitest";
import { computeTVM, defaultTVMState } from "./calculator";

describe("BA II Plus TVM Engine", () => {
  it("calculates PV of an ordinary annuity", () => {
    const state = { ...defaultTVMState(), N: 5, IY: 10, PMT: 100, FV: 0 };
    const pv = computeTVM("PV", state);
    expect(pv).toBeCloseTo(-379.0787, 4);
  });

  it("calculates PV of an annuity due (BGN mode)", () => {
    const state = { ...defaultTVMState(), N: 5, IY: 10, PMT: 100, FV: 0, isBGN: true };
    const pv = computeTVM("PV", state);
    expect(pv).toBeCloseTo(-416.9865, 4);
  });

  it("calculates FV of a single sum", () => {
    const state = { ...defaultTVMState(), N: 10, IY: 5, PV: -1000, PMT: 0 };
    const fv = computeTVM("FV", state);
    expect(fv).toBeCloseTo(1628.8946, 4);
  });

  it("calculates PMT of a loan", () => {
    const state = { ...defaultTVMState(), N: 360, IY: 6, PV: 200000, FV: 0, PY: 12 };
    const pmt = computeTVM("PMT", state);
    expect(pmt).toBeCloseTo(-1199.1011, 4);
  });

  it("calculates N for a savings goal", () => {
    const state = { ...defaultTVMState(), IY: 8, PV: -5000, PMT: -1000, FV: 100000 };
    const n = computeTVM("N", state);
    expect(n).toBeCloseTo(24.1778, 4);
  });

  it("calculates I/Y for a cash flow stream", () => {
    const state = { ...defaultTVMState(), N: 10, PV: -1000, PMT: 50, FV: 1000 };
    const iy = computeTVM("IY", state);
    expect(iy).toBeCloseTo(5.0, 4);
  });

  it("calculates I/Y for a premium bond", () => {
    const state = { ...defaultTVMState(), N: 10, PV: -1050, PMT: 50, FV: 1000 };
    const iy = computeTVM("IY", state);
    expect(iy).toBeCloseTo(4.3721, 4);
  });

  it("handles zero interest rate correctly", () => {
    const state = { ...defaultTVMState(), N: 5, IY: 0, PMT: 100, FV: 0 };
    const pv = computeTVM("PV", state);
    expect(pv).toBe(-500);
  });

  it("throws error for mathematically impossible N", () => {
    const state = { ...defaultTVMState(), IY: 10, PV: -100, PMT: 5, FV: 0 };
    expect(() => computeTVM("N", state)).toThrow();
  });
});
