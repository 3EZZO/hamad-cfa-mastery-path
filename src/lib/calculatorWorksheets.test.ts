import { describe, expect, it } from "vitest";
import { computeTVM, defaultTVMState } from "./calculator";
import {
  amortize,
  bondPrice,
  bondYield,
  calculatorDateValue,
  combinations,
  dateDays,
  depreciate,
  groupedIRR,
  groupedNPV,
  parseCalculatorDate,
  regressionPrediction,
  roundDecimal,
  statistics,
} from "./calculatorWorksheets";

// TI's published inputs and results, plus independently derived identities.
// See docs/ba2plus-verification.md for source pages and coverage.
describe("cash-flow groups", () => {
  it("matches the TI unequal-flow example without expanding repeated groups", () => {
    // The guide edits the original sequence before computing these results:
    // the 4,000 receipt moves from the last year to year 2.
    const groups = [
      { amount: 3000, frequency: 1 },
      { amount: 4000, frequency: 1 },
      { amount: 5000, frequency: 4 },
    ];
    expect(groupedNPV(-7000, groups, 20)).toBeCloseTo(7266.44, 2);
    expect(groupedIRR(-7000, groups)).toBeCloseTo(52.7053745072, 8);
  });
  it("matches explicit discounting, including zero rates and skipped groups", () => {
    const groups = [
      { amount: 100, frequency: 3 },
      { amount: 123, frequency: 0 },
      { amount: -50, frequency: 2 },
    ];
    for (const rate of [0, 1e-9, -10, 12]) {
      const explicit = [-200, 100, 100, 100, -50, -50].reduce(
        (sum, c, i) => sum + c / (1 + rate / 100) ** i,
        0,
      );
      expect(groupedNPV(-200, groups, rate)).toBeCloseTo(explicit, 8);
    }
    expect(groupedNPV(0, [{ amount: 1, frequency: 9999 }], 0)).toBe(9999);
  });
  it("solves negative and small-scale IRRs and rejects no-sign-change streams", () => {
    expect(groupedIRR(-100, [{ amount: 90, frequency: 1 }])).toBeCloseTo(-10, 8);
    expect(groupedIRR(-1e-8, [{ amount: 1.1e-8, frequency: 1 }])).toBeCloseTo(10, 8);
    expect(() => groupedIRR(100, [{ amount: 10, frequency: 1 }])).toThrow();
  });
});

describe("TVM precision and inverse consistency", () => {
  it("does not lose a very small nonzero interest rate", () => {
    expect(computeTVM("PV", { ...defaultTVMState(), N: 360, IY: 1e-9, PMT: 100 })).toBeCloseTo(
      -36000,
      3,
    );
  });
  it("solves rates back from cash flows over multiple frequencies, horizons and modes", () => {
    for (const N of [1, 5, 300])
      for (const IY of [-2, 0, 6, 25])
        for (const isBGN of [false, true]) {
          const s = { ...defaultTVMState(), N, IY, PV: -1000, PMT: -25, PY: 12, CY: 2, isBGN };
          const FV = computeTVM("FV", s);
          expect(computeTVM("PV", { ...s, FV })).toBeCloseTo(s.PV, 6);
          expect(computeTVM("IY", { ...s, IY: 0, FV })).toBeCloseTo(IY, 6);
        }
  });
  it("rejects undefined or impossible TVM computations rather than storing NaN", () => {
    expect(() => computeTVM("PMT", defaultTVMState())).toThrow();
    expect(() => computeTVM("N", defaultTVMState())).toThrow();
    expect(() => computeTVM("PV", { ...defaultTVMState(), PY: 0 })).toThrow();
    expect(() => computeTVM("IY", { ...defaultTVMState(), N: 10, PV: 100, FV: 100 })).toThrow();
  });
});

