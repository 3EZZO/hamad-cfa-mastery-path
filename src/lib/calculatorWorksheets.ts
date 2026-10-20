/** Numerical worksheet operations. Dates are UTC calendar dates, never local times.
 * Reference: TI BA II Plus Guidebook, worksheets and formula appendix.
 * https://education.ti.com/html/eguides/financials/pdfs/EN/BA-II-PLUS_EN.pdf
 */
import { periodicRate, type TVMState } from "./calculator";

export class CalculatorError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}
export function checked(value: number): number {
  if (Number.isNaN(value)) throw new CalculatorError(5, "No finite solution");
  if (!Number.isFinite(value) || Math.abs(value) >= 1e100) throw new CalculatorError(1, "Overflow");
  return Math.abs(value) < 1e-99 ? 0 : value;
}
export function requireValue(ok: boolean, code = 5): asserts ok {
  if (!ok) throw new CalculatorError(code, "Invalid worksheet input");
}
export function roundDecimal(value: number, decimals: number): number {
  if (decimals === 9) return Number(value.toPrecision(10));
  // Shift the decimal representation, avoiding binary half-cent artifacts
  // such as 10.075 * 100 becoming 1007.4999999999999.
  const shift = (number: number, places: number) => {
    const [coefficient, exponent = "0"] = number.toString().split("e");
    return Number(`${coefficient}e${Number(exponent) + places}`);
  };
  return Math.sign(value) * shift(Math.round(shift(Math.abs(value), decimals)), -decimals);
}

/** Sign-bracketed solution; callers scale the residual relative to their inputs. */
export function solveRate(fn: (rate: number) => number, minimum = -0.9999999999): number {
  const grid = [
    minimum,
    -0.9999,
    -0.99,
    -0.9,
    -0.5,
    -0.2,
    -0.1,
    -0.05,
    -0.01,
    0,
    0.001,
    0.005,
    0.01,
    0.02,
    0.05,
    0.1,
    0.2,
    0.5,
    1,
    2,
    5,
    10,
    100,
    1000,
    1e6,
  ];
  let lo = grid[0],
    flo = fn(lo);
  for (const hi of grid.slice(1)) {
    if (hi <= minimum) continue;
    const fhi = fn(hi);
    if (fhi === 0) return hi;
    if (!Number.isNaN(flo) && !Number.isNaN(fhi) && Math.sign(flo) !== Math.sign(fhi)) {
      let a = lo,
        b = hi,
        fa = flo;
      for (let i = 0; i < 240; i++) {
        const m = (a + b) / 2,
          fm = fn(m);
        requireValue(!Number.isNaN(fm), 7);
        if (Math.abs(fm) < 1e-13 || b - a < 2e-14 * Math.max(1, Math.abs(m))) return m;
        if (Math.sign(fm) === Math.sign(fa)) {
          a = m;
          fa = fm;
        } else b = m;
      }
      return (a + b) / 2;
    }
    lo = hi;
    flo = fhi;
  }
  throw new CalculatorError(7, "No bracketed rate solution");
}

export interface CashFlowGroup {
  amount: number;
  frequency: number;
}
export function groupedNPV(
  initial: number,
  groups: readonly CashFlowGroup[],
  percent: number,
): number {
  requireValue(percent > -100 && Number.isFinite(percent));
  let total = initial,
    period = 0;
  const log = Math.log1p(percent / 100);
  for (const group of groups) {
    requireValue(
      Number.isFinite(group.amount) &&
        Number.isInteger(group.frequency) &&
        group.frequency >= 0 &&
        group.frequency <= 9999,
      6,
    );
    if (!group.frequency) continue;
    // A geometric series; expm1 avoids cancellation for rates near zero.
    const factor =
      percent === 0
        ? group.frequency
        : (Math.exp(-(period + 1) * log) * -Math.expm1(-group.frequency * log)) / -Math.expm1(-log);
    if (group.amount !== 0) total += group.amount * factor;
    period += group.frequency;
  }
  return checked(total);
}
export function groupedIRR(initial: number, groups: readonly CashFlowGroup[]): number {
  const flows = [initial, ...groups.filter((g) => g.frequency > 0).map((g) => g.amount)];
  requireValue(flows.some((v) => v < 0) && flows.some((v) => v > 0));
  const scale = Math.max(...flows.map(Math.abs));
  const normalized = groups.map((g) => ({ ...g, amount: g.amount / scale }));
  // Search in log growth factors, avoiding a false result when a root is absent.
  const npv = (u: number) => {
    try {
      return groupedNPV(initial / scale, normalized, 100 * Math.expm1(u));
    } catch {
      return NaN;
    }
  };
  if (Math.abs(npv(0)) < 1e-13) return 0;
  let lastU = -20,
    lastValue = npv(lastU);
  for (let j = 1; j <= 2400; j++) {
    const u = -20 + (40 * j) / 2400,
      value = npv(u);
    if (value === 0) return checked(100 * Math.expm1(u));
    if (
      Number.isFinite(value) &&
      Number.isFinite(lastValue) &&
      Math.sign(value) !== Math.sign(lastValue)
    ) {
      let a = lastU,
        b = u,
        fa = lastValue;
      for (let k = 0; k < 180; k++) {
        const m = (a + b) / 2,
          fm = npv(m);
        if (Math.abs(fm) < 1e-13 || b - a < 1e-14) return checked(100 * Math.expm1(m));
        if (Math.sign(fm) === Math.sign(fa)) {
          a = m;
          fa = fm;
        } else b = m;
      }
    }
    lastU = u;
    lastValue = value;
  }
  throw new CalculatorError(7, "IRR iteration limit");
}

