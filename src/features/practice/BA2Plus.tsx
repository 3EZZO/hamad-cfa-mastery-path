import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { type TVMState } from "../../lib/calculator";
import {
  calculatorDisplay,
  calculatorStatus,
  createCalculator,
  pressCalculator,
  type CalculatorState,
} from "../../lib/ba2Machine";
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
  keyScope?: RefObject<HTMLElement | null>;
}
// Keep the workbook while a floating window is closed, but isolate each host
// (and rehearsal) by its stable React state setter. No student data is persisted.
const workbooks = new WeakMap<BA2PlusProps["onStateChange"], CalculatorState>();
interface Key {
  id: string;
  text: string;
  secondary?: string;
  label?: string;
  type?: string;
}
const keys: Key[] = [
  { id: "CPT", text: "CPT", secondary: "QUIT" },
  { id: "ENTER", text: "ENTER", secondary: "SET" },
  { id: "up", text: "\u2191", secondary: "DEL", label: "Previous setting" },
  { id: "down", text: "\u2193", secondary: "INS", label: "Next setting" },
  { id: "power", text: "ON/OFF", label: "Power on or off" },
  { id: "2nd", text: "2ND", type: "ba-key--second" },
  { id: "CF", text: "CF" },
  { id: "NPV", text: "NPV" },
  { id: "IRR", text: "IRR" },
  { id: "backspace", text: "\u2192", label: "Backspace" },
  { id: "N", text: "N", secondary: "xP/Y", type: "tvm" },
  { id: "IY", text: "I/Y", secondary: "P/Y", type: "tvm" },
  { id: "PV", text: "PV", secondary: "AMORT", type: "tvm" },
  { id: "PMT", text: "PMT", secondary: "BGN", type: "tvm" },
  { id: "FV", text: "FV", secondary: "CLR TVM", type: "tvm" },
  { id: "%", text: "%", secondary: "K", label: "Percent" },
  { id: "sqrt", text: "\u221ax", label: "Square root" },
  { id: "square", text: "x\u00b2", label: "Square" },
  { id: "reciprocal", text: "1/x", label: "Reciprocal" },
  { id: "/", text: "\u00f7", secondary: "RAND", label: "Divide", type: "op" },
  { id: "INV", text: "INV", secondary: "HYP" },
  { id: "(", text: "(", secondary: "SIN", label: "Open parenthesis" },
  { id: ")", text: ")", secondary: "COS", label: "Close parenthesis" },
  { id: "^", text: "y^x", secondary: "TAN", label: "Power" },
  { id: "*", text: "\u00d7", secondary: "x!", label: "Multiply", type: "op" },
  { id: "LN", text: "LN", secondary: "e\u02e3", label: "Natural logarithm" },
  { id: "7", text: "7", secondary: "DATA", type: "num" },
  { id: "8", text: "8", secondary: "STAT", type: "num" },
  { id: "9", text: "9", secondary: "BOND", type: "num" },
  { id: "-", text: "\u2212", secondary: "nPr", label: "Subtract", type: "op" },
  { id: "STO", text: "STO", secondary: "ROUND", label: "Store in memory" },
  { id: "4", text: "4", secondary: "DEPR", type: "num" },
  { id: "5", text: "5", secondary: "\u0394%", type: "num" },
  { id: "6", text: "6", secondary: "BRKEVN", type: "num" },
  { id: "+", text: "+", secondary: "nCr", label: "Add", type: "op" },
  { id: "RCL", text: "RCL", label: "Recall memory" },
  { id: "1", text: "1", secondary: "DATE", type: "num" },
  { id: "2", text: "2", secondary: "ICONV", type: "num" },
  { id: "3", text: "3", secondary: "PROFIT", type: "num" },
  { id: "=", text: "\uff1d", secondary: "ANS", label: "Equals", type: "op" },
  { id: "CE", text: "CE/C", secondary: "CLR WORK", label: "Clear entry" },
  { id: "0", text: "0", secondary: "MEM", type: "num" },
  { id: ".", text: ".", secondary: "FORMAT", type: "num" },
  { id: "sign", text: "+/-", secondary: "RESET", label: "Change sign", type: "num" },
];
const keyboard: Record<string, string> = {
  Backspace: "backspace",
  Escape: "CE",
  Enter: "ENTER",
  "=": "=",
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "^": "^",
  "%": "%",
  "(": "(",
  ")": ")",
  ArrowUp: "up",
  ArrowDown: "down",
  n: "N",
  i: "IY",
  p: "PV",
  m: "PMT",
  f: "FV",
  c: "CPT",
};