describe("amortization with rounded payments", () => {
  it("matches TI first-year loan balance and interest (guide p.39)", () => {
    const s = { ...defaultTVMState(), N: 360, IY: 6.125, PV: 120000, PY: 12, CY: 12 };
    const PMT = computeTVM("PMT", s);
    const result = amortize({ ...s, PMT }, 1, 9);
    expect(result).toEqual({ BAL: 118928.63, PRN: -1071.37, INT: -5490.8 });
    const next = amortize({ ...s, PMT }, 10, 21);
    expect(next).toEqual({ BAL: 117421.6, PRN: -1507.03, INT: -7242.53 });
  });
  it("handles zero interest, beginning payments and invalid ranges", () => {
    expect(amortize({ ...defaultTVMState(), PV: 1000, PMT: -100 }, 1, 3)).toEqual({
      BAL: 700,
      PRN: -300,
      INT: 0,
    });
    expect(
      amortize({ ...defaultTVMState(), PV: 1000, PMT: -100, IY: 12, isBGN: true }, 1, 1),
    ).toEqual({ BAL: 900, PRN: -100, INT: 0 });
    expect(() => amortize(defaultTVMState(), 3, 2)).toThrow();
  });
});

describe("dates and coupon bonds", () => {
  const date = (v: number) => parseCalculatorDate(v);
  const tiBond = {
    settlement: date(6.1206),
    redemption: date(12.3107),
    coupon: 7,
    redeemValue: 100,
    frequency: 2,
    basis: "360" as const,
  };
  it("matches TI clean price and accrued interest on a non-coupon settlement", () => {
    const price = bondPrice(tiBond, 8);
    expect(price.PRI).toBeCloseTo(98.56, 2);
    expect(price.AI).toBeCloseTo(3.15, 8);
    expect(bondYield(tiBond, price.PRI)).toBeCloseTo(8, 8);
  });
  it("prices par coupon-date bonds and handles a single remaining coupon", () => {
    const par = { ...tiBond, settlement: date(12.3105) };
    expect(bondPrice(par, 7).PRI).toBeCloseTo(100, 10);
    expect(bondPrice(par, 7).AI).toBe(0);
    const last = { ...tiBond, settlement: date(9.3007) };
    const result = bondPrice(last, 8);
    expect(bondYield(last, result.PRI)).toBeCloseTo(8, 8);
  });
  it("handles annual coupons, actual days, leap dates and month-end schedules", () => {
    const input = {
      ...tiBond,
      settlement: date(2.2904),
      redemption: date(2.2807),
      frequency: 1,
      basis: "ACT" as const,
    };
    const price = bondPrice(input, 5).PRI;
    expect(bondYield(input, price)).toBeCloseTo(5, 8);
    expect(dateDays(date(2.2824), date(3.0124), "ACT")).toBe(2);
    expect(dateDays(date(1.3124), date(2.2924), "360")).toBe(29);
    expect(dateDays(date(2.2924), date(3.3124), "360")).toBe(32);
    expect(dateDays(date(2.2823), date(3.3123), "360")).toBe(33);
    expect(dateDays(date(3.3123), date(2.2823), "360")).toBe(-32);
    expect(dateDays(date(9.0403), date(11.0103), "ACT")).toBe(58);
    expect(calculatorDateValue(date(2.2924), true)).toBe(29.0224);
    expect(() => date(2.3024)).toThrow();
    expect(() => date(2.2923)).toThrow();
  });
  it("rejects redemption before settlement", () => {
    expect(() => bondPrice({ ...tiBond, redemption: tiBond.settlement }, 8)).toThrow();
  });
  it("solves long-term coupon and zero-coupon yields despite overflowing trial prices", () => {
    const input = { ...tiBond, settlement: date(1.013), redemption: date(1.016), coupon: 6 };
    expect(bondPrice(input, 6).PRI).toBeCloseTo(100, 10);
    expect(bondYield(input, 100)).toBeCloseTo(6, 8);
    const zeroCoupon = { ...input, coupon: 0 };
    const price = 100 / 1.025 ** 60;
    expect(bondPrice(zeroCoupon, 5).PRI).toBeCloseTo(price, 10);
    expect(bondYield(zeroCoupon, price)).toBeCloseTo(5, 8);
    const negativeYieldPrice = 100 / 0.8 ** 60;
    expect(bondYield(zeroCoupon, negativeYieldPrice)).toBeCloseTo(-40, 8);
  });
});

