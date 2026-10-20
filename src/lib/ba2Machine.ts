/** Key-driven BA II Plus state. The display never doubles as the calculation register. */
import { computeTVM, defaultTVMState, type TVMState } from "./calculator";
import {
  amortize,
  bondPrice,
  bondYield,
  CalculatorError,
  calculatorDateValue,
  checked,
  combinations,
  dateDays,
  depreciate,
  groupedIRR,
  groupedNPV,
  parseCalculatorDate,
  regressionPrediction,
  requireValue,
  roundDecimal,
  statistics,
  type CashFlowGroup,
  type DataPoint,
  type DepreciationMethod,
  type RegressionModel,
} from "./calculatorWorksheets";

export type Worksheet =
  | "STD"
  | "PY"
  | "BGN"
  | "CF"
  | "NPV"
  | "IRR"
  | "AMORT"
  | "BOND"
  | "DEPR"
  | "DATA"
  | "STAT"
  | "CHANGE"
  | "ICONV"
  | "DATE"
  | "PROFIT"
  | "BREAKEVEN"
  | "MEM"
  | "FORMAT"
  | "RESET";
type Binary = "+" | "-" | "*" | "/" | "^" | "nPr" | "nCr";
type Token = number | Binary | "(" | ")";
type MemoryAction = { kind: "STO" | "RCL"; op: Binary | null };
export interface CalculatorState {
  tvm: TVMState;
  worksheet: Worksheet;
  index: number;
  value: number;
  entry: string | null;
  label: string;
  error: string | null;
  second: boolean;
  inverse: boolean;
  hyperbolic: boolean;
  compute: boolean;
  powered: boolean;
  autoOff: boolean;
  answer: number;
  tables: Record<string, Record<string, number>>;
  cashInitial: number;
  cash: CashFlowGroup[];
  cashCount: number;
  data: DataPoint[];
  dataCount: number;
  memories: number[];
  memoryAction: MemoryAction | null;
  tokens: Token[];
  expecting: boolean;
  constant: { op: Binary; operand: number } | null;
  constantArmed: boolean;
  repeat: { op: Binary; operand: number } | null;
  seed: number;
  event: string;
}
const methods: DepreciationMethod[] = ["SL", "SYD", "DB", "DBX", "SLF", "DBF"];
const models: RegressionModel[] = ["LIN", "Ln", "EXP", "PWR", "1-V"];
const defaults = () => ({
  AMORT: { P1: 1, P2: 1, BAL: 0, PRN: 0, INT: 0 },
  NPV: { I: 0, NPV: 0 },
  IRR: { IRR: 0 },
  BOND: { SDT: 12.319, CPN: 0, RDT: 12.319, RV: 100, BASIS: 0, FREQ: 2, YLD: 0, PRI: 0, AI: 0 },
  DEPR: {
    METHOD: 0,
    FACTOR: 200,
    LIF: 1,
    M01: 1,
    DT1: 12.319,
    CST: 0,
    SAL: 0,
    YR: 1,
    DEP: 0,
    RBV: 0,
    RDV: 0,
  },
  STAT: { MODE: 0, X: 0, Y: 0 },
  CHANGE: { OLD: 0, NEW: 0, CH: 0, PD: 1 },
  ICONV: { NOM: 0, EFF: 0, CY: 1 },
  DATE: { DT1: 12.319, DT2: 12.319, DBD: 0, BASIS: 0 },
  PROFIT: { CST: 0, SEL: 0, MAR: 0 },
  BREAKEVEN: { FC: 0, VC: 0, P: 0, PFT: 0, Q: 0 },
  FORMAT: { DEC: 2, ANGLE: 0, DATE: 0, SEP: 0, METHOD: 0 },
});
export function createCalculator(tvm: TVMState = defaultTVMState()): CalculatorState {
  return {
    tvm: { ...tvm },
    worksheet: "STD",
    index: 0,
    value: 0,
    entry: null,
    label: "",
    error: null,
    second: false,
    inverse: false,
    hyperbolic: false,
    compute: false,
    powered: true,
    autoOff: false,
    answer: 0,
    tables: defaults(),
    cashInitial: 0,
    cash: Array.from({ length: 24 }, () => ({ amount: 0, frequency: 1 })),
    cashCount: 0,
    data: Array.from({ length: 50 }, () => ({ x: 0, y: 1 })),
    dataCount: 0,
    memories: Array(10).fill(0),
    memoryAction: null,
    tokens: [],
    expecting: false,
    constant: null,
    constantArmed: false,
    repeat: null,
    seed: 1234567,
    event: "",
  };
}
interface Field {
  id: string;
  label: string;
  kind: "input" | "both" | "compute" | "auto" | "setting";
  setting?: string;
}
const field = (id: string, kind: Field["kind"] = "input", label = id): Field => ({
  id,
  label,
  kind,
});
export function worksheetFields(s: CalculatorState): Field[] {
  const table = s.tables[s.worksheet];
  switch (s.worksheet) {
    case "PY":
      return [field("PY", "input", "P/Y"), field("CY", "input", "C/Y")];
    case "BGN":
      return [{ ...field("BGN", "setting"), setting: s.tvm.isBGN ? "BGN" : "END" }];
    case "CF":
      return [
        field("CF0"),
        ...s.cash.flatMap((_, i) => [
          field(`C${i + 1}`, "input", `C${String(i + 1).padStart(2, "0")}`),
          field(`F${i + 1}`, "input", `F${String(i + 1).padStart(2, "0")}`),
        ]),
      ];
    case "NPV":
      return [field("I"), field("NPV", "compute")];
    case "IRR":
      return [field("IRR", "compute")];
    case "AMORT":
      return [field("P1"), field("P2"), ...["BAL", "PRN", "INT"].map((id) => field(id, "auto"))];
    case "BOND":
      return [
        field("SDT"),
        field("CPN"),
        field("RDT"),
        field("RV"),
        { ...field("BASIS", "setting"), setting: table.BASIS ? "360" : "ACT" },
        { ...field("FREQ", "setting"), setting: `${table.FREQ}/Y` },
        field("YLD", "both"),
        field("PRI", "both"),
        field("AI", "auto"),
      ];
    case "DEPR":
      return [
        {
          ...field(
            "METHOD",
            ["DB", "DBX", "DBF"].includes(methods[table.METHOD]) ? "input" : "setting",
            methods[table.METHOD],
          ),
          setting: methods[table.METHOD],
        },
        field("LIF"),
        field("M01"),
        ...(table.METHOD === 4 ? [field("DT1")] : []),
        field("CST"),
        field("SAL"),
        field("YR"),
        ...["DEP", "RBV", "RDV"].map((id) => field(id, "auto")),
      ];
    case "DATA":
      return s.data.flatMap((_, i) => [
        field(`X${i}`, "input", `X${String(i + 1).padStart(2, "0")}`),
        field(`Y${i}`, "input", `Y${String(i + 1).padStart(2, "0")}`),
      ]);
    case "STAT":
      return [
        { ...field("MODE", "setting"), setting: models[table.MODE] },
        field("n", "auto"),
        field("x", "auto", "x̄"),
        field("Sx", "auto"),
        field("sigmax", "auto", "σx"),
        ...(models[table.MODE] === "1-V"
          ? []
          : [
              field("y", "auto", "ȳ"),
              field("Sy", "auto"),
              field("sigmay", "auto", "σy"),
              field("a", "auto"),
              field("b", "auto"),
              field("r", "auto"),
              field("X", "both", "X′"),
              field("Y", "both", "Y′"),
            ]),
        field("sumX", "auto", "ΣX"),
        field("sumX2", "auto", "ΣX²"),
        ...(models[table.MODE] === "1-V"
          ? []
          : [
              field("sumY", "auto", "ΣY"),
              field("sumY2", "auto", "ΣY²"),
              field("sumXY", "auto", "ΣXY"),
            ]),
      ];
    case "CHANGE":
      return [
        field("OLD", "both"),
        field("NEW", "both"),
        field("CH", "both", "%CH"),
        field("PD", "both", "#PD"),
      ];
    case "ICONV":
      return [field("NOM", "both"), field("EFF", "both"), field("CY", "input", "C/Y")];
    case "DATE":
      return [
        field("DT1", "both"),
        field("DT2", "both"),
        field("DBD", "both"),
        { ...field("BASIS", "setting"), setting: table.BASIS ? "360" : "ACT" },
      ];
    case "PROFIT":
      return ["CST", "SEL", "MAR"].map((id) => field(id, "both"));
    case "BREAKEVEN":
      return ["FC", "VC", "P", "PFT", "Q"].map((id) => field(id, "both"));
    case "MEM":
      return s.memories.map((_, i) => field(`M${i}`));
    case "FORMAT":
      return [
        field("DEC"),
        { ...field("ANGLE", "setting"), setting: table.ANGLE ? "RAD" : "DEG" },
        { ...field("DATE", "setting"), setting: table.DATE ? "Eur" : "US" },
        { ...field("SEP", "setting"), setting: table.SEP ? "Eur" : "US" },
        { ...field("METHOD", "setting"), setting: table.METHOD ? "AOS" : "Chn" },
      ];
    case "RESET":
      return [field("RST", "setting")];
    default:
      return [];
  }
}
function current(s: CalculatorState) {
  return worksheetFields(s)[s.index];
}
function value(s: CalculatorState) {
  return s.entry === null ? s.value : Number(s.entry);
}
function european(s: CalculatorState) {
  return !!s.tables.FORMAT.DATE;
}
function convertDates(s: CalculatorState, fromEuropean: boolean, toEuropean: boolean) {
  for (const [name, ids] of [
    ["BOND", ["SDT", "RDT"]],
    ["DATE", ["DT1", "DT2"]],
    ["DEPR", ["DT1"]],
  ] as const)
    for (const id of ids)
      s.tables[name][id] = calculatorDateValue(
        parseCalculatorDate(s.tables[name][id], fromEuropean),
        toEuropean,
      );
}
function precision(s: CalculatorState) {
  return s.tables.FORMAT.DEC;
}
function setValue(s: CalculatorState, number: number, answer = false) {
  s.value = Number(checked(number).toPrecision(13));
  s.entry = null;
  s.error = null;
  s.expecting = false;
  if (answer) s.answer = s.value;
}
function sheetValue(s: CalculatorState, f: Field): number {
  const id = f.id;
  if (s.worksheet === "PY") return s.tvm[id as "PY" | "CY"];
  if (s.worksheet === "BGN") return Number(s.tvm.isBGN);
  if (s.worksheet === "RESET") return 0;
  if (s.worksheet === "MEM") return s.memories[Number(id.slice(1))];
  if (s.worksheet === "CF")
    return id === "CF0"
      ? s.cashInitial
      : s.cash[Number(id.slice(1)) - 1][id[0] === "C" ? "amount" : "frequency"];
  if (s.worksheet === "DATA") return s.data[Number(id.slice(1))][id[0] === "X" ? "x" : "y"];
  if (s.worksheet === "DEPR" && id === "METHOD") return s.tables.DEPR.FACTOR;
  return s.tables[s.worksheet][id] ?? 0;
}
function visit(s: CalculatorState) {
  const f = current(s);
  s.entry = null;
  s.error = null;
  s.compute = false;
  if (!f) return;
  s.label = f.label;
  s.event = f.label;
  if (f.kind === "auto") calculateField(s);
  else s.value = sheetValue(s, f);
}
function open(s: CalculatorState, worksheet: Worksheet) {
  s.worksheet = worksheet;
  s.index = 0;
  s.memoryAction = null;
  s.tokens = [];
  s.expecting = false;
  s.second = false;
  visit(s);
}
function quit(s: CalculatorState) {
  s.worksheet = "STD";
  s.index = 0;
  s.entry = null;
  s.value = 0;
  s.label = "";
  s.error = null;
  s.tokens = [];
  s.compute = false;
  s.second = false;
  s.memoryAction = null;
  s.event = "QUIT";
}
function storeField(s: CalculatorState) {
  const f = current(s);
  if (!f || s.entry === null || f.kind === "auto" || f.kind === "setting") return;
  requireValue(f.kind !== "compute", 3);
  let v = checked(value(s));
  const id = f.id,
    table = s.tables[s.worksheet];
  if (s.worksheet === "PY") {
    requireValue(v > 0, 4);
    s.tvm[id as "PY" | "CY"] = v;
    if (id === "PY") s.tvm.CY = v;
  } else if (s.worksheet === "CF") {
    if (id === "CF0") s.cashInitial = v;
    else {
      const n = Number(id.slice(1)) - 1;
      if (id[0] === "F") {
        requireValue(v >= 0.5 && v <= 9999, 4);
        v = Math.round(v);
      }
      s.cash[n][id[0] === "C" ? "amount" : "frequency"] = v;
      s.cashCount = Math.max(s.cashCount, n + 1);
    }
  } else if (s.worksheet === "DATA") {
    const n = Number(id.slice(1));
    s.data[n][id[0] === "X" ? "x" : "y"] = v;
    s.dataCount = Math.max(s.dataCount, n + 1);
  } else if (s.worksheet === "MEM") s.memories[Number(id.slice(1))] = v;
  else {
    if (s.worksheet === "FORMAT") requireValue(Number.isInteger(v) && v >= 0 && v <= 9, 4);
    if (id === "SDT" || id === "RDT" || id === "DT1" || id === "DT2")
      parseCalculatorDate(v, european(s));
    if (s.worksheet === "AMORT") requireValue(Number.isInteger(v) && v >= 1 && v <= 9999, 4);
    if (s.worksheet === "ICONV" && id === "CY") requireValue(v > 0, 4);
    if (s.worksheet === "DEPR") {
      if (id === "METHOD" || id === "LIF") requireValue(v > 0, 6);
      if (id === "YR") requireValue(Number.isInteger(v) && v >= 1 && v <= 9999, 6);
      if (id === "M01") requireValue(v >= 1 && v < 13, 6);
      if (id === "CST" || id === "SAL") requireValue(v >= 0, 6);
    }
    if (s.worksheet === "DATE" && id === "DBD")
      requireValue(Number.isInteger(v) && Math.abs(v) <= 36525, 6);
    table[s.worksheet === "DEPR" && id === "METHOD" ? "FACTOR" : id] = v;
  }
  s.event = `ENTER ${f.label}`;
  setValue(s, v);
}
function bondInput(s: CalculatorState) {
  const t = s.tables.BOND;
  return {
    settlement: parseCalculatorDate(t.SDT, european(s)),
    redemption: parseCalculatorDate(t.RDT, european(s)),
    coupon: t.CPN,
    redeemValue: t.RV,
    frequency: t.FREQ,
    basis: t.BASIS ? ("360" as const) : ("ACT" as const),
  };
}
function calculateField(s: CalculatorState) {
  const f = current(s);
  if (!f) return;
  requireValue(
    ["auto", "compute", "both"].includes(f.kind) ||
      (s.worksheet === "AMORT" && f.id === "P1") ||
      (s.worksheet === "DEPR" && f.id === "YR"),
    3,
  );
  const id = f.id,
    t = s.tables[s.worksheet];
  let result: number;
  s.event = `CPT ${f.label}`;
  switch (s.worksheet) {
    case "NPV":
      requireValue(id === "NPV", 3);
      result = groupedNPV(s.cashInitial, s.cash.slice(0, s.cashCount), t.I);
      break;
    case "IRR":
      result = groupedIRR(s.cashInitial, s.cash.slice(0, s.cashCount));
      break;
    case "AMORT":
      if (id === "P1") {
        const width = t.P2 - t.P1;
        requireValue(width >= 0 && t.P2 + 1 + width <= 9999, 4);
        t.P1 = t.P2 + 1;
        t.P2 = t.P1 + width;
        result = t.P1;
        break;
      }
      Object.assign(t, amortize(s.tvm, t.P1, t.P2, precision(s)));
      result = t[id];
      break;
    case "BOND":
      requireValue(["PRI", "YLD", "AI"].includes(id), 3);
      if (id === "YLD") t.YLD = bondYield(bondInput(s), t.PRI);
      Object.assign(t, bondPrice(bondInput(s), t.YLD));
      result = t[id];
      break;
    case "DEPR":
      if (id === "YR") {
        requireValue(t.YR < 9999, 6);
        t.YR++;
        result = t.YR;
        break;
      }
      requireValue(["DEP", "RBV", "RDV"].includes(id), 3);
      Object.assign(
        t,
        depreciate(
          {
            method: methods[t.METHOD],
            life: t.LIF,
            month: t.M01,
            cost: t.CST,
            salvage: t.SAL,
            year: t.YR,
            factor: t.FACTOR,
            startDate: parseCalculatorDate(t.DT1, european(s)),
          },
          precision(s),
        ),
      );
      result = t[id];
      break;
    case "STAT": {
      const summary = statistics(s.data.slice(0, s.dataCount), models[t.MODE]);
      result =
        id === "X" || id === "Y"
          ? regressionPrediction(
              models[t.MODE],
              summary.a,
              summary.b,
              id,
              t[id === "X" ? "Y" : "X"],
            )
          : summary[id];
      requireValue(Number.isFinite(result), 4);
      break;
    }
    case "CHANGE": {
      requireValue(id !== "OLD" || t.PD !== 0);
      if (id === "NEW") result = t.OLD * (1 + t.CH / 100) ** t.PD;
      else if (id === "OLD") result = t.NEW / (1 + t.CH / 100) ** t.PD;
      else if (id === "CH") {
        requireValue(t.OLD !== 0 && t.PD !== 0 && t.NEW / t.OLD > 0);
        result = 100 * Math.expm1(Math.log(t.NEW / t.OLD) / t.PD);
      } else {
        requireValue(t.OLD !== 0 && t.NEW / t.OLD > 0 && t.CH > -100 && t.CH !== 0);
        result = Math.log(t.NEW / t.OLD) / Math.log1p(t.CH / 100);
      }
      break;
    }
    case "ICONV":
      requireValue(t.CY > 0, 4);
      if (id === "EFF") {
        requireValue(1 + t.NOM / (100 * t.CY) > 0);
        result = 100 * Math.expm1(t.CY * Math.log1p(t.NOM / (100 * t.CY)));
      } else {
        requireValue(id === "NOM" && t.EFF > -100);
        result = 100 * t.CY * Math.expm1(Math.log1p(t.EFF / 100) / t.CY);
      }
      break;
    case "DATE": {
      const d1 = parseCalculatorDate(t.DT1, european(s)),
        d2 = parseCalculatorDate(t.DT2, european(s));
      if (id === "DBD") result = dateDays(d1, d2, t.BASIS ? "360" : "ACT");
      else {
        requireValue(!t.BASIS, 3);
        result = calculatorDateValue(
          id === "DT1" ? d2 - t.DBD * 86400000 : d1 + t.DBD * 86400000,
          european(s),
        );
      }
      break;
    }
    case "PROFIT":
      result =
        id === "CST"
          ? t.SEL * (1 - t.MAR / 100)
          : id === "SEL"
            ? t.CST / (1 - t.MAR / 100)
            : (100 * (t.SEL - t.CST)) / t.SEL;
      break;
    case "BREAKEVEN":
      result =
        id === "FC"
          ? t.Q * (t.P - t.VC) - t.PFT
          : id === "VC"
            ? t.P - (t.PFT + t.FC) / t.Q
            : id === "P"
              ? (t.PFT + t.FC) / t.Q + t.VC
              : id === "PFT"
                ? t.Q * (t.P - t.VC) - t.FC
                : (t.PFT + t.FC) / (t.P - t.VC);
      break;
    default:
      throw new CalculatorError(3, "Cannot compute this variable");
  }
  setValue(s, result, true);
  if (t) t[id] = result;
}
function setOption(s: CalculatorState) {
  const f = current(s);
  if (!f) return;
  if (s.worksheet === "BGN") s.tvm.isBGN = !s.tvm.isBGN;
  else if (s.worksheet === "FORMAT") {
    requireValue(f.id !== "DEC", 3);
    if (f.id === "DATE") {
      const old = european(s);
      convertDates(s, old, !old);
    }
    s.tables.FORMAT[f.id] = 1 - s.tables.FORMAT[f.id];
    if (!s.tables.FORMAT.DATE && !s.tables.FORMAT.SEP && s.tables.DEPR.METHOD >= 4)
      s.tables.DEPR.METHOD = 0;
  } else if (s.worksheet === "BOND") {
    const t = s.tables.BOND;
    if (f.id === "BASIS") t.BASIS = 1 - t.BASIS;
    else if (f.id === "FREQ") t.FREQ = t.FREQ === 2 ? 1 : 2;
    else throw new CalculatorError(3, "Not a setting");
  } else if (s.worksheet === "DATE" && f.id === "BASIS")
    s.tables.DATE.BASIS = 1 - s.tables.DATE.BASIS;
  else if (s.worksheet === "DEPR" && f.id === "METHOD") {
    const available =
      s.tables.FORMAT.DATE || s.tables.FORMAT.SEP ? [0, 4, 1, 2, 3, 5] : [0, 1, 2, 3];
    s.tables.DEPR.METHOD =
      available[(available.indexOf(s.tables.DEPR.METHOD) + 1) % available.length];
  } else if (s.worksheet === "STAT" && f.id === "MODE")
    s.tables.STAT.MODE = (s.tables.STAT.MODE + 1) % 5;
  else throw new CalculatorError(3, "Not a setting");
  visit(s);
  s.event = "SET";
}
function clearWorksheet(s: CalculatorState) {
  const fresh = defaults();
  if (s.worksheet === "STD") {
    s.tokens = [];
    s.repeat = null;
    s.constant = null;
    setValue(s, 0);
  } else if (s.worksheet === "CF") {
    s.cashInitial = 0;
    s.cashCount = 0;
    s.cash = createCalculator().cash;
  } else if (s.worksheet === "DATA") {
    s.dataCount = 0;
    s.data = createCalculator().data;
    Object.assign(s.tables.STAT, { X: 0, Y: 0 });
  } else if (s.worksheet === "MEM") s.memories.fill(0);
  else if (s.worksheet === "PY") {
    s.tvm.PY = 1;
    s.tvm.CY = 1;
  } else if (s.worksheet === "BGN") s.tvm.isBGN = false;
  else if (s.worksheet === "DEPR") Object.assign(s.tables.DEPR, { LIF: 1, YR: 1, CST: 0, SAL: 0 });
  else if (s.worksheet === "ICONV") Object.assign(s.tables.ICONV, { NOM: 0, EFF: 0 });
  else if (s.worksheet === "DATE")
    Object.assign(s.tables.DATE, {
      DT1: european(s) ? 31.129 : 12.319,
      DT2: european(s) ? 31.129 : 12.319,
      DBD: 0,
    });
  else if (s.worksheet === "FORMAT") {
    if (european(s)) convertDates(s, true, false);
    s.tables.FORMAT = fresh.FORMAT;
    if (s.tables.DEPR.METHOD >= 4) s.tables.DEPR.METHOD = 0;
  } else if (s.worksheet === "BOND") {
    s.tables.BOND = fresh.BOND;
    if (european(s)) Object.assign(s.tables.BOND, { SDT: 31.129, RDT: 31.129 });
  } else if (s.worksheet in fresh)
    s.tables[s.worksheet] = { ...fresh[s.worksheet as keyof typeof fresh] };
  s.index = 0;
  visit(s);
  s.event = "CLR WORK";
}