export function amortize(tvm: TVMState, p1: number, p2: number, decimals = 2) {
  requireValue(Number.isInteger(p1) && Number.isInteger(p2) && p1 >= 1 && p2 >= 1 && p2 <= 9999, 4);
  requireValue(p2 >= p1, 2);
  const rate = periodicRate(tvm.IY, tvm.PY, tvm.CY);
  requireValue(Number.isFinite(rate) && rate > -1);
  const rnd = (v: number) => roundDecimal(v, decimals);
  const pmt = rnd(tvm.PMT);
  let balance = rnd(tvm.PV),
    principal = 0,
    interest = 0;
  for (let p = 1; p <= p2; p++) {
    const int = tvm.isBGN && p === 1 ? 0 : rnd(Number((-rate * balance).toFixed(12)));
    const prn = rnd(pmt - int);
    balance = rnd(balance + prn);
    if (p >= p1) {
      principal += prn;
      interest += int;
    }
  }
  return { BAL: checked(balance), PRN: rnd(principal), INT: rnd(interest) };
}

const DAY = 86400000;
export function parseCalculatorDate(value: number, european = false): number {
  requireValue(Number.isFinite(value) && value > 0, 6);
  const first = Math.trunc(value),
    rest = Math.round((value - first) * 10000);
  const second = Math.floor(rest / 100),
    yy = rest % 100;
  const year = yy >= 80 ? 1900 + yy : 2000 + yy;
  const month = european ? second : first,
    day = european ? first : second;
  const time = Date.UTC(year, month - 1, day),
    date = new Date(time);
  requireValue(
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day,
    6,
  );
  return time;
}
export function calculatorDateValue(time: number, european = false): number {
  const d = new Date(time),
    year = d.getUTCFullYear(),
    month = d.getUTCMonth() + 1,
    day = d.getUTCDate();
  requireValue(year >= 1980 && year <= 2079, 4);
  return Number(
    `${european ? day : month}.${String(european ? month : day).padStart(2, "0")}${String(year % 100).padStart(2, "0")}`,
  );
}
export function dateDays(first: number, second: number, basis: "ACT" | "360"): number {
  if (basis === "ACT") return Math.round((second - first) / DAY);
  const a = new Date(first),
    b = new Date(second);
  let d1 = a.getUTCDate(),
    d2 = b.getUTCDate();
  // TI guidebook appendix: adjust the 31st, with no special February rule.
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  return (
    360 * (b.getUTCFullYear() - a.getUTCFullYear()) +
    30 * (b.getUTCMonth() - a.getUTCMonth()) +
    d2 -
    d1
  );
}