describe("depreciation schedules", () => {
  const building = {
    method: "SL" as const,
    life: 31.5,
    month: 3.5,
    cost: 1000000,
    salvage: 0,
    year: 1,
    factor: 200,
    startDate: parseCalculatorDate(3.1595),
  };
  it("matches TI fractional first year and rounded running book values", () => {
    expect(depreciate(building, 2)).toEqual({ DEP: 25132.28, RBV: 974867.72, RDV: 974867.72 });
    expect(depreciate({ ...building, year: 2 }, 2)).toEqual({
      DEP: 31746.03,
      RBV: 943121.69,
      RDV: 943121.69,
    });
  });
  it("conserves depreciable basis, respects salvage, and crosses from DB to SL", () => {
    for (const method of ["SL", "SYD", "DB", "DBX", "SLF", "DBF"] as const) {
      const input = { ...building, method, life: 5, month: 1, cost: 10000, salvage: 1000 };
      let total = 0;
      for (let year = 1; year <= 7; year++) {
        const out = depreciate({ ...input, year }, 2);
        total += out.DEP;
        expect(out.RBV).toBeGreaterThanOrEqual(1000);
        expect(out.RDV).toBeGreaterThanOrEqual(0);
      }
      expect(total).toBeCloseTo(9000, 6);
    }
    expect(
      depreciate({ ...building, method: "DBX", life: 5, month: 1, cost: 10000, year: 4 }, 2).DEP,
    ).toBe(1080);
  });
  it("rounds half cents consistently and rounds depreciation cost and salvage separately", () => {
    expect(roundDecimal(10.075, 2)).toBe(10.08);
    expect(roundDecimal(-10.075, 2)).toBe(-10.08);
    expect(roundDecimal(1.005, 2)).toBe(1.01);
    expect(roundDecimal(1e25, 2)).toBe(1e25);
    expect(
      depreciate({ ...building, life: 1, month: 1, cost: 100.005, salvage: 0.005 }, 2),
    ).toEqual({ DEP: 100, RBV: 0.01, RDV: 0 });
  });
  it("prorates SLF by actual starting-year days, including leap years", () => {
    const french = {
      ...building,
      method: "SLF" as const,
      life: 5,
      cost: 10000,
      salvage: 1000,
      startDate: parseCalculatorDate(3.1524),
    };
    expect(depreciate(french, 2)).toEqual({ DEP: 1436.07, RBV: 8563.93, RDV: 7563.93 });
    expect(depreciate({ ...french, year: 2 }, 2).DEP).toBe(1800);
    expect(depreciate({ ...french, startDate: parseCalculatorDate(3.1523) }, 2).DEP).toBe(1440);
    expect(depreciate({ ...french, startDate: parseCalculatorDate(1.0124) }, 2).DEP).toBe(1800);
    expect(depreciate({ ...french, startDate: parseCalculatorDate(12.3124) }, 2).DEP).toBe(4.92);
    expect(depreciate({ ...french, year: 6 }, 2).RBV).toBe(1000);
  });
  it("matches the owner's DBF readings and distinguishes French from fractional-life crossover", () => {
    const input = {
      ...building,
      method: "DBF" as const,
      life: 5,
      month: 7,
      cost: 10000,
      salvage: 1000,
    };
    expect([1, 2, 3, 4, 5].map((year) => depreciate({ ...input, year }, 2).DEP)).toEqual([
      2000, 3200, 1920, 1152, 728,
    ]);
    expect(depreciate({ ...input, year: 5 }, 2).RBV).toBe(1000);
    expect(depreciate({ ...input, year: 6 }, 2).DEP).toBe(0);
    expect(depreciate({ ...input, salvage: 0, year: 5 }, 2).DEP).toBe(1440);
    expect(depreciate({ ...input, method: "DBX", salvage: 0, year: 5 }, 2).DEP).toBe(1152);
  });
});

