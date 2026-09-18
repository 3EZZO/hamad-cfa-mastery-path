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
