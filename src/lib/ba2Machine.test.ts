import { describe, expect, it } from "vitest";
import {
  calculatorDisplay,
  calculatorStatus,
  createCalculator,
  pressCalculator,
  worksheetFields,
  type CalculatorState,
} from "./ba2Machine";
import { defaultTVMState } from "./calculator";

class Calc {
  s: CalculatorState = createCalculator();
  press(...keys: string[]) {
    for (const key of keys) this.s = pressCalculator(this.s, key);
    return this;
  }
  number(n: number) {
    for (const digit of Math.abs(n).toString()) this.press(digit);
    if (n < 0) this.press("sign");
    return this;
  }
  enter(n: number) {
    return this.number(n).press("ENTER");
  }
  second(key: string) {
    return this.press("2nd", key);
  }
  at(id: string) {
    const fields = worksheetFields(this.s),
      target = fields.findIndex((f) => f.id === id);
    expect(target, `Field ${id} exists in ${this.s.worksheet}`).toBeGreaterThanOrEqual(0);
    for (let steps = 0; steps < fields.length * 2 && this.s.index !== target; steps++)
      this.press(target < this.s.index ? "up" : "down");
    expect(this.s.index, `Can navigate to ${id}`).toBe(target);
    return this;
  }
  get display() {
    return calculatorDisplay(this.s);
  }
}

