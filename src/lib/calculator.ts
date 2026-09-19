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

export function computeTVM(
  target: "N" | "IY" | "PV" | "PMT" | "FV",
  state: TVMState
): number {
  const { N, IY, PV, PMT, FV, PY, CY, isBGN } = state;
  const mode = isBGN ? 1 : 0;
  
  // Actually BA II uses I = (1 + IY/100/CY)^(CY/PY) - 1
  // But since we assume CY = PY for now, I = IY / 100 / PY
  const i = IY / 100 / PY;

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
        return i2 * 100 * PY;
      }
      i0 = i1;
      f0 = f1;
      i1 = i2;
      f1 = f2;
    }
    // If secant fails, try a simple bisection as fallback (simplified)
    throw new Error("Error 5: No solution");
  }

  return 0;
}
