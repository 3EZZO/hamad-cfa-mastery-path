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
  if (cashFlows.length > 100 || cashFlows.some((value) => !Number.isFinite(value))) {
    throw new Error("Error 5: Invalid cash-flow worksheet");
  }
}

export function computeNPV(cashFlows: readonly number[], discountRatePercent: number): number {
  validateCashFlows(cashFlows);
  if (!Number.isFinite(discountRatePercent) || discountRatePercent <= -100) {
    throw new Error("Error 5: Invalid discount rate");
  }
  const rate = discountRatePercent / 100;
  return cashFlows.reduce(
    (total, cashFlow, period) => total + cashFlow / Math.pow(1 + rate, period),
    0,
  );
}

export function computeIRR(cashFlows: readonly number[]): number {
  validateCashFlows(cashFlows);
  if (!cashFlows.some((value) => value < 0) || !cashFlows.some((value) => value > 0)) {
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
  return Math.expm1((CY / PY) * Math.log1p(IY / (100 * CY)));
}

/** Inverse of periodicRate: I/Y = 100 × C/Y × ((1 + i)^(P/Y / C/Y) − 1). */
export function annualRateFromPeriodic(i: number, PY: number, CY: number): number {
  if (CY === PY) return i * 100 * PY;
  return 100 * CY * Math.expm1((PY / CY) * Math.log1p(i));
}

export function computeTVM(target: "N" | "IY" | "PV" | "PMT" | "FV", state: TVMState): number {
  const { N, IY, PV, PMT, FV, PY, CY, isBGN } = state;
  const invalid = () => {
    throw new Error("Error 5: No solution");
  };
  for (const [key, value] of Object.entries(state)) {
    if (key !== target && key !== "isBGN" && !Number.isFinite(value)) invalid();
  }
  if (PY <= 0 || CY <= 0 || (target !== "N" && N < 0)) invalid();
  const finite = (value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) >= 1e100) return invalid();
    return value;
  };
  if (target === "IY") {
    if (N <= 0 || ![PV, PMT, FV].some((v) => v > 0) || ![PV, PMT, FV].some((v) => v < 0)) invalid();
    if (PMT === 0)
      return finite(annualRateFromPeriodic(Math.expm1(Math.log(-FV / PV) / N), PY, CY));
    const scale = Math.max(Math.abs(PV), Math.abs(PMT), Math.abs(FV), 1);
    // Use present values for positive rates and future values for negative
    // rates. This prevents overflow on long schedules near -100%.
    const f = (u: number) => {
      const rate = Math.expm1(u),
        mode = isBGN ? Math.exp(u) : 1;
      if (Math.abs(u) < 1e-16) return (PV + PMT * N + FV) / scale;
      return u >= 0
        ? (PV + (PMT * mode * -Math.expm1(-N * u)) / rate + FV * Math.exp(-N * u)) / scale
        : (PV * Math.exp(N * u) + (PMT * mode * Math.expm1(N * u)) / rate + FV) / scale;
    };
    if (Math.abs(f(0)) < 1e-14) return 0;
    let low = -20,
      fl = f(low);
    for (let k = 1; k <= 2400; k++) {
      const high = -20 + (40 * k) / 2400,
        fh = f(high);
      if (fh === 0) return finite(annualRateFromPeriodic(Math.expm1(high), PY, CY));
      if (Number.isFinite(fl) && Number.isFinite(fh) && Math.sign(fl) !== Math.sign(fh)) {
        let a = low,
          b = high,
          fa = fl;
        for (let j = 0; j < 200; j++) {
          const m = (a + b) / 2,
            fm = f(m);
          if (Math.abs(fm) < 1e-13 || b - a < 1e-14)
            return finite(annualRateFromPeriodic(Math.expm1(m), PY, CY));
          if (Math.sign(fm) === Math.sign(fa)) {
            a = m;
            fa = fm;
          } else b = m;
        }
      }
      low = high;
      fl = fh;
    }
    return invalid();
  }
  const i = periodicRate(IY, PY, CY);
  if (!Number.isFinite(i) || i <= -1) invalid();
  const mode = isBGN ? 1 + i : 1;
  const log = Math.log1p(i);
  const discount = Math.exp(-N * log);
  const annuity = i === 0 ? N : -Math.expm1(-N * log) / i;
  if (target === "PV") return finite(-(PMT * mode * annuity + FV * discount));
  if (target === "FV")
    return finite(-(PV * Math.exp(N * log) + PMT * mode * (i === 0 ? N : Math.expm1(N * log) / i)));
  if (target === "PMT") {
    if (N === 0 || annuity === 0) invalid();
    return finite((-PV - FV * discount) / (mode * annuity));
  }
  if (i === 0) {
    if (PMT === 0) invalid();
    const periods = -(PV + FV) / PMT;
    if (periods < 0) invalid();
    return finite(periods);
  }
  const numerator = PMT * mode - FV * i,
    denominator = PMT * mode + PV * i;
  if (denominator === 0 || numerator / denominator <= 0) invalid();
  const periods = Math.log(numerator / denominator) / log;
  if (periods < 0) invalid();
  return finite(periods);
}