describe("statistics and regressions", () => {
  it("computes frequency-weighted sample/population statistics", () => {
    const out = statistics(
      [
        { x: 2, y: 2 },
        { x: 5, y: 1 },
        { x: 8, y: 2 },
      ],
      "1-V",
    );
    expect(out.n).toBe(5);
    expect(out.x).toBe(5);
    expect(out.Sx).toBe(3);
    expect(out.sigmax).toBeCloseTo(Math.sqrt(7.2), 10);
    expect(out.sumX).toBe(25);
    expect(out.sumX2).toBe(161);
  });
  it.each(["LIN", "Ln", "EXP", "PWR"] as const)(
    "recovers known %s coefficients and predicts both ways",
    (model) => {
      const a = 2,
        b = 0.5;
      const points = [1, 2, 3, 4].map((x) => ({
        x,
        y:
          model === "LIN"
            ? a + b * x
            : model === "Ln"
              ? a + b * Math.log(x)
              : model === "EXP"
                ? a * b ** x
                : a * x ** b,
      }));
      const out = statistics(points, model);
      expect(out.a).toBeCloseTo(a, 10);
      expect(out.b).toBeCloseTo(b, 10);
      expect(out.r).toBeCloseTo(model === "EXP" ? -1 : 1, 10);
      const y = regressionPrediction(model, out.a, out.b, "Y", 2.5);
      expect(regressionPrediction(model, out.a, out.b, "X", y)).toBeCloseTo(2.5, 10);
    },
  );
  it("uses centered moments for high-offset data and rejects empty samples", () => {
    expect(
      statistics(
        [
          { x: 1e12 + 1, y: 1 },
          { x: 1e12 + 2, y: 1 },
          { x: 1e12 + 3, y: 1 },
        ],
        "1-V",
      ).Sx,
    ).toBe(1);
    expect(() => statistics([], "LIN")).toThrow();
  });
  it("reports TI EXP coefficients as the base in a*b^X and transformed summaries", () => {
    const result = statistics(
      [
        { x: 1, y: 6 },
        { x: 2, y: 18 },
        { x: 3, y: 54 },
      ],
      "EXP",
    );
    expect(result.a).toBeCloseTo(2, 12);
    expect(result.b).toBeCloseTo(3, 12);
    expect(result.y).toBeCloseTo(Math.log(18), 12);
    expect(result.sumY).toBeCloseTo(Math.log(6) + Math.log(18) + Math.log(54), 12);
    expect(regressionPrediction("EXP", result.a, result.b, "Y", 4)).toBeCloseTo(162, 10);
    expect(regressionPrediction("EXP", result.a, result.b, "X", 162)).toBeCloseTo(4, 10);
    const logarithmic = statistics(
      [
        { x: 1, y: 2 },
        { x: Math.E, y: 3 },
        { x: Math.E ** 2, y: 4 },
      ],
      "Ln",
    );
    expect(logarithmic.x).toBeCloseTo(1, 12);
    expect(logarithmic.sumX2).toBeCloseTo(5, 12);
    expect(() => statistics([{ x: -1, y: 2 }], "Ln")).toThrow();
    expect(() => regressionPrediction("EXP", 2, 1, "X", 3)).toThrow();
    expect(() => regressionPrediction("PWR", 2, 2, "X", -1)).toThrow();
  });
});

describe("combinatorics", () => {
  it("matches TI card-hand and permutation examples", () => {
    expect(combinations(52, 5)).toBe(2598960);
    expect(combinations(8, 3, true)).toBe(336);
    expect(combinations(9, 0)).toBe(1);
    expect(() => combinations(2, 3)).toThrow();
  });
});