export function BA2Plus({ onLog, startTime, tvmState, onStateChange, keyScope }: BA2PlusProps) {
  const [state, setState] = useState<CalculatorState>(() => {
    const saved = workbooks.get(onStateChange);
    return saved ? { ...saved, tvm: { ...tvmState } } : createCalculator(tvmState);
  });
  const stateRef = useRef(state);
  const hostRef = useRef<HTMLDivElement>(null);
  const reported = useRef(tvmState);
  const press = useCallback(
    (key: string) => {
      const next = pressCalculator(stateRef.current, key);
      stateRef.current = next;
      reported.current = next.tvm;
      workbooks.set(onStateChange, next);
      setState(next);
      onStateChange(next.tvm);
      onLog({
        key: next.event,
        timestamp: Date.now() - startTime,
        display: calculatorDisplay(next),
        registers: { ...next.tvm },
      });
    },
    [onLog, onStateChange, startTime],
  );
  const latestPress = useRef(press);
  useEffect(() => {
    latestPress.current = press;
  }, [press]);
  useEffect(() => {
    if (tvmState === reported.current) return;
    const next = { ...stateRef.current, tvm: { ...tvmState } };
    stateRef.current = next;
    reported.current = tvmState;
    setState(next);
    workbooks.set(onStateChange, next);
  }, [onStateChange, tvmState]);
  useEffect(() => {
    if (!state.powered) return;
    const timer = setTimeout(() => latestPress.current("apd"), 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (keyScope && !(target && keyScope.current?.contains(target))) return;
      if (
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        !(target && hostRef.current?.contains(target))
      )
        return;
      const key = /^[0-9.]$/.test(event.key)
        ? event.key
        : (keyboard[event.key] ?? keyboard[event.key.toLowerCase()]);
      if (!key) return;
      event.preventDefault();
      press(key === "ENTER" && stateRef.current.worksheet === "STD" ? "=" : key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyScope, press]);
  return (
    <div className="ba2plus" ref={hostRef}>
      <div className="ba2-brand">BA II PLUS - FINANCIAL CALCULATOR</div>
      <div
        className="ba2-screen"
        role="status"
        aria-label="Calculator display"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="ba2-annunciators">
          <span>{state.powered ? state.label : ""}</span>
          {state.powered && state.tvm.isBGN && <span>BGN</span>}
          {state.second && <span>2ND</span>}
          {state.compute && <span>CPT</span>}
          {state.inverse && <span>INV</span>}
          {state.hyperbolic && <span>HYP</span>}
          {state.powered && !!state.tables.FORMAT.ANGLE && <span>RAD</span>}
        </div>
        <div className="ba2-digits">{calculatorDisplay(state)}</div>
      </div>
      <div className="ba2-worksheet-status">{calculatorStatus(state)}</div>
      <div className="ba2-grid">
        {keys.map((key) => (
          <div
            key={key.id}
            className={`ba-key-group${key.id === "=" ? " ba-key-group--equals" : ""}`}
          >
            <span className="ba-secondary">{key.secondary || "\u00a0"}</span>
            <button
              type="button"
              className={`ba-key ${key.type ?? ""}${(key.id === "2nd" && state.second) || (key.id === "CPT" && state.compute) ? " active" : ""}`}
              data-calc-key={key.id}
              aria-label={key.label}
              aria-pressed={key.id === "2nd" ? state.second : undefined}
              title={key.secondary ? `${key.text} / 2ND ${key.secondary}` : (key.label ?? key.text)}
              disabled={!state.powered && key.id !== "power"}
              onClick={() => press(key.id)}
            >
              {key.text}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
