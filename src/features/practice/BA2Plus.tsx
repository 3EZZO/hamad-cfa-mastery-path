import { useCallback, useEffect, useState } from "react";
import {
  computeArithmetic,
  computeIRR,
  computeNPV,
  computeTVM,
  computeUnary,
  defaultCashFlowState,
  defaultTVMState,
  type ArithmeticOperator,
  type CashFlowState,
  type TVMState,
  type UnaryOperation,
} from "../../lib/calculator";
import "./ba2plus.css";

export interface KeystrokeLog {
  key: string;
  timestamp: number;
  display: string;
  registers: TVMState;
}

interface BA2PlusProps {
  onLog: (log: KeystrokeLog) => void;
  startTime: number;
  tvmState: TVMState;
  onStateChange: (newState: TVMState) => void;
}

type TVMRegister = "N" | "IY" | "PV" | "PMT" | "FV";
type Worksheet = "TVM" | "CF";

interface ArithmeticFrame {
  accumulator: number | null;
  operator: ArithmeticOperator | null;
}

function cashFlowLabel(index: number): string {
  return index === 0 ? "CF0" : `C${String(index).padStart(2, "0")}`;
}

function formatDisplay(value: number): string {
  if (!Number.isFinite(value)) return "Error 5";
  if (Math.abs(value) >= 1_000_000_000) return value.toExponential(6);
  return value.toFixed(2);
}