export interface BondInput {
  settlement: number;
  redemption: number;
  coupon: number;
  redeemValue: number;
  frequency: number;
  basis: "ACT" | "360";
}
function couponDate(anchor: number, periods: number, frequency: number): number {
  const d = new Date(anchor),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth() - periods * (12 / frequency);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const eom = d.getUTCDate() === new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(y, m, eom ? last : Math.min(d.getUTCDate(), last));
}
function rawBondPrice(input: BondInput, yieldPercent: number) {
  const { settlement, redemption, coupon, redeemValue, frequency, basis } = input;
  requireValue(
    redemption > settlement &&
      (frequency === 1 || frequency === 2) &&
      coupon >= 0 &&
      redeemValue > 0,
    6,
  );
  requireValue(yieldPercent > -100 * frequency);
  let n = 1;
  while (couponDate(redemption, n, frequency) > settlement && n < 205) n++;
  const previous = couponDate(redemption, n, frequency),
    next = couponDate(redemption, n - 1, frequency);
  const e = dateDays(previous, next, basis),
    a = dateDays(previous, settlement, basis),
    dsc = dateDays(settlement, next, basis);
  const c = coupon / frequency,
    y = yieldPercent / 100 / frequency,
    ai = (c * a) / e;
  let dirty = 0;
  if (n === 1) dirty = (redeemValue + c) / (1 + (y * dsc) / e);
  else {
    if (c !== 0) for (let k = 0; k < n; k++) dirty += c / (1 + y) ** (k + dsc / e);
    dirty += redeemValue / (1 + y) ** (n - 1 + dsc / e);
  }
  return { PRI: dirty - ai, AI: ai };
}
export function bondPrice(input: BondInput, yieldPercent: number) {
  const result = rawBondPrice(input, yieldPercent);
  return { PRI: checked(result.PRI), AI: checked(result.AI) };
}
export function bondYield(input: BondInput, price: number): number {
  requireValue(price > 0);
  const scale = Math.max(price, input.redeemValue, input.coupon, 1);
  return checked(
    100 *
      input.frequency *
      // Extreme trial yields can overflow the trial price on a long bond.
      // Retain its sign for bracketing; enforce display range on final results.
      solveRate((r) => (rawBondPrice(input, 100 * input.frequency * r).PRI - price) / scale),
  );
}

export type DepreciationMethod = "SL" | "SYD" | "DB" | "DBX" | "SLF" | "DBF";
export interface DepreciationInput {
  method: DepreciationMethod;
  life: number;
  month: number;
  cost: number;
  salvage: number;
  year: number;
  factor: number;
  startDate: number;
}
export function depreciate(input: DepreciationInput, decimals: number) {
  const { method, life, month, cost, salvage, year, factor, startDate } = input;
  requireValue(
    life > 0 &&
      life <= 9999 &&
      year >= 1 &&
      Number.isInteger(year) &&
      year <= 9999 &&
      cost >= 0 &&
      salvage >= 0 &&
      salvage <= cost &&
      month >= 1 &&
      month < 13,
    6,
  );
  if (method !== "SL" && method !== "SLF") requireValue(Number.isInteger(life), 6);
  requireValue(factor > 0, 6);
  const rnd = (v: number) => roundDecimal(v, decimals),
    roundedCost = rnd(cost),
    roundedSalvage = rnd(salvage),
    base = rnd(roundedCost - roundedSalvage);
  let first = (13 - month) / 12;
  if (method === "SLF") {
    const d = new Date(startDate);
    requireValue(Number.isFinite(d.getTime()), 6);
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1),
      nextYear = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
    // SLF uses actual days remaining in the starting calendar year. The
    // owner's 15-Mar-2024 hardware reading distinguishes this from 30/360.
    first = (nextYear - startDate) / (nextYear - yearStart);
  }
  let book = roundedCost,
    dep = 0;
  const fullYears = method === "DBF" ? life : Math.ceil(life - first) + 1;
  for (let y = 1; y <= Math.min(year, fullYears); y++) {
    const remaining = rnd(book - roundedSalvage),
      elapsed = y === 1 ? 0 : first + y - 2;
    const fraction = y === 1 ? first : Math.min(1, Math.max(0, life - elapsed));
    if (method === "SL" || method === "SLF") dep = (base / life) * fraction;
    else if (method === "SYD")
      dep = (base * (y === 1 ? life * first : life + 2 - y - first)) / ((life * (life + 1)) / 2);
    else {
      dep = ((book * factor) / (100 * life)) * fraction;
      if (method === "DBX" || method === "DBF") {
        // DBF counts the initial partial calendar year as one whole year when
        // finding the crossover rate; DBX keeps the fractional remaining life.
        const remainingLife = method === "DBF" ? life - y + 1 : Math.max(life - elapsed, fraction);
        dep = Math.max(dep, (remaining / remainingLife) * fraction);
      }
      if (y === 1) dep = Math.min(dep, remaining * first);
    }
    if (y === fullYears) dep = remaining;
    dep = rnd(Math.min(remaining, Math.max(0, dep)));
    book = rnd(book - dep);
  }
  if (year > fullYears) dep = 0;
  return { DEP: dep, RBV: book, RDV: rnd(book - roundedSalvage) };
}

