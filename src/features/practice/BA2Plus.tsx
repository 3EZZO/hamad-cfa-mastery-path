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
  { id: "^", text: "y\u02e3", secondary: "TAN", label: "Power" },
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

// Local SVG segments stay crisp when the panel scales and need no font download.
// The original display string is retained separately for assistive technology.
const segments: Record<string, string> = {
  a: "3,1 15,1 17,3 15,5 3,5 1,3",
  b: "16,5 18,3 18,20 16,22 14,20 14,7",
  c: "16,25 18,23 18,40 16,42 14,40 14,27",
  d: "3,40 15,40 17,42 15,44 3,44 1,42",
  e: "2,25 4,27 4,40 2,42 0,40 0,23",
  f: "2,5 4,7 4,20 2,22 0,20 0,3",
  g: "3,20 15,20 17,22 15,24 3,24 1,22",
};
const digitSegments: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  e: "adefg",
};

function CalculatorLCD({ value }: { value: string }) {
  let cursor = 0;
  const characters = Array.from(value, (character) => {
    const x = cursor;
    cursor += /[.,]/.test(character) ? 7 : 23;
    return { character, x };
  });
  const width = Math.max(246, cursor + 8);
  return (
    <svg className="ba2-lcd" viewBox={`0 0 ${width} 50`} aria-hidden="true" focusable="false">
      {/^[\d.,e+\- ]*$/.test(value) ? (
        <g transform={`translate(${width - cursor - 2}, 2) skewX(-5)`}>
          {characters.map(({ character, x }, index) => (
            <g key={index} transform={`translate(${x}, 0)`}>
              {character === "." || character === "," ? (
                <path d={character === "." ? "M1 41h3v3H1z" : "M1 41h3v3l-3 3H0l2-3H1z"} />
              ) : character === "+" ? (
                <path d="M2 21h14v3H2z M7.5 15.5h3v14h-3z" />
              ) : (
                Object.entries(segments).map(([id, points]) => (
                  <polygon
                    key={id}
                    points={points}
                    className={
                      digitSegments[character]?.includes(id) ? undefined : "ba2-lcd--unlit"
                    }
                  />
                ))
              )}
            </g>
          ))}
        </g>
      ) : (
        <text x={width - 2} y="39" textAnchor="end">
          {value}
        </text>
      )}
    </svg>
  );
}

export function BA2Plus({ onLog, startTime, tvmState, onStateChange, keyScope }: BA2PlusProps) {
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const keyRelease = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<CalculatorState>(() => {
    const saved = workbooks.get(onStateChange);
    return saved ? { ...saved, tvm: { ...tvmState } } : createCalculator(tvmState);
  });
  const stateRef = useRef(state);
  const hostRef = useRef<HTMLDivElement>(null);
  const reported = useRef(tvmState);
  const press = useCallback(
    (key: string) => {
      if (key !== "apd") {
        if (keyRelease.current !== null) clearTimeout(keyRelease.current);
        setPressedKey(key);
        keyRelease.current = setTimeout(() => {
          keyRelease.current = null;
          setPressedKey(null);
        }, 90);
      }
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
  useEffect(
    () => () => {
      if (keyRelease.current !== null) clearTimeout(keyRelease.current);
    },
    [],
  );
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
      <div className="ba2-case">
        <div className="ba2-brand" aria-label="BA II Plus Professional-style calculator">
          <div className="ba2-model">
            BA II <i>Plus</i>
          </div>
          <div className="ba2-edition">PROFESSIONAL</div>
        </div>
        <div className="ba2-display-bezel">
          <div
            className="ba2-screen"
            role="status"
            aria-label="Calculator display"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="ba2-annunciators" aria-hidden="true">
              {[
                ["2nd", state.second],
                ["INV", state.inverse],
                ["HYP", state.hyperbolic],
                ["COMPUTE", state.compute],
                ["BGN", state.tvm.isBGN],
                ["RAD", !!state.tables.FORMAT.ANGLE],
              ].map(([text, on]) => (
                <span key={String(text)} className={state.powered && on ? "is-on" : undefined}>
                  {text}
                </span>
              ))}
            </div>
            <div className="ba2-display-line">
              <span className="ba2-variable" aria-hidden="true">
                {state.powered ? state.label : ""}
              </span>
              <CalculatorLCD value={calculatorDisplay(state)} />
            </div>
            <span className="ba2-display-accessible">
              {state.powered ? state.label : ""} {state.powered && state.tvm.isBGN ? "BGN" : ""}{" "}
              {state.second ? "2ND" : ""} {state.compute ? "CPT" : ""} {state.inverse ? "INV" : ""}{" "}
              {state.hyperbolic ? "HYP" : ""}{" "}
              {state.powered && state.tables.FORMAT.ANGLE ? "RAD" : ""}
            </span>
            <div className="ba2-digits">{calculatorDisplay(state)}</div>
          </div>
        </div>
        <div className="ba2-maker" aria-hidden="true">
          <svg className="ba2-maker-mark" viewBox="0 0 25 25" focusable="false">
            <path d="m23.3,7.89v-2.98h-4.79l-.6,3.01h1.72l-.55,2.77h-1.72l-.6,3c-.05.2-.08.35-.1.49-.14.92.26.87,1.55.87l-.59,2.95h-2.25c-2.13,0-3.86-.02-3.41-2.2.07-.34.16-.67.22-.99l.8-4.12h-1.66l.55-2.77h1.65l.6-3.01h-1.55V.37h-5.73v9.23H0c.17,2.39,2.29,2.74,3.06,4.44.53,1.17,1,3.23,2.55,3.25,1.19.01,1.19-1.54,2.72-1.54s2.21,2.91,3.57,5.3c1.02,1.88,2.72,3.14,4.25,3.25,1.26.09,1.87-.34,1.87-.34-.34-.68-.51-1.37-.51-2.39,0-1.54,1.19-3.08,2.55-4.1,1.87-1.37,3.91-1.88,4.59-2.05v-4.79s-1.36-.73-1.36-2.74Zm-7.8,7.16l2.01-10.14h-2.32l-2.01,10.14h2.32Zm2.63-13.35h-2.32l-.44,2.24h2.32l.44-2.24Z" />
          </svg>
          Texas Instruments
        </div>
        <div className="ba2-keypad">
          <div className="ba2-grid">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`ba-key-group${key.id === "=" ? " ba-key-group--equals" : ""}${["2nd", "CF", "NPV", "IRR", "backspace"].includes(key.id) ? " ba-key-group--unlabelled" : ""}`}
              >
                <span className="ba-secondary" aria-hidden="true">
                  {key.secondary || "\u00a0"}
                </span>
                <span className="ba-key-socket">
                  <button
                    type="button"
                    className={`ba-key ${key.type ?? ""}${(key.id === "2nd" && state.second) || (key.id === "CPT" && state.compute) ? " active" : ""}${pressedKey === key.id ? " is-pressed" : ""}`}
                    data-calc-key={key.id}
                    aria-label={key.label}
                    aria-pressed={key.id === "2nd" ? state.second : undefined}
                    title={
                      key.secondary ? `${key.text} / 2ND ${key.secondary}` : (key.label ?? key.text)
                    }
                    disabled={!state.powered && key.id !== "power"}
                    onClick={() => press(key.id)}
                  >
                    {key.text}
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="ba2-footer" aria-hidden="true">
            ADVANCED BUSINESS ANALYST
          </div>
        </div>
      </div>
      <div className="ba2-worksheet-status">{calculatorStatus(state)}</div>
    </div>
  );
}