describe("physical worksheet key sequences", () => {
  it.each([
    ["IY", "PY"],
    ["PV", "AMORT"],
    ["PMT", "BGN"],
    ["7", "DATA"],
    ["8", "STAT"],
    ["9", "BOND"],
    ["4", "DEPR"],
    ["5", "CHANGE"],
    ["6", "BREAKEVEN"],
    ["1", "DATE"],
    ["2", "ICONV"],
    ["3", "PROFIT"],
    ["0", "MEM"],
    [".", "FORMAT"],
    ["sign", "RESET"],
  ])("opens %s through its second function", (key, worksheet) => {
    const c = new Calc().second(key);
    expect(c.s.worksheet).toBe(worksheet);
    c.second("CPT");
    expect(c.s.worksheet).toBe("STD");
  });
  it("stores TVM, recalls registers, computes, and leaves settings intact when clearing TVM", () => {
    const c = new Calc().number(10).press("N").number(5).press("IY").number(-1000).press("PV");
    c.press("CPT", "FV");
    expect(c.s.value).toBeCloseTo(1628.8946267774, 8);
    c.press("RCL", "PV");
    expect(c.s.value).toBe(-1000);
    c.second("IY").enter(12).press("down").enter(2).second("CPT");
    c.second("FV");
    expect(c.s.tvm).toEqual({ ...defaultTVMState(), PY: 12, CY: 2 });
  });
  it("requires SET in the BGN worksheet and supports the payment multiplier", () => {
    const c = new Calc().second("PMT");
    expect(c.display).toBe("END");
    expect(c.s.tvm.isBGN).toBe(false);
    c.second("ENTER");
    expect(c.s.tvm.isBGN).toBe(true);
    expect(c.display).toBe("BGN");
    c.second("IY").enter(12).second("CPT").number(30).second("N").press("N");
    expect(c.s.tvm.N).toBe(360);
  });
  it("enters CF0, C01/F01, grouped flows, a separate NPV rate, and computes IRR", () => {
    const c = new Calc().number(99).press("IY", "CF").enter(-7000);
    c.press("down")
      .enter(3000)
      .press("down", "down")
      .enter(5000)
      .press("down")
      .enter(4)
      .press("down")
      .enter(4000);
    // Follow the guide's delete/insert edit before its NPV and IRR steps.
    c.second("up").at("C2").second("down").enter(4000);
    c.press("NPV");
    expect(c.display).toBe("0.00");
    c.enter(20).press("down", "CPT");
    expect(c.s.value).toBeCloseTo(7266.44, 2);
    expect(c.s.tvm.IY).toBe(99);
    c.press("IRR", "CPT");
    expect(c.s.value).toBeCloseTo(52.7053745072, 8);
    expect(c.s.error).toBeNull();
  });
  it("requires ENTER before leaving an input and rounds cash-flow frequencies", () => {
    const c = new Calc().press("CF").number(500).press("down");
    expect(c.s.cashInitial).toBe(0);
    c.enter(100).press("down").enter(1.5);
    expect(c.s.cash[0].frequency).toBe(2);
    c.enter(0);
    expect(c.s.error).toBe("Error 4");
    expect(c.s.cash[0].frequency).toBe(2);
    c.press("CE").enter(3);
    expect(c.s.cash[0].frequency).toBe(3);
    c.press("NPV", "down").enter(999);
    expect(c.s.error).toBe("Error 3");
    expect(c.s.tables.NPV.NPV).toBe(0);
  });
  it("inserts and deletes grouped cash flows without losing their frequencies", () => {
    const c = new Calc()
      .press("CF")
      .enter(-100)
      .at("C1")
      .enter(50)
      .at("F1")
      .enter(3)
      .at("C2")
      .enter(80);
    c.second("down").enter(20);
    expect(c.s.cash.slice(0, 3)).toEqual([
      { amount: 50, frequency: 3 },
      { amount: 20, frequency: 1 },
      { amount: 80, frequency: 1 },
    ]);
    c.second("up");
    expect(c.s.cashCount).toBe(2);
    expect(c.s.cash[1].amount).toBe(80);
    c.second("CE");
    expect(c.s.cashCount).toBe(0);
    expect(c.s.cashInitial).toBe(0);
  });
  it("rejects deleting an unused row without losing entered cash flows or data", () => {
    const c = new Calc().press("CF").at("C1").enter(50).at("C2").second("up");
    expect(c.s.error).toBe("Error 3");
    expect(c.s.cashCount).toBe(1);
    expect(c.s.cash[0].amount).toBe(50);
    c.second("7").enter(7).at("X1").second("up");
    expect(c.s.error).toBe("Error 3");
    expect(c.s.dataCount).toBe(1);
    expect(c.s.data[0].x).toBe(7);
  });
  it("converts interest and preserves the separate conversion frequency", () => {
    const c = new Calc().second("2").enter(15).at("CY").enter(4).at("EFF").press("CPT");
    expect(c.s.value).toBeCloseTo(15.8650415, 6);
    c.at("NOM").press("CPT");
    expect(c.s.value).toBeCloseTo(15, 9);
    c.second("CE");
    expect(c.s.tables.ICONV.CY).toBe(4);
    expect(c.s.tables.ICONV.NOM).toBe(0);
  });
  it("computes all percent-change targets including compound growth", () => {
    const c = new Calc()
      .second("5")
      .enter(500)
      .at("NEW")
      .enter(750)
      .at("PD")
      .enter(5)
      .at("CH")
      .press("CPT");
    expect(c.s.value).toBeCloseTo(8.4471771, 6);
    c.at("OLD").press("CPT");
    expect(c.s.value).toBeCloseTo(500, 8);
    c.at("PD").press("CPT");
    expect(c.s.value).toBeCloseTo(5, 8);
    c.at("NEW").press("CPT");
    expect(c.s.value).toBeCloseTo(750, 8);
  });
  it("distinguishes margin from markup and solves every profit variable", () => {
    const c = new Calc()
      .second("3")
      .at("SEL")
      .enter(125)
      .at("MAR")
      .enter(20)
      .at("CST")
      .press("CPT");
    expect(c.s.value).toBe(100);
    c.at("SEL").press("CPT");
    expect(c.s.value).toBe(125);
    c.at("MAR").press("CPT");
    expect(c.s.value).toBe(20);
  });
  it("solves all breakeven variables from a consistent scenario", () => {
    const c = new Calc()
      .second("6")
      .enter(3000)
      .at("VC")
      .enter(15)
      .at("P")
      .enter(20)
      .at("Q")
      .press("CPT");
    expect(c.s.value).toBe(600);
    for (const [id, v] of [
      ["FC", 3000],
      ["VC", 15],
      ["P", 20],
      ["PFT", 0],
      ["Q", 600],
    ] as const) {
      c.at(id).press("CPT");
      expect(c.s.value).toBe(v);
    }
  });
  it("computes dates and days, including a leap day and day-of-week", () => {
    const c = new Calc().second("1").enter(9.0403).at("DT2").enter(11.0103).at("DBD").press("CPT");
    expect(c.s.value).toBe(58);
    c.at("DT2").press("CPT");
    expect(c.display).toBe("11-01-2003");
    c.at("DT1").enter(2.2824).at("DBD").enter(2).at("DT2").press("CPT");
    expect(c.display).toBe("03-01-2024");
    c.at("DT1").enter(2.3024);
    expect(c.s.error).toBe("Error 6");
  });
  it("rejects CPT on a setting or input-only field without corrupting the worksheet", () => {
    const c = new Calc().second("1").at("BASIS").press("CPT");
    expect(c.s.error).toBe("Error 3");
    expect(c.s.tables.DATE.BASIS).toBe(0);
    c.second("2").at("CY").enter(4).press("CPT");
    expect(c.s.error).toBe("Error 3");
    expect(c.s.tables.ICONV.CY).toBe(4);
    c.second("8").press("CPT");
    expect(c.s.error).toBe("Error 3");
    expect(c.s.tables.STAT.MODE).toBe(0);
  });
  it("prices a bond and solves its yield from actual worksheet entries", () => {
    const c = new Calc()
      .second("9")
      .enter(6.1206)
      .at("CPN")
      .enter(7)
      .at("RDT")
      .enter(12.3107)
      .at("BASIS")
      .second("ENTER");
    c.at("YLD").enter(8).at("PRI").press("CPT");
    expect(c.s.value).toBeCloseTo(98.56, 2);
    c.at("AI");
    expect(c.s.value).toBeCloseTo(3.15, 8);
    c.at("YLD").press("CPT");
    expect(c.s.value).toBeCloseTo(8, 8);
  });
  it("generates depreciation and advances the year with CPT", () => {
    const c = new Calc()
      .second("4")
      .at("LIF")
      .enter(31.5)
      .at("M01")
      .enter(3.5)
      .at("CST")
      .enter(1000000)
      .at("DEP");
    expect(c.s.value).toBe(25132.28);
    c.at("YR").press("CPT").at("DEP");
    expect(c.s.value).toBe(31746.03);
    c.at("RDV").press("down");
    expect(c.s.label).toBe("YR");
    expect(c.s.value).toBe(2);
  });
  it("matches confirmed SLF and DBF hardware cases through the physical keys", () => {
    const c = new Calc().second(".").at("DATE").second("ENTER").second("4").second("ENTER");
    expect(c.display).toBe("SLF");
    c.at("LIF")
      .enter(5)
      .at("DT1")
      .enter(15.0324)
      .at("CST")
      .enter(10000)
      .at("SAL")
      .enter(1000)
      .at("DEP");
    expect(c.s.value).toBe(1436.07);
    c.at("YR").enter(2).at("DEP");
    expect(c.s.value).toBe(1800);
    c.second("4");
    for (let i = 0; i < 4; i++) c.second("ENTER");
    expect(c.s.label).toBe("DBF");
    expect(c.s.value).toBe(200);
    c.at("M01").enter(7).at("YR").enter(5).at("DEP");
    expect(c.s.value).toBe(728);
    c.at("SAL").enter(0).at("DEP");
    expect(c.s.value).toBe(1440);
    expect(calculatorStatus(c.s)).not.toContain("provisional");
    c.second(".").second("CE").second("4");
    expect(c.display).toBe("SL");
  });
  it("rejects advancing beyond worksheet limits without changing the saved interval", () => {
    const c = new Calc().second("PV").enter(9999).at("P2").enter(9999).at("P1").press("CPT");
    expect(c.s.error).toBe("Error 4");
    expect(c.s.tables.AMORT).toMatchObject({ P1: 9999, P2: 9999 });
    c.second("4").at("YR").enter(9999).press("CPT");
    expect(c.s.error).toBe("Error 6");
    expect(c.s.tables.DEPR.YR).toBe(9999);
  });
  it("clears data and predictions while preserving the selected statistics model", () => {
    const c = new Calc().second("7").enter(1).press("down").enter(4);
    c.second("8").second("ENTER").at("X").enter(5);
    c.second("7").second("CE");
    expect(c.s.tables.STAT).toMatchObject({ MODE: 1, X: 0, Y: 0 });
    expect(c.s.dataCount).toBe(0);
    c.enter(2).second("8").second("CE");
    expect(c.s.tables.STAT.MODE).toBe(0);
    expect(c.s.dataCount).toBe(1);
    expect(c.s.data[0].x).toBe(2);
  });
  it("enters statistics data, displays regression, predicts and deletes data", () => {
    const c = new Calc()
      .second("7")
      .enter(1)
      .press("down")
      .enter(3)
      .press("down")
      .enter(2)
      .press("down")
      .enter(5)
      .press("down")
      .enter(3)
      .press("down")
      .enter(7);
    c.second("8").at("a");
    expect(c.s.value).toBe(1);
    c.at("b");
    expect(c.s.value).toBe(2);
    c.at("X").enter(4).at("Y").press("CPT");
    expect(c.s.value).toBe(9);
    c.second("7").second("up");
    expect(c.s.dataCount).toBe(2);
    expect(c.s.data[0]).toEqual({ x: 2, y: 5 });
  });
});