function binary(op: Binary, a: number, b: number): number {
  if (op === "/") requireValue(b !== 0, 1);
  let power = op === "^" ? a ** b : 0;
  if (op === "^" && a < 0 && !Number.isInteger(b)) {
    const inverse = 1 / b,
      odd = Math.round(inverse);
    requireValue(Math.abs(inverse - odd) < 1e-12 && Math.abs(odd) % 2 === 1, 2);
    power = -((-a) ** b);
  }
  return checked(
    op === "+"
      ? a + b
      : op === "-"
        ? a - b
        : op === "*"
          ? a * b
          : op === "/"
            ? a / b
            : op === "^"
              ? power
              : combinations(a, b, op === "nPr"),
  );
}
function evaluate(tokens: Token[], aos: boolean): number {
  let index = 0;
  const precedence = (op: Binary) =>
    !aos ? 1 : op === "+" || op === "-" ? 1 : op === "*" || op === "/" ? 2 : 3;
  const expression = (minimum: number): number => {
    let left: number;
    if (tokens[index] === "(") {
      index++;
      left = expression(0);
      requireValue(tokens[index] === ")", 3);
      index++;
    } else {
      requireValue(typeof tokens[index] === "number", 3);
      left = tokens[index++] as number;
    }
    while (index < tokens.length && tokens[index] !== ")") {
      const op = tokens[index] as Binary,
        p = precedence(op);
      if (p < minimum) break;
      index++;
      const right = expression(p + (aos && op === "^" ? 0 : 1));
      left = binary(op, left, right);
    }
    return left;
  };
  const result = expression(0);
  requireValue(index === tokens.length, 3);
  return checked(result);
}
function operator(s: CalculatorState, op: Binary) {
  requireValue(
    s.tokens.filter((t) => typeof t === "string" && t !== "(" && t !== ")").length < 8,
    3,
  );
  s.constant = null;
  if (!s.expecting) s.tokens.push(value(s));
  else if (s.tokens.length && s.tokens.at(-1) !== "(") s.tokens.pop();
  if (!s.tables.FORMAT.METHOD && !s.tokens.includes("(") && s.tokens.length > 1) {
    const result = evaluate(s.tokens, false);
    s.tokens = [result];
    setValue(s, result);
  }
  s.tokens.push(op);
  s.entry = null;
  s.expecting = true;
  s.worksheet = "STD";
  s.label = "";
  s.compute = false;
}
function equals(s: CalculatorState) {
  const v = value(s);
  if (s.constant && s.tokens.length === 0) {
    setValue(s, binary(s.constant.op, v, s.constant.operand), true);
    return;
  }
  const tokens = [...s.tokens];
  if (!s.expecting || typeof tokens.at(-1) !== "number") tokens.push(v);
  const op = tokens.length >= 3 ? tokens.at(-2) : null;
  if (typeof op === "string" && op !== "(" && op !== ")") {
    s.repeat = { op: op as Binary, operand: v };
    if (s.constantArmed) s.constant = { ...s.repeat };
  }
  const opens = tokens.filter((t) => t === "(").length - tokens.filter((t) => t === ")").length;
  for (let j = 0; j < opens; j++) tokens.push(")");
  const result =
    s.tokens.length === 0 && s.repeat
      ? binary(s.repeat.op, v, s.repeat.operand)
      : evaluate(tokens, !!s.tables.FORMAT.METHOD);
  setValue(s, result, true);
  s.tokens = [];
  s.expecting = false;
  s.worksheet = "STD";
  s.label = "";
  s.constantArmed = false;
}
function digit(s: CalculatorState, key: string) {
  if (s.memoryAction && /^\d$/.test(key)) {
    const action = s.memoryAction,
      n = Number(key),
      v = value(s);
    if (action.kind === "STO") {
      s.memories[n] = action.op ? binary(action.op, s.memories[n], v) : v;
      setValue(s, v);
    } else setValue(s, action.op ? binary(action.op, v, s.memories[n]) : s.memories[n]);
    s.event = `${action.kind}${action.op ?? ""} ${n}`;
    s.memoryAction = null;
    s.entry = null;
    return;
  }
  if (s.entry === null) {
    if (!s.expecting && s.tokens.length === 0) s.repeat = null;
    s.entry = key === "." ? "0." : key;
  } else if (key !== "." || !s.entry.includes(".")) {
    if (key === "." || s.entry.replace(/[-.]/g, "").length < 10) s.entry += key;
  }
  s.expecting = false;
}
function unary(s: CalculatorState, kind: string) {
  const x = value(s);
  let r: number;
  if (kind === "sqrt") {
    requireValue(x >= 0, 2);
    r = Math.sqrt(x);
  } else if (kind === "square") r = x * x;
  else if (kind === "reciprocal") {
    requireValue(x !== 0, 1);
    r = 1 / x;
  } else if (kind === "ln") {
    requireValue(x > 0, 2);
    r = Math.log(x);
  } else if (kind === "exp") r = Math.exp(x);
  else if (kind === "round") r = roundDecimal(x, precision(s));
  else if (kind === "factorial") {
    requireValue(Number.isInteger(x) && x >= 0 && x <= 69, 2);
    r = 1;
    for (let i = 2; i <= x; i++) r *= i;
  } else if (kind === "percent") {
    const last = s.tokens.at(-1),
      left = s.tokens.length > 1 ? s.tokens[s.tokens.length - 2] : null;
    r = x / 100;
    if ((last === "+" || last === "-") && typeof left === "number") r = left * r;
    else if (last === "/") r = x / 100;
  } else {
    const angles: Record<string, (v: number) => number> = s.hyperbolic
      ? s.inverse
        ? { sin: Math.asinh, cos: Math.acosh, tan: Math.atanh }
        : { sin: Math.sinh, cos: Math.cosh, tan: Math.tanh }
      : s.inverse
        ? { sin: Math.asin, cos: Math.acos, tan: Math.atan }
        : { sin: Math.sin, cos: Math.cos, tan: Math.tan };
    const input = s.inverse || s.hyperbolic || s.tables.FORMAT.ANGLE ? x : (x * Math.PI) / 180;
    if (!s.hyperbolic && s.inverse && (kind === "sin" || kind === "cos"))
      requireValue(Math.abs(x) <= 1, 2);
    if (!s.hyperbolic && !s.inverse && kind === "tan")
      requireValue(Math.abs(Math.cos(input)) > 1e-14, 2);
    r = angles[kind](input);
    if (s.inverse && !s.hyperbolic && !s.tables.FORMAT.ANGLE) r *= 180 / Math.PI;
  }
  setValue(s, r, true);
  s.inverse = false;
  s.hyperbolic = false;
}
function tvmKey(s: CalculatorState, key: keyof TVMState) {
  if (s.memoryAction?.kind === "RCL") {
    setValue(s, Number(s.tvm[key]));
    s.memoryAction = null;
    s.event = `RCL ${key}`;
    return;
  }
  s.worksheet = "STD";
  s.label = key === "IY" ? "I/Y" : key;
  s.tokens = [];
  if (s.compute) {
    const result = computeTVM(key as "N" | "IY" | "PV" | "PMT" | "FV", s.tvm);
    s.tvm[key] = result as never;
    setValue(s, result, true);
    s.event = `CPT ${key}`;
  } else {
    const v = checked(value(s));
    if (key === "N") requireValue(v >= 0);
    s.tvm[key] = v as never;
    setValue(s, v);
    s.event = key;
  }
  s.compute = false;
  s.memoryAction = null;
}
function insertDelete(s: CalculatorState, insert: boolean) {
  requireValue(s.worksheet === "CF" || s.worksheet === "DATA", 3);
  if (s.worksheet === "CF") {
    requireValue(s.index > 0, 3);
    const n = Math.floor((s.index - 1) / 2);
    requireValue(insert ? n <= s.cashCount : n < s.cashCount, 3);
    if (insert) {
      requireValue(s.cashCount < 24, 4);
      s.cash.splice(n, 0, { amount: 0, frequency: 1 });
      s.cash.pop();
      s.cashCount++;
    } else {
      s.cash.splice(n, 1);
      s.cash.push({ amount: 0, frequency: 1 });
      s.cashCount = Math.max(0, s.cashCount - 1);
    }
    s.index = n * 2 + 1;
  } else {
    const n = Math.floor(s.index / 2);
    requireValue(insert ? n <= s.dataCount : n < s.dataCount, 3);
    if (insert) {
      requireValue(s.dataCount < 50, 4);
      s.data.splice(n, 0, { x: 0, y: 1 });
      s.data.pop();
      s.dataCount++;
    } else {
      s.data.splice(n, 1);
      s.data.push({ x: 0, y: 1 });
      s.dataCount = Math.max(0, s.dataCount - 1);
    }
    s.index = n * 2;
  }
  visit(s);
}

