export interface TVMState {
  N: number;
  IY: number;
  PV: number;
  PMT: number;
  FV: number;
  PY: number;
  CY: number;
  isBGN: boolean;
}

export const defaultTVMState = (): TVMState => ({
  N: 0,
  IY: 0,
  PV: 0,
  PMT: 0,
  FV: 0,
  PY: 1,
  CY: 1,
  isBGN: false,
});

export interface CashFlowState {
  values: number[];
}

export const defaultCashFlowState = (): CashFlowState => ({ values: [0] });

export type ArithmeticOperator = "add" | "subtract" | "multiply" | "divide" | "power";
export type UnaryOperation = "percent" | "squareRoot" | "square" | "reciprocal" | "naturalLog";

export function computeArithmetic(
  left: number,
  operator: ArithmeticOperator,
  right: number,
): number {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    throw new Error("Error 5: Invalid arithmetic input");
  }

  let result: number;
  switch (operator) {
    case "add":
      result = left + right;
      break;
    case "subtract":
      result = left - right;
      break;
    case "multiply":
      result = left * right;
      break;
    case "divide":
      if (right === 0) throw new Error("Error 5: Division by zero");
      result = left / right;
      break;
    case "power":
      result = Math.pow(left, right);
      break;
  }

  if (!Number.isFinite(result)) {
    throw new Error("Error 5: Arithmetic result is outside the calculator range");
  }
  return result;
}

export function computeUnary(value: number, operation: UnaryOperation): number {
  if (!Number.isFinite(value)) {
    throw new Error("Error 5: Invalid arithmetic input");
  }

  let result: number;
  switch (operation) {
    case "percent":
      result = value / 100;
      break;
    case "squareRoot":
      if (value < 0) throw new Error("Error 5: Square root requires a non-negative value");
      result = Math.sqrt(value);
      break;
    case "square":
      result = value * value;
      break;
    case "reciprocal":
      if (value === 0) throw new Error("Error 5: Reciprocal of zero is undefined");
      result = 1 / value;
      break;
    case "naturalLog":
      if (value <= 0) throw new Error("Error 5: Natural log requires a positive value");
      result = Math.log(value);
      break;
  }

  if (!Number.isFinite(result)) {
    throw new Error("Error 5: Arithmetic result is outside the calculator range");
  }
  return result;
}

function validateCashFlows(cashFlows: readonly number[]): void {
  if (cashFlows.length < 2) {
    throw new Error("Error 5: Enter CF0 and at least one future cash flow");
  }
  if (cashFlows.length > 100 || cashFlows.some(value => !Number.isFinite(value))) {
    throw new Error("Error 5: Invalid cash-flow worksheet");
  }
}

export function computeNPV(
  cashFlows: readonly number[],
  discountRatePercent: number,
): number {
  validateCashFlows(cashFlows);
  if (!Number.isFinite(discountRatePercent) || discountRatePercent <= -100) {
    throw new Error("Error 5: Invalid discount rate");
  }
  const rate = discountRatePercent / 100;
  return cashFlows.reduce(
    (total, cashFlow, period) =>
      total + cashFlow / Math.pow(1 + rate, period),
    0,
  );
}

export function computeIRR(cashFlows: readonly number[]): number {
  validateCashFlows(cashFlows);
  if (
    !cashFlows.some(value => value < 0) ||
    !cashFlows.some(value => value > 0)
  ) {
    throw new Error("Error 5: IRR requires positive and negative cash flows");
  }

  const npvAtZero = computeNPV(cashFlows, 0);
  if (Math.abs(npvAtZero) < 1e-10) return 0;

  // Scan a logarithmic rate domain from nearly -100% to 100,000%. This finds
  // a stable bracket before bisection and avoids silently returning a Newton
  // iteration that converged to an unrelated or non-finite value.
  const lowerLog = Math.log(0.0001);
  const upperLog = Math.log(1001);
  let previousRate = Math.exp(lowerLog) - 1;
  let previousValue = computeNPV(cashFlows, previousRate * 100);

  for (let index = 1; index <= 800; index += 1) {
    const position = lowerLog + ((upperLog - lowerLog) * index) / 800;
    const rate = Math.exp(position) - 1;
    const value = computeNPV(cashFlows, rate * 100);
    if (Math.abs(value) < 1e-10) return rate * 100;
    if (
      Number.isFinite(previousValue) &&
      Number.isFinite(value) &&
      Math.sign(previousValue) !== Math.sign(value)
    ) {
      let low = previousRate;
      let high = rate;
      let lowValue = previousValue;
      for (let iteration = 0; iteration < 160; iteration += 1) {
        const midpoint = (low + high) / 2;
        const midpointValue = computeNPV(cashFlows, midpoint * 100);
        if (Math.abs(midpointValue) < 1e-10 || Math.abs(high - low) < 1e-12) {
          return midpoint * 100;
        }
        if (Math.sign(lowValue) === Math.sign(midpointValue)) {
          low = midpoint;
          lowValue = midpointValue;
        } else {
          high = midpoint;
        }
      }
      return ((low + high) / 2) * 100;
    }
    previousRate = rate;
    previousValue = value;
  }

  throw new Error("Error 5: No IRR solution");
}