export type RegressionModel = "LIN" | "Ln" | "EXP" | "PWR" | "1-V";
export interface DataPoint {
  x: number;
  y: number;
}
export function statistics(
  points: readonly DataPoint[],
  model: RegressionModel,
): Record<string, number> {
  requireValue(points.length > 0, 4);
  const weighted = model === "1-V";
  const weights = points.map((p) => (weighted ? p.y : 1));
  requireValue(
    points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
      weights.every((w) => w >= 0 && Number.isInteger(w)),
    4,
  );
  const n = weights.reduce((a, b) => a + b, 0);
  requireValue(n > 0, 4);
  // TI reports all statistics on the selected model's transformed data.
  const data = points.map((p) => ({
    x: model === "Ln" || model === "PWR" ? Math.log(p.x) : p.x,
    y: model === "EXP" || model === "PWR" ? Math.log(p.y) : p.y,
  }));
  requireValue(
    data.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    4,
  );
  const sum = (fn: (p: DataPoint) => number) => data.reduce((s, p, i) => s + fn(p) * weights[i], 0);
  const sx = sum((p) => p.x),
    sy = sum((p) => p.y),
    mx = sx / n,
    my = sy / n;
  const vx = sum((p) => (p.x - mx) ** 2),
    vy = sum((p) => (p.y - my) ** 2);
  const result: Record<string, number> = {
    n,
    x: mx,
    y: my,
    Sx: n > 1 ? Math.sqrt(vx / (n - 1)) : NaN,
    Sy: n > 1 ? Math.sqrt(vy / (n - 1)) : NaN,
    sigmax: Math.sqrt(vx / n),
    sigmay: Math.sqrt(vy / n),
    sumX: sx,
    sumY: sy,
    sumX2: sum((p) => p.x * p.x),
    sumY2: sum((p) => p.y * p.y),
    sumXY: sum((p) => p.x * p.y),
  };
  if (!weighted) {
    const xy = sum((p) => (p.x - mx) * (p.y - my));
    const slope = vx > 0 ? xy / vx : NaN;
    const intercept = my - slope * mx;
    // EXP on the physical calculator is Y = a * b^X, not a * exp(b*X).
    result.b = model === "EXP" ? Math.exp(slope) : slope;
    result.a = model === "EXP" || model === "PWR" ? Math.exp(intercept) : intercept;
    result.r = vx > 0 && vy > 0 ? Math.max(-1, Math.min(1, xy / Math.sqrt(vx * vy))) : NaN;
  }
  return result;
}
export function regressionPrediction(
  model: RegressionModel,
  a: number,
  b: number,
  target: "X" | "Y",
  value: number,
): number {
  requireValue(model !== "1-V");
  requireValue(Number.isFinite(a) && Number.isFinite(b), 4);
  if (target === "Y") {
    if (model === "Ln" || model === "PWR") requireValue(value > 0, 4);
    if (model === "EXP") requireValue(b > 0, 4);
    return checked(
      model === "LIN"
        ? a + b * value
        : model === "Ln"
          ? a + b * Math.log(value)
          : model === "EXP"
            ? a * b ** value
            : a * value ** b,
    );
  }
  if (model === "EXP") requireValue(b > 0 && b !== 1 && value / a > 0, 4);
  if (model === "PWR") requireValue(value / a > 0, 4);
  requireValue(b !== 0);
  return checked(
    model === "LIN"
      ? (value - a) / b
      : model === "Ln"
        ? Math.exp((value - a) / b)
        : model === "EXP"
          ? Math.log(value / a) / Math.log(b)
          : (value / a) ** (1 / b),
  );
}

export function combinations(n: number, r: number, permutation = false): number {
  requireValue(
    Number.isInteger(n) && Number.isInteger(r) && n >= 0 && r >= 0 && r <= n && n <= 999,
    2,
  );
  let value = 1;
  if (!permutation) r = Math.min(r, n - r);
  for (let k = 0; k < r; k++) value = checked((value * (n - k)) / (permutation ? 1 : k + 1));
  return value;
}