const secondWorksheets: Record<string, Worksheet> = {
  IY: "PY",
  PV: "AMORT",
  PMT: "BGN",
  "7": "DATA",
  "8": "STAT",
  "9": "BOND",
  "4": "DEPR",
  "5": "CHANGE",
  "6": "BREAKEVEN",
  "1": "DATE",
  "2": "ICONV",
  "3": "PROFIT",
  "0": "MEM",
  ".": "FORMAT",
  sign: "RESET",
};
function action(s: CalculatorState, key: string) {
  if (key === "apd") {
    s.powered = false;
    s.autoOff = true;
    s.event = "APD";
    return;
  }
  if (key === "power") {
    if (s.autoOff) {
      s.powered = true;
      s.autoOff = false;
      return;
    }
    s.powered = !s.powered;
    s.value = 0;
    s.entry = null;
    s.error = null;
    s.tokens = [];
    s.worksheet = "STD";
    s.label = "";
    s.memoryAction = null;
    s.second = false;
    s.inverse = false;
    s.hyperbolic = false;
    s.compute = false;
    s.constant = null;
    s.repeat = null;
    return;
  }
  if (!s.powered) return;
  if (key === "2nd") {
    s.second = !s.second;
    s.event = "2ND";
    return;
  }
  if (s.error) {
    s.error = null;
    s.entry = null;
    s.compute = false;
  }
  const second = s.second;
  s.second = false;
  // K survives numeric entry, sign changes and equals. A new function cancels it.
  if (!/^\d$/.test(key) && ![".", "sign", "=", "backspace"].includes(key)) {
    s.constant = null;
    if (!(second && key === "%")) s.constantArmed = false;
  }
  if (second && secondWorksheets[key]) {
    open(s, secondWorksheets[key]);
    return;
  }
  if (second) {
    if (key === "CPT") {
      quit(s);
      return;
    }
    if (key === "ENTER") {
      setOption(s);
      return;
    }
    if (key === "up" || key === "down") {
      insertDelete(s, key === "down");
      return;
    }
    if (key === "CE") {
      clearWorksheet(s);
      return;
    }
    if (key === "FV") {
      Object.assign(s.tvm, { N: 0, IY: 0, PV: 0, PMT: 0, FV: 0 });
      quit(s);
      s.event = "CLR TVM";
      return;
    }
    if (key === "N") {
      setValue(s, value(s) * s.tvm.PY);
      return;
    }
    if (key === "INV") {
      s.hyperbolic = !s.hyperbolic;
      return;
    }
    if (key === "LN") {
      unary(s, "exp");
      return;
    }
    if (key === "STO") {
      unary(s, "round");
      return;
    }
    if (key === "*") {
      unary(s, "factorial");
      return;
    }
    if (key === "+" || key === "-") {
      operator(s, key === "+" ? "nCr" : "nPr");
      return;
    }
    if (key === "/") {
      if (s.memoryAction?.kind === "STO") {
        requireValue(Number.isInteger(value(s)) && value(s) > 0, 6);
        s.seed = value(s) % 2147483647 || 1;
        s.memoryAction = null;
      }
      s.seed = (s.seed * 16807) % 2147483647;
      setValue(s, s.seed / 2147483647);
      return;
    }
    if (key === "=") {
      setValue(s, s.answer);
      return;
    }
    if (key === "%") {
      s.constantArmed = true;
      return;
    }
    if (key === "(" || key === ")" || key === "^") {
      unary(s, key === "(" ? "sin" : key === ")" ? "cos" : "tan");
      return;
    }
  }
  if (s.inverse || s.hyperbolic) {
    if (key === "(" || key === ")" || key === "^") {
      unary(s, key === "(" ? "sin" : key === ")" ? "cos" : "tan");
      return;
    }
  }
  if (/^\d$/.test(key) || key === ".") {
    digit(s, key);
    return;
  }
  if (key === "INV") {
    s.inverse = !s.inverse;
    return;
  }
  if (key === "sign") {
    if (s.entry !== null) s.entry = s.entry.startsWith("-") ? s.entry.slice(1) : `-${s.entry}`;
    else setValue(s, -s.value);
    return;
  }
  if (key === "backspace") {
    if (s.entry !== null) s.entry = s.entry.slice(0, -1) || "0";
    return;
  }
  if (key === "CE") {
    if (s.entry !== null && s.worksheet !== "STD") {
      s.entry = null;
      visit(s);
      return;
    }
    if (s.entry === null) {
      s.tokens = [];
      s.expecting = false;
      s.repeat = null;
      s.constant = null;
      s.compute = false;
      s.memoryAction = null;
    }
    s.value = 0;
    s.entry = null;
    return;
  }
  if (key === "ENTER") {
    if (s.worksheet === "RESET") {
      const fresh = createCalculator();
      Object.assign(s, fresh);
      s.event = "RESET";
      return;
    }
    if (s.worksheet === "STD") {
      if (s.tokens.length) equals(s);
      return;
    }
    storeField(s);
    return;
  }
  if (key === "up" || key === "down") {
    const fields = worksheetFields(s);
    if (!fields.length) return;
    s.index =
      s.worksheet === "DEPR" && key === "down" && current(s)?.id === "RDV"
        ? fields.findIndex((f) => f.id === "YR")
        : (s.index + (key === "down" ? 1 : -1) + fields.length) % fields.length;
    visit(s);
    return;
  }
  if (key === "CF" || key === "NPV" || key === "IRR") {
    open(s, key);
    return;
  }
  if (key === "CPT") {
    if (s.worksheet !== "STD") calculateField(s);
    else {
      s.compute = true;
      s.memoryAction = null;
    }
    return;
  }
  if (["N", "IY", "PV", "PMT", "FV"].includes(key)) {
    tvmKey(s, key as keyof TVMState);
    return;
  }
  if (key === "STO" || key === "RCL") {
    s.memoryAction = { kind: key, op: null };
    return;
  }
  if (["+", "-", "*", "/", "^"].includes(key)) {
    if (s.memoryAction) {
      s.memoryAction.op = key as Binary;
      return;
    }
    operator(s, key as Binary);
    return;
  }
  if (key === "(") {
    requireValue(s.tokens.filter((t) => t === "(").length < 15, 3);
    if (!s.expecting && s.entry !== null) {
      s.tokens.push(value(s), "*");
    }
    s.tokens.push("(");
    s.entry = null;
    s.value = 0;
    s.expecting = true;
    return;
  }
  if (key === ")") {
    const start = s.tokens.lastIndexOf("(");
    requireValue(start >= 0, 3);
    const inner = [...s.tokens.slice(start + 1), value(s)];
    setValue(s, evaluate(inner, !!s.tables.FORMAT.METHOD));
    s.tokens = s.tokens.slice(0, start);
    return;
  }
  if (key === "=") {
    equals(s);
    return;
  }
  const unaryKeys: Record<string, string> = {
    "%": "percent",
    sqrt: "sqrt",
    square: "square",
    reciprocal: "reciprocal",
    LN: "ln",
  };
  if (unaryKeys[key]) unary(s, unaryKeys[key]);
}

