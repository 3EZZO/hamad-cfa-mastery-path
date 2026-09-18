import React, { useState, useEffect, useCallback } from "react";
import { TVMState, computeTVM, defaultTVMState } from "../../lib/calculator";
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
}

export function BA2Plus({ onLog, startTime }: BA2PlusProps) {
  const [display, setDisplay] = useState("0.00");
  const [inputState, setInputState] = useState<"READY" | "INPUT">("READY");
  const [is2nd, setIs2nd] = useState(false);
  const [tvmState, setTvmState] = useState<TVMState>(defaultTVMState());

  const logStroke = (key: string, newDisplay: string, newState: TVMState) => {
    onLog({
      key,
      timestamp: Date.now() - startTime,
      display: newDisplay,
      registers: newState
    });
  };

  const updateDisplay = (val: string, newState = tvmState, key = "") => {
    setDisplay(val);
    setTvmState(newState);
    if (key) {
      logStroke(key, val, newState);
    }
  };

  const handleNum = (num: string) => {
    let newVal = display;
    if (inputState === "READY") {
      newVal = num;
      setInputState("INPUT");
    } else {
      if (num === "." && display.includes(".")) return;
      newVal = display + num;
    }
    updateDisplay(newVal, tvmState, num);
  };

  const handleClear = () => {
    updateDisplay("0.00", tvmState, "CE/C");
    setInputState("READY");
  };

  const handleSign = () => {
    if (display === "0.00" || display === "0") return;
    let newVal = display.startsWith("-") ? display.slice(1) : "-" + display;
    updateDisplay(newVal, tvmState, "+/-");
  };

  const handleTVM = (register: "N" | "IY" | "PV" | "PMT" | "FV") => {
    if (inputState === "INPUT") {
      // Store current display to register
      const val = parseFloat(display);
      const newState = { ...tvmState, [register]: val };
      updateDisplay(display, newState, register);
      setInputState("READY");
    } else {
      // Recall (not standard without RCL, but convenient for UX)
      // Actually standard BA II requires RCL + N. We'll just show it if pressed in READY.
      updateDisplay(tvmState[register].toFixed(2), tvmState, register);
    }
  };

  const handleCPT = (register: "N" | "IY" | "PV" | "PMT" | "FV") => {
    try {
      const result = computeTVM(register, tvmState);
      const newState = { ...tvmState, [register]: result };
      updateDisplay(result.toFixed(2), newState, `CPT ${register}`);
      setInputState("READY");
    } catch (e) {
      updateDisplay("Error 5", tvmState, `CPT ${register} (Error)`);
      setInputState("READY");
    }
  };

  const [isCpt, setIsCpt] = useState(false);

  const handle2nd = () => {
    setIs2nd(!is2nd);
    logStroke("2ND", display, tvmState);
  };

  const handleClrTVM = () => {
    const newState = { ...tvmState, N: 0, IY: 0, PV: 0, PMT: 0, FV: 0 };
    updateDisplay("0.00", newState, "CLR TVM");
    setIs2nd(false);
  };

  const handleBGN = () => {
    const newState = { ...tvmState, isBGN: !tvmState.isBGN };
    updateDisplay(newState.isBGN ? "BGN" : "END", newState, "BGN/END");
    setIs2nd(false);
    setInputState("READY");
  };

  const handleCPTMode = () => {
    setIsCpt(true);
    setIs2nd(false);
    logStroke("CPT", display, tvmState);
  };

  const handleTVM = (register: "N" | "IY" | "PV" | "PMT" | "FV") => {
    if (isCpt) {
      handleCPT(register);
      setIsCpt(false);
    } else if (inputState === "INPUT") {
      const val = parseFloat(display);
      const newState = { ...tvmState, [register]: val };
      updateDisplay(display, newState, register);
      setInputState("READY");
    } else {
      updateDisplay(tvmState[register].toFixed(2), tvmState, `RCL ${register}`);
    }
  };

  // Keyboard mapping
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      if (/[0-9.]/.test(key)) {
        handleNum(key);
      } else if (key === "BACKSPACE" || key === "ESCAPE") {
        handleClear();
      } else if (key === "N") handleTVM("N");
      else if (key === "I") handleTVM("IY");
      else if (key === "P") handleTVM("PV");
      else if (key === "M") handleTVM("PMT");
      else if (key === "F") handleTVM("FV");
      else if (key === "ENTER" || key === "C") handleCPTMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [display, inputState, tvmState, isCpt]);

  // Main render
  return (
    <div className="ba2plus">
      <div className="ba2-brand">TEXAS INSTRUMENTS &nbsp;&nbsp; BA II PLUS</div>
      <div className="ba2-screen">
        <div className="ba2-annunciators">
          {tvmState.isBGN && <span>BGN</span>}
          {is2nd && <span>2ND</span>}
          {isCpt && <span>CPT</span>}
        </div>
        <div className="ba2-digits">{display}</div>
      </div>
      <div className="ba2-grid">
        <button className={`ba-key ${is2nd ? 'active' : ''}`} onClick={handle2nd} style={{background: '#eab355', color: '#1a222c'}}>2ND</button>
        <button className={`ba-key ${isCpt ? 'active' : ''}`} onClick={handleCPTMode}>CPT</button>
        <button className="ba-key">ENTER</button>
        <button className="ba-key" onClick={handleClear}>CE/C</button>
        <button className="ba-key num" onClick={handleSign}>+/-</button>

        <div className="ba-key-group">
          <span className="ba-secondary">xP/Y</span>
          <button className="ba-key tvm" onClick={() => handleTVM("N")}>N</button>
        </div>
        <div className="ba-key-group">
          <span className="ba-secondary">P/Y</span>
          <button className="ba-key tvm" onClick={() => handleTVM("IY")}>I/Y</button>
        </div>
        <div className="ba-key-group">
          <span className="ba-secondary">AMORT</span>
          <button className="ba-key tvm" onClick={() => handleTVM("PV")}>PV</button>
        </div>
        <div className="ba-key-group">
          <span className="ba-secondary">BGN</span>
          <button className="ba-key tvm" onClick={() => is2nd ? handleBGN() : handleTVM("PMT")}>PMT</button>
        </div>
        <div className="ba-key-group">
          <span className="ba-secondary">CLR TVM</span>
          <button className="ba-key tvm" onClick={() => is2nd ? handleClrTVM() : handleTVM("FV")}>FV</button>
        </div>

        {/* Numpad Block */}
        <button className="ba-key num" onClick={() => handleNum("7")}>7</button>
        <button className="ba-key num" onClick={() => handleNum("8")}>8</button>
        <button className="ba-key num" onClick={() => handleNum("9")}>9</button>
        <button className="ba-key num" onClick={() => handleNum("4")}>4</button>
        <button className="ba-key num" onClick={() => handleNum("5")}>5</button>
        <button className="ba-key num" onClick={() => handleNum("6")}>6</button>
        <button className="ba-key num" onClick={() => handleNum("1")}>1</button>
        <button className="ba-key num" onClick={() => handleNum("2")}>2</button>
        <button className="ba-key num" onClick={() => handleNum("3")}>3</button>
        <button className="ba-key num" onClick={() => handleNum("0")} style={{gridColumn: "span 2"}}>0</button>
        <button className="ba-key num" onClick={() => handleNum(".")}>.</button>
      </div>
    </div>
  );
}