describe("math, memory, display and power sequences", () => {
  it("retains hidden precision until ROUND explicitly changes the value", () => {
    const c = new Calc().number(2).press("/").number(3).press("=");
    expect(c.display).toBe("0.67");
    c.press("*").number(3).press("=");
    expect(c.s.value).toBe(2);
    c.number(2).press("/").number(3).press("=").second("STO").press("*").number(3).press("=");
    expect(c.s.value).toBe(2.01);
  });
  it("supports chain and algebraic precedence and nested parentheses", () => {
    const c = new Calc().number(3).press("+").number(2).press("*").number(4).press("=");
    expect(c.s.value).toBe(20);
    c.second(".").at("METHOD").second("ENTER").second("CPT");
    c.number(3).press("+").number(2).press("*").number(4).press("=");
    expect(c.s.value).toBe(11);
    c.press("CE")
      .number(2)
      .press("*", "(")
      .number(3)
      .press("+", "(")
      .number(4)
      .press("+")
      .number(5)
      .press(")", ")", "=");
    expect(c.s.value).toBe(24);
  });
  it("matches TI percentage, combinatorics and factorial key examples", () => {
    const c = new Calc().number(498).press("+").number(7).press("%", "=");
    expect(c.s.value).toBeCloseTo(532.86, 10);
    c.number(14).press("/").number(25).press("%", "=");
    expect(c.s.value).toBe(56);
    c.number(52).second("+").number(5).press("=");
    expect(c.s.value).toBe(2598960);
    c.number(8).second("-").number(3).press("=");
    expect(c.s.value).toBe(336);
    c.number(5).second("*");
    expect(c.s.value).toBe(120);
  });
  it("supports inverse and hyperbolic trig with degrees and radians", () => {
    const c = new Calc().number(30).second("(");
    expect(c.s.value).toBeCloseTo(0.5, 12);
    c.press("INV", "(");
    expect(c.s.value).toBeCloseTo(30, 10);
    c.number(0.5).second("INV").press("(");
    expect(c.s.value).toBeCloseTo(Math.sinh(0.5), 10);
    c.second("INV").press("INV", "(");
    expect(c.s.value).toBeCloseTo(0.5, 10);
    c.second(".").at("ANGLE").second("ENTER").second("CPT").number(1).second("(");
    expect(c.s.value).toBeCloseTo(Math.sin(1), 10);
    c.number(1).press("LN");
    expect(c.s.value).toBe(0);
    c.second("LN");
    expect(c.s.value).toBe(1);
  });
  it("uses ten independent memories, arithmetic, and worksheet clearing", () => {
    const c = new Calc().number(42).press("STO", "7");
    expect(c.s.value).toBe(42);
    c.number(8).press("STO", "+", "7").number(0).press("RCL", "7");
    expect(c.s.value).toBe(50);
    c.number(5).press("RCL", "*", "7");
    expect(c.s.value).toBe(250);
    c.second("0").at("M3").enter(99).at("M7");
    expect(c.s.value).toBe(50);
    c.second("CE");
    expect(c.s.memories.every((v) => v === 0)).toBe(true);
  });
  it("supports constants, last answer, editing and deterministic random sequences", () => {
    const c = new Calc().number(3).press("*").number(8).second("%").press("=");
    expect(c.s.value).toBe(24);
    c.number(7).press("=");
    expect(c.s.value).toBe(56);
    c.second("=");
    expect(c.s.value).toBe(56);
    c.press("CE").number(123).press("backspace");
    expect(c.display).toBe("12");
    c.press("CE").number(23).press("STO").second("/");
    const first = c.s.value;
    c.press("CE").number(23).press("STO").second("/");
    expect(c.s.value).toBe(first);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
  });
  it("preserves calendar dates when date formats change and uses floating decimal", () => {
    const c = new Calc()
      .second("1")
      .enter(2.2924)
      .second(".")
      .at("DATE")
      .second("ENTER")
      .second("CPT")
      .second("1");
    expect(c.display).toBe("29-02-2024");
    c.second(".").at("DEC").enter(9).second("CPT").number(1).press("/").number(8).press("=");
    expect(c.display).toBe("0.125");
  });
  it("power retains registers and memory, and reset needs confirmation", () => {
    const c = new Calc().number(75).press("STO", "3").number(10).press("N", "power");
    expect(c.display).toBe("");
    c.number(999);
    expect(c.display).toBe("");
    c.press("power", "RCL", "3");
    expect(c.s.value).toBe(75);
    expect(c.s.tvm.N).toBe(10);
    c.second("sign").second("CPT");
    expect(c.s.memories[3]).toBe(75);
    c.second("sign").press("ENTER");
    expect(c.s.memories[3]).toBe(0);
    expect(c.s.tvm.N).toBe(0);
  });
  it("clears European worksheets and formats without changing calendar dates", () => {
    const c = new Calc().second("1").enter(2.2924).second(".").at("DATE").second("ENTER");
    c.second("CE").second("1");
    expect(c.display).toBe("02-29-2024");
    expect(calculatorStatus(c.s)).toContain("Thursday");
    c.second(".").at("DATE").second("ENTER").second("9").second("CE");
    expect(c.display).toBe("31-12-1990");
    c.at("RDT");
    expect(c.display).toBe("31-12-1990");
  });
  it("formats thousands separators while keeping editable input ungrouped", () => {
    const c = new Calc().number(1234.5).press("=");
    expect(c.display).toBe("1,234.50");
    c.second(".").at("SEP").second("ENTER").second("CPT").number(1234.5);
    expect(c.display).toBe("1234,5");
    c.press("=");
    expect(c.display).toBe("1.234,50");
  });
  it("restores the pending calculation after automatic power down", () => {
    const c = new Calc().number(12).press("+").number(3).press("apd");
    expect(c.display).toBe("");
    c.press("power", "=");
    expect(c.s.value).toBe(15);
  });
  it("cancels constant mode when selecting another function", () => {
    const c = new Calc().number(3).press("*").number(8).second("%").press("=");
    expect(c.s.constant).not.toBeNull();
    c.press("sqrt");
    expect(c.s.constant).toBeNull();
    c.number(7).press("=");
    expect(c.s.value).toBe(7);
  });
  it("reports errors without corrupting a register and accepts a corrected entry", () => {
    const c = new Calc().second("IY").enter(12).enter(0);
    expect(c.s.error).toBe("Error 4");
    expect(c.s.tvm.PY).toBe(12);
    c.press("CE").enter(4);
    expect(c.s.tvm.PY).toBe(4);
    expect(c.s.error).toBeNull();
    c.second("CPT").number(1).press("/").number(0).press("=");
    expect(c.s.error).toBe("Error 1");
    c.press("CE").number(5).press("+").number(2).press("=");
    expect(c.s.value).toBe(7);
  });
});