export function pressCalculator(previous: CalculatorState, key: string): CalculatorState {
  const s = structuredClone(previous);
  s.event = key;
  try {
    action(s, key);
  } catch (e) {
    s.error =
      e instanceof CalculatorError
        ? `Error ${e.code}`
        : e instanceof Error && /^Error \d/.test(e.message)
          ? e.message.slice(0, 7)
          : "Error 5";
    s.entry = null;
    s.compute = false;
    s.second = false;
    // A rejected entry or failed computation never corrupts a stored register.
    if (key === "ENTER" || ["N", "IY", "PV", "PMT", "FV"].includes(key)) {
      s.tvm = { ...previous.tvm };
      s.tables = structuredClone(previous.tables);
      s.cash = structuredClone(previous.cash);
      s.data = structuredClone(previous.data);
      s.memories = [...previous.memories];
    }
  }
  return s;
}
export function calculatorDisplay(s: CalculatorState): string {
  if (!s.powered) return "";
  if (s.error) return s.error;
  if (s.entry !== null) return s.entry.replace(".", s.tables.FORMAT.SEP ? "," : ".");
  const f = current(s);
  if (f?.kind === "setting" && f.setting) return f.setting;
  if (s.worksheet === "RESET") return "0.00";
  if (f && ["SDT", "RDT", "DT1", "DT2"].includes(f.id)) {
    try {
      const d = new Date(parseCalculatorDate(s.value, european(s)));
      return `${String(european(s) ? d.getUTCDate() : d.getUTCMonth() + 1).padStart(2, "0")}-${String(european(s) ? d.getUTCMonth() + 1 : d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;
    } catch {
      return "Error 6";
    }
  }
  const x = Object.is(s.value, -0) ? 0 : s.value,
    dec = precision(s);
  let output = dec === 9 ? Number(x.toPrecision(10)).toString() : x.toFixed(dec);
  if (output.replace(/[-.]/g, "").length > 10 || (Math.abs(x) > 0 && Math.abs(x) < 1e-9))
    output = x.toExponential(6);
  if (output.includes("e")) return s.tables.FORMAT.SEP ? output.replace(".", ",") : output;
  const [integer, fraction] = output.split(".");
  const separator = s.tables.FORMAT.SEP ? "." : ",";
  return (
    integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator) +
    (fraction === undefined ? "" : (s.tables.FORMAT.SEP ? "," : ".") + fraction)
  );
}
export function calculatorStatus(s: CalculatorState): string {
  if (!s.powered) return "Calculator off — press ON/OFF";
  if (s.memoryAction) return `${s.memoryAction.kind}${s.memoryAction.op ?? ""} — choose memory 0–9`;
  const f = current(s);
  if (s.worksheet === "STD")
    return s.compute
      ? "Press N, I/Y, PV, PMT or FV to compute"
      : "TVM · P/Y " + s.tvm.PY + " · C/Y " + s.tvm.CY + " · " + (s.tvm.isBGN ? "BGN" : "END");
  if (s.worksheet === "RESET")
    return "Reset all worksheets and settings? ENTER confirms; 2ND QUIT cancels.";
  if (s.worksheet === "DATE" && f && ["DT1", "DT2"].includes(f.id) && !s.error) {
    const date = new Date(parseCalculatorDate(sheetValue(s, f), european(s)));
    return `DATE · ${f.label} · ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()]} · ENTER stores · CPT computes · ↑/↓ browse`;
  }
  return `${s.worksheet} · ${f?.label ?? ""} · ${f?.kind === "setting" ? "2ND SET changes" : f?.kind === "auto" ? "Computed automatically" : f?.kind === "both" ? "ENTER stores · CPT computes" : f?.kind === "compute" ? "CPT computes" : "ENTER stores"} · ↑/↓ browse`;
}