export function BA2Plus({
  onLog,
  startTime,
  tvmState,
  onStateChange,
}: BA2PlusProps) {
  const [display, setDisplay] = useState("0.00");
  const [screenLabel, setScreenLabel] = useState("TVM");
  const [inputState, setInputState] = useState<"READY" | "INPUT" | "RESULT">("READY");
  const [is2nd, setIs2nd] = useState(false);
  const [isCpt, setIsCpt] = useState(false);
  const [worksheet, setWorksheet] = useState<Worksheet>("TVM");
  const [cashFlows, setCashFlows] = useState<CashFlowState>(
    defaultCashFlowState,
  );
  const [cashFlowIndex, setCashFlowIndex] = useState(0);
  const [arithmeticAccumulator, setArithmeticAccumulator] = useState<number | null>(null);
  const [pendingOperator, setPendingOperator] = useState<ArithmeticOperator | null>(null);
  const [arithmeticStack, setArithmeticStack] = useState<ArithmeticFrame[]>([]);
  const [memory, setMemory] = useState(0);

  const logStroke = useCallback(
    (key: string, newDisplay: string, newState: TVMState = tvmState) => {
      onLog({
        key,
        timestamp: Date.now() - startTime,
        display: newDisplay,
        registers: newState,
      });
    },
    [onLog, startTime, tvmState],
  );

  const updateDisplay = useCallback(
    (value: string, newState = tvmState, key = "") => {
      setDisplay(value);
      onStateChange(newState);
      if (key) logStroke(key, value, newState);
    },
    [logStroke, onStateChange, tvmState],
  );

  const handleNum = useCallback(
    (number: string) => {
      let next = display;
      if (inputState !== "INPUT" || display.startsWith("Error")) {
        if (pendingOperator === null && arithmeticStack.length === 0) {
          setArithmeticAccumulator(null);
        }
        next = number === "." ? "0." : number;
        setInputState("INPUT");
      } else {
        if (number === "." && display.includes(".")) return;
        next = display + number;
      }
      updateDisplay(next, tvmState, number);
    },
    [arithmeticStack.length, display, inputState, pendingOperator, tvmState, updateDisplay],
  );

  const handleClear = useCallback(() => {
    if (is2nd && worksheet === "CF") {
      const cleared = defaultCashFlowState();
      setCashFlows(cleared);
      setCashFlowIndex(0);
      setScreenLabel("CF0");
      setIs2nd(false);
      updateDisplay("0.00", tvmState, "CLR WORK");
    } else {
      setIs2nd(false);
      updateDisplay("0.00", tvmState, "CE/C");
      if (pendingOperator === null) {
        setArithmeticAccumulator(null);
        setArithmeticStack([]);
      }
    }
    setInputState("READY");
  }, [is2nd, pendingOperator, tvmState, updateDisplay, worksheet]);

  const handleSign = useCallback(() => {
    if (display === "0.00" || display === "0") return;
    const next = display.startsWith("-") ? display.slice(1) : `-${display}`;
    updateDisplay(next, tvmState, "+/-");
    setInputState("INPUT");
  }, [display, tvmState, updateDisplay]);

  const handleOperator = useCallback(
    (operator: ArithmeticOperator, label: string) => {
      const value = Number(display);
      if (!Number.isFinite(value)) return;
      try {
        let nextAccumulator = arithmeticAccumulator ?? value;
        if (
          arithmeticAccumulator !== null &&
          pendingOperator !== null &&
          inputState !== "READY"
        ) {
          nextAccumulator = computeArithmetic(
            arithmeticAccumulator,
            pendingOperator,
            value,
          );
        }
        setArithmeticAccumulator(nextAccumulator);
        setPendingOperator(operator);
        setWorksheet("TVM");
        setScreenLabel(label);
        updateDisplay(formatDisplay(nextAccumulator), tvmState, label);
      } catch {
        setArithmeticAccumulator(null);
        setPendingOperator(null);
        updateDisplay("Error 5", tvmState, `${label} (Error)`);
      }
      setInputState("READY");
      setIs2nd(false);
      setIsCpt(false);
    },
    [
      arithmeticAccumulator,
      display,
      inputState,
      pendingOperator,
      tvmState,
      updateDisplay,
    ],
  );

  const handleEquals = useCallback(() => {
    const value = Number(display);
    if (!Number.isFinite(value)) return;
    try {
      const result =
        arithmeticAccumulator !== null && pendingOperator !== null
          ? computeArithmetic(arithmeticAccumulator, pendingOperator, value)
          : arithmeticAccumulator ?? value;
      setArithmeticAccumulator(result);
      setPendingOperator(null);
      setWorksheet("TVM");
      setScreenLabel("=");
      updateDisplay(formatDisplay(result), tvmState, "=");
    } catch {
      setArithmeticAccumulator(null);
      setPendingOperator(null);
      updateDisplay("Error 5", tvmState, "= (Error)");
    }
    setInputState("READY");
    setIs2nd(false);
    setIsCpt(false);
  }, [arithmeticAccumulator, display, pendingOperator, tvmState, updateDisplay]);

  const handleUnary = useCallback(
    (operation: UnaryOperation, label: string) => {
      const value = Number(display);
      if (!Number.isFinite(value)) return;
      try {
        const result = computeUnary(value, operation);
        if (pendingOperator === null) setArithmeticAccumulator(result);
        setWorksheet("TVM");
        setScreenLabel(label);
        updateDisplay(formatDisplay(result), tvmState, label);
      } catch {
        if (pendingOperator === null) setArithmeticAccumulator(null);
        updateDisplay("Error 5", tvmState, `${label} (Error)`);
      }
      setInputState("RESULT");
      setIs2nd(false);
      setIsCpt(false);
    },
    [display, pendingOperator, tvmState, updateDisplay],
  );

  const handleOpenParenthesis = useCallback(() => {
    setArithmeticStack(current => [
      ...current,
      { accumulator: arithmeticAccumulator, operator: pendingOperator },
    ]);
    setArithmeticAccumulator(null);
    setPendingOperator(null);
    setWorksheet("TVM");
    setScreenLabel("(");
    updateDisplay("0.00", tvmState, "(");
    setInputState("RESULT");
    setIs2nd(false);
  }, [arithmeticAccumulator, pendingOperator, tvmState, updateDisplay]);

  const handleCloseParenthesis = useCallback(() => {
    if (arithmeticStack.length === 0) {
      updateDisplay("Error 5", tvmState, ") (Error)");
      setInputState("READY");
      return;
    }
    const value = Number(display);
    if (!Number.isFinite(value)) return;
    try {
      const innerResult =
        arithmeticAccumulator !== null && pendingOperator !== null
          ? computeArithmetic(arithmeticAccumulator, pendingOperator, value)
          : arithmeticAccumulator ?? value;
      const frame = arithmeticStack[arithmeticStack.length - 1];
      const result =
        frame.accumulator !== null && frame.operator !== null
          ? computeArithmetic(frame.accumulator, frame.operator, innerResult)
          : innerResult;
      setArithmeticStack(current => current.slice(0, -1));
      setArithmeticAccumulator(result);
      setPendingOperator(null);
      setScreenLabel(")");
      updateDisplay(formatDisplay(result), tvmState, ")");
    } catch {
      setArithmeticStack([]);
      setArithmeticAccumulator(null);
      setPendingOperator(null);
      updateDisplay("Error 5", tvmState, ") (Error)");
    }
    setInputState("READY");
    setIs2nd(false);
  }, [
    arithmeticAccumulator,
    arithmeticStack,
    display,
    pendingOperator,
    tvmState,
    updateDisplay,
  ]);

  const handleStore = useCallback(() => {
    const value = Number(display);
    if (!Number.isFinite(value)) return;
    setMemory(value);
    setScreenLabel("STO");
    logStroke("STO", display);
    setInputState("READY");
    setIs2nd(false);
  }, [display, logStroke]);

  const handleRecall = useCallback(() => {
    setScreenLabel("RCL");
    updateDisplay(formatDisplay(memory), tvmState, "RCL");
    setInputState("RESULT");
    setIs2nd(false);
  }, [memory, tvmState, updateDisplay]);

  const handleReset = useCallback(() => {
    const resetTVM = defaultTVMState();
    setCashFlows(defaultCashFlowState());
    setCashFlowIndex(0);
    setArithmeticAccumulator(null);
    setPendingOperator(null);
    setArithmeticStack([]);
    setMemory(0);
    setWorksheet("TVM");
    setScreenLabel("TVM");
    setInputState("READY");
    setIs2nd(false);
    setIsCpt(false);
    updateDisplay("0.00", resetTVM, "RESET");
  }, [updateDisplay]);

  const commitCashFlow = useCallback(() => {
    if (worksheet !== "CF" || inputState !== "INPUT") return;
    const value = Number(display);
    if (!Number.isFinite(value)) return;
    setCashFlows(current => {
      const values = [...current.values];
      values[cashFlowIndex] = value;
      return { values };
    });
    logStroke(`ENTER ${cashFlowLabel(cashFlowIndex)}`, display);
  }, [cashFlowIndex, display, inputState, logStroke, worksheet]);

  const handleEnter = useCallback(() => {
    if (worksheet === "CF") {
      commitCashFlow();
      logStroke("ENTER", display);
      setInputState("READY");
      return;
    }
    if (pendingOperator !== null) {
      handleEquals();
      return;
    }
    logStroke("ENTER", display);
    setInputState("READY");
  }, [commitCashFlow, display, handleEquals, logStroke, pendingOperator, worksheet]);

  const handleCPT = useCallback(
    (register: TVMRegister) => {
      try {
        const result = computeTVM(register, tvmState);
        const nextState = { ...tvmState, [register]: result };
        setScreenLabel(register === "IY" ? "I/Y" : register);
        updateDisplay(formatDisplay(result), nextState, `CPT ${register}`);
      } catch {
        updateDisplay("Error 5", tvmState, `CPT ${register} (Error)`);
      }
      setInputState("READY");
    },
    [tvmState, updateDisplay],
  );

  const handle2nd = useCallback(() => {
    setIs2nd(current => !current);
    logStroke("2ND", display);
  }, [display, logStroke]);

  const handleClrTVM = useCallback(() => {
    const nextState = {
      ...tvmState,
      N: 0,
      IY: 0,
      PV: 0,
      PMT: 0,
      FV: 0,
    };
    setWorksheet("TVM");
    setScreenLabel("TVM");
    updateDisplay("0.00", nextState, "CLR TVM");
    setIs2nd(false);
    setInputState("READY");
  }, [tvmState, updateDisplay]);

  const handleBGN = useCallback(() => {
    const nextState = { ...tvmState, isBGN: !tvmState.isBGN };
    setWorksheet("TVM");
    setScreenLabel("TVM");
    updateDisplay(nextState.isBGN ? "BGN" : "END", nextState, "BGN/END");
    setIs2nd(false);
    setInputState("READY");
  }, [tvmState, updateDisplay]);

  const handleCPTMode = useCallback(() => {
    setIsCpt(true);
    setIs2nd(false);
    setWorksheet("TVM");
    logStroke("CPT", display);
  }, [display, logStroke]);

  const handleTVM = useCallback(
    (register: TVMRegister) => {
      setWorksheet("TVM");
      setScreenLabel(register === "IY" ? "I/Y" : register);
      if (isCpt) {
        handleCPT(register);
        setIsCpt(false);
      } else if (inputState === "INPUT") {
        const value = Number(display);
        if (!Number.isFinite(value)) return;
        const nextState = { ...tvmState, [register]: value };
        updateDisplay(display, nextState, register);
        setInputState("READY");
      } else {
        updateDisplay(formatDisplay(tvmState[register]), tvmState, `RCL ${register}`);
      }
    },
    [display, handleCPT, inputState, isCpt, tvmState, updateDisplay],
  );

  const openCashFlowWorksheet = useCallback(() => {
    setWorksheet("CF");
    setCashFlowIndex(0);
    setScreenLabel("CF0");
    updateDisplay(formatDisplay(cashFlows.values[0] ?? 0), tvmState, "CF");
    setInputState("READY");
    setIsCpt(false);
    setIs2nd(false);
  }, [cashFlows.values, tvmState, updateDisplay]);

  const moveCashFlow = useCallback(
    (direction: -1 | 1) => {
      if (worksheet !== "CF") return;
      commitCashFlow();
      const highestIndex = Math.min(cashFlows.values.length, 99);
      const nextIndex = Math.max(
        0,
        Math.min(cashFlowIndex + direction, highestIndex),
      );
      if (nextIndex === cashFlows.values.length) {
        setCashFlows(current => ({ values: [...current.values, 0] }));
      }
      setCashFlowIndex(nextIndex);
      setScreenLabel(cashFlowLabel(nextIndex));
      updateDisplay(
        formatDisplay(cashFlows.values[nextIndex] ?? 0),
        tvmState,
        direction < 0 ? "UP" : "DOWN",
      );
      setInputState("READY");
    },
    [
      cashFlowIndex,
      cashFlows.values,
      commitCashFlow,
      tvmState,
      updateDisplay,
      worksheet,
    ],
  );

  const calculateCashFlow = useCallback(
    (calculation: "NPV" | "IRR") => {
      commitCashFlow();
      const values = [...cashFlows.values];
      if (worksheet === "CF" && inputState === "INPUT") {
        values[cashFlowIndex] = Number(display);
      }
      try {
        const result =
          calculation === "NPV"
            ? computeNPV(values, tvmState.IY)
            : computeIRR(values);
        setScreenLabel(calculation === "NPV" ? "NPV" : "IRR %");
        updateDisplay(formatDisplay(result), tvmState, calculation);
      } catch {
        setScreenLabel(calculation);
        updateDisplay("Error 5", tvmState, `${calculation} (Error)`);
      }
      setInputState("READY");
      setIs2nd(false);
      setIsCpt(false);
    },
    [
      cashFlowIndex,
      cashFlows.values,
      commitCashFlow,
      display,
      inputState,
      tvmState,
      updateDisplay,
      worksheet,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      const key = event.key.toUpperCase();
      if (/^[0-9.]$/.test(key)) handleNum(key);
      else if (key === "BACKSPACE" || key === "ESCAPE") handleClear();
      else if (key === "+") handleOperator("add", "+");
      else if (key === "-") handleOperator("subtract", "−");
      else if (key === "*") handleOperator("multiply", "×");
      else if (key === "/") {
        event.preventDefault();
        handleOperator("divide", "÷");
      }
      else if (key === "^") handleOperator("power", "yˣ");
      else if (key === "%") handleUnary("percent", "%");
      else if (key === "(") handleOpenParenthesis();
      else if (key === ")") handleCloseParenthesis();
      else if (key === "=" || key === "ENTER") {
        event.preventDefault();
        if (worksheet === "CF") handleEnter();
        else handleEquals();
      }
      else if (key === "N") handleTVM("N");
      else if (key === "I") handleTVM("IY");
      else if (key === "P") handleTVM("PV");
      else if (key === "M") handleTVM("PMT");
      else if (key === "F") handleTVM("FV");
      else if (key === "ENTER") handleEnter();
      else if (key === "C") handleCPTMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleCPTMode,
    handleClear,
    handleCloseParenthesis,
    handleEnter,
    handleEquals,
    handleNum,
    handleOpenParenthesis,
    handleOperator,
    handleTVM,
    handleUnary,
    worksheet,
  ]);

  const unavailable = (feature: string) => ({
    disabled: true,
    title: `${feature} is not available yet`,
    "aria-label": `${feature} is not available yet`,
  });

  const secondary = (label: string, available = false) => (
    <span
      className={`ba-secondary${available ? "" : " ba-secondary--unavailable"}`}
    >
      {label || "\u00a0"}
      {!available && label ? " · N/A" : ""}
    </span>
  );

  return (
    <div className="ba2plus">
      <div className="ba2-brand">TEXAS INSTRUMENTS &nbsp; BA II PLUS</div>
      <div className="ba2-screen">
        <div className="ba2-annunciators">
          <span>{screenLabel}</span>
          {tvmState.isBGN && <span>BGN</span>}
          {is2nd && <span>2ND</span>}
          {isCpt && <span>CPT</span>}
        </div>
        <div className="ba2-digits">{display}</div>
      </div>
      <div className="ba2-worksheet-status" aria-live="polite">
        {worksheet === "CF" ? (
          <>
            Cash-flow worksheet · {cashFlowLabel(cashFlowIndex)} ·{" "}
            {cashFlows.values.length} saved · NPV rate {tvmState.IY.toFixed(2)}%
          </>
        ) : (
          <>TVM worksheet · cash-flow tools use I/Y as the NPV rate</>
        )}
      </div>

      <div className="ba2-grid">
        <div className="ba-key-group">{secondary("QUIT")}<button type="button" className={`ba-key ${isCpt ? "active" : ""}`} onClick={handleCPTMode}>CPT</button></div>
        <div className="ba-key-group">{secondary("SET")}<button type="button" className="ba-key" onClick={handleEnter}>ENTER</button></div>
        <div className="ba-key-group">{secondary("DEL")}<button type="button" className="ba-key" disabled={worksheet !== "CF"} onClick={() => moveCashFlow(-1)} aria-label="Previous cash flow">↑</button></div>
        <div className="ba-key-group">{secondary("INS")}<button type="button" className="ba-key" disabled={worksheet !== "CF"} onClick={() => moveCashFlow(1)} aria-label="Next cash flow">↓</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key" {...unavailable("Power control")}>ON/OFF</button></div>

        <div className="ba-key-group">{secondary("")}<button type="button" className={`ba-key ba-key--second ${is2nd ? "active" : ""}`} onClick={handle2nd}>2ND</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key" onClick={openCashFlowWorksheet}>CF</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key" onClick={() => calculateCashFlow("NPV")}>NPV</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key" onClick={() => calculateCashFlow("IRR")}>IRR</button></div>
        <div className="ba-key-group">{secondary("CLR WORK", true)}<button type="button" className="ba-key" onClick={handleClear}>CE/C</button></div>

        <div className="ba-key-group">{secondary("xP/Y")}<button type="button" className="ba-key tvm" onClick={() => handleTVM("N")}>N</button></div>
        <div className="ba-key-group">{secondary("P/Y")}<button type="button" className="ba-key tvm" onClick={() => handleTVM("IY")}>I/Y</button></div>
        <div className="ba-key-group">{secondary("AMORT")}<button type="button" className="ba-key tvm" onClick={() => handleTVM("PV")}>PV</button></div>
        <div className="ba-key-group">{secondary("BGN", true)}<button type="button" className="ba-key tvm" onClick={() => is2nd ? handleBGN() : handleTVM("PMT")}>PMT</button></div>
        <div className="ba-key-group">{secondary("CLR TVM", true)}<button type="button" className="ba-key tvm" onClick={() => is2nd ? handleClrTVM() : handleTVM("FV")}>FV</button></div>

        <div className="ba-key-group">{secondary("K")}<button type="button" className="ba-key" aria-label="Percent" onClick={() => handleUnary("percent", "%")}>%</button></div>
        <div className="ba-key-group">{secondary("SIN")}<button type="button" className="ba-key" aria-label="Square root" onClick={() => handleUnary("squareRoot", "√x")}>√x</button></div>
        <div className="ba-key-group">{secondary("COS")}<button type="button" className="ba-key" aria-label="Square" onClick={() => handleUnary("square", "x²")}>x²</button></div>
        <div className="ba-key-group">{secondary("TAN")}<button type="button" className="ba-key" aria-label="Reciprocal" onClick={() => handleUnary("reciprocal", "1/x")}>1/x</button></div>
        <div className="ba-key-group">{secondary("π")}<button type="button" className="ba-key op" aria-label="Divide" onClick={() => handleOperator("divide", "÷")}>÷</button></div>

        <div className="ba-key-group">{secondary("HYP")}<button type="button" className="ba-key" {...unavailable("Inverse functions")}>INV</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key" aria-label="Open parenthesis" onClick={handleOpenParenthesis}>(</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key" aria-label="Close parenthesis" onClick={handleCloseParenthesis}>)</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key" aria-label="Power" onClick={() => handleOperator("power", "yˣ")}>y^x</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key op" aria-label="Multiply" onClick={() => handleOperator("multiply", "×")}>×</button></div>

        <div className="ba-key-group">{secondary("STAT")}<button type="button" className="ba-key" aria-label="Natural logarithm" onClick={() => handleUnary("naturalLog", "LN")}>LN</button></div>
        <div className="ba-key-group">{secondary("DATA")}<button type="button" className="ba-key num" onClick={() => handleNum("7")}>7</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum("8")}>8</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum("9")}>9</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key op" aria-label="Subtract" onClick={() => handleOperator("subtract", "−")}>−</button></div>

        <div className="ba-key-group">{secondary("BOND")}<button type="button" className="ba-key" aria-label="Store in memory" onClick={handleStore}>STO</button></div>
        <div className="ba-key-group">{secondary("DEPR")}<button type="button" className="ba-key num" onClick={() => handleNum("4")}>4</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum("5")}>5</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum("6")}>6</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key op" aria-label="Add" onClick={() => handleOperator("add", "+")}>+</button></div>

        <div className="ba-key-group">{secondary("nPr")}<button type="button" className="ba-key" aria-label="Recall memory" onClick={handleRecall}>RCL</button></div>
        <div className="ba-key-group">{secondary("nCr")}<button type="button" className="ba-key num" onClick={() => handleNum("1")}>1</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum("2")}>2</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum("3")}>3</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key op" aria-label="Equals" onClick={handleEquals}>＝</button></div>

        <div className="ba-key-group">{secondary("FORMAT")}<button type="button" className="ba-key" aria-label="Reset calculator" onClick={handleReset}>RESET</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum("0")}>0</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key num" onClick={() => handleNum(".")}>.</button></div>
        <div className="ba-key-group">{secondary("ANS")}<button type="button" className="ba-key num" onClick={handleSign}>+/-</button></div>
        <div className="ba-key-group">{secondary("")}<button type="button" className="ba-key op" onClick={handleEnter}>ENTER</button></div>
      </div>
    </div>
  );
}