/**
 * Interest rate per payment period, as the BA II Plus derives it from I/Y
 * (nominal annual %), P/Y (payments per year) and C/Y (compounding periods
 * per year): i = (1 + I/Y / (100 × C/Y))^(C/Y / P/Y) − 1. When C/Y = P/Y
 * this equals I/Y / (100 × P/Y); that exact expression is kept so default
 * results are unchanged.
 */
export function periodicRate(IY: number, PY: number, CY: number): number {
  if (CY === PY) return IY / 100 / PY;
  return Math.pow(1 + IY / (100 * CY), CY / PY) - 1;
}

/** Inverse of periodicRate: I/Y = 100 × C/Y × ((1 + i)^(P/Y / C/Y) − 1). */
export function annualRateFromPeriodic(i: number, PY: number, CY: number): number {
  if (CY === PY) return i * 100 * PY;
  return 100 * CY * (Math.pow(1 + i, PY / CY) - 1);
}

export function computeTVM(
  target: "N" | "IY" | "PV" | "PMT" | "FV",
  state: TVMState
): number {
  const { N, IY, PV, PMT, FV, PY, CY, isBGN } = state;
  const mode = isBGN ? 1 : 0;

  // N counts payments; the rate is per payment period (C/Y-aware).
  const i = periodicRate(IY, PY, CY);

  if (target === "PV") {
    if (i === 0) return -(FV + PMT * N);
    const pv = - (PMT * (1 + i * mode) * (1 - Math.pow(1 + i, -N)) / i + FV * Math.pow(1 + i, -N));
    return pv;
  }

  if (target === "FV") {
    if (i === 0) return -(PV + PMT * N);
    const fv = - (PV * Math.pow(1 + i, N) + PMT * (1 + i * mode) * (Math.pow(1 + i, N) - 1) / i);
    return fv;
  }

  if (target === "PMT") {
    if (i === 0) return -(PV + FV) / N;
    const pmt = (-PV - FV * Math.pow(1 + i, -N)) / ((1 + i * mode) * (1 - Math.pow(1 + i, -N)) / i);
    return pmt;
  }

  if (target === "N") {
    if (i === 0) return -(PV + FV) / PMT;
    const t1 = PMT * (1 + i * mode) - FV * i;
    const t2 = PMT * (1 + i * mode) + PV * i;
    if (t1 / t2 <= 0) throw new Error("Error 5: No solution"); // Domain error for log
    const n = Math.log(t1 / t2) / Math.log(1 + i);
    return n;
  }

  if (target === "IY") {
    // We must solve: f(i) = PV + PMT*(1+i*mode)*[1-(1+i)^-N]/i + FV*(1+i)^-N = 0
    // If N is 0, no interest rate can be found if PV + FV != 0 (or infinite).
    if (N === 0) throw new Error("Error 5: N is zero");
    
    // We use the secant method to solve for i
    const f = (rate: number) => {
      if (rate === 0) return PV + PMT * N + FV;
      return PV + PMT * (1 + rate * mode) * (1 - Math.pow(1 + rate, -N)) / rate + FV * Math.pow(1 + rate, -N);
    };

    let i0 = 0.1;
    let i1 = -0.1;
    let f0 = f(i0);
    let f1 = f(i1);

    for (let iter = 0; iter < 100; iter++) {
      if (Math.abs(f1 - f0) < 1e-12) break;
      const i2 = i1 - f1 * (i1 - i0) / (f1 - f0);
      const f2 = f(i2);
      if (Math.abs(f2) < 1e-9) {
        return annualRateFromPeriodic(i2, PY, CY);
      }
      i0 = i1;
      f0 = f1;
      i1 = i2;
      f1 = f2;
    }
    // Secant can diverge from its ±10% start when N is large (e.g. 300
    // monthly payments). Fall back to bisection on the first sign change
    // across typical per-period rates; results the secant finds are unchanged.
    const grid = [-0.99, -0.5, -0.2, -0.1, -0.05, -0.01, -0.001, 1e-9, 0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
    for (let k = 0; k < grid.length - 1; k++) {
      let lo = grid[k];
      let hi = grid[k + 1];
      let fLo = f(lo);
      const fHi = f(hi);
      if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || Math.sign(fLo) === Math.sign(fHi)) continue;
      for (let iter = 0; iter < 200; iter++) {
        const mid = (lo + hi) / 2;
        const fMid = f(mid);
        if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-15) return annualRateFromPeriodic(mid, PY, CY);
        if (Math.sign(fMid) === Math.sign(fLo)) {
          lo = mid;
          fLo = fMid;
        } else {
          hi = mid;
        }
      }
      return annualRateFromPeriodic((lo + hi) / 2, PY, CY);
    }
    throw new Error("Error 5: No solution");
  }

  return 0;
}
