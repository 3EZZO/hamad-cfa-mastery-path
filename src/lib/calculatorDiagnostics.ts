import type { KeystrokeLog } from "../features/practice/BA2Plus";

export type DiagnosticWarning = {
  type: "STALE_DATA" | "SIGN_CONVENTION" | "MISSING_CPT" | "EXCESSIVE_STROKES";
  message: string;
};

export function analyzeKeystrokes(logs: KeystrokeLog[]): DiagnosticWarning[] {
  const warnings: DiagnosticWarning[] = [];
  if (!logs || logs.length === 0) return warnings;

  // Track which registers were explicitly inputted during this session
  const inputtedRegisters = new Set<string>();
  
  // Track computations
  let lastComputation: string | null = null;
  let computations = 0;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    
    if (["N", "IY", "PV", "PMT", "FV"].includes(log.key)) {
      if (!log.key.startsWith("CPT")) {
         // It's an input if the previous key was a number or if inputState was INPUT
         // Actually, if the key is just 'N' without CPT, it's an input or recall.
         // If it changed the register value or was entered, we count it as inputted.
         inputtedRegisters.add(log.key);
      }
    }

    if (log.key.startsWith("CPT ")) {
      const target = log.key.split(" ")[1];
      computations++;
      lastComputation = target;

      // Rule 1: Stale Data
      // If they compute something, check if the other 4 registers were either inputted or are 0.
      const required = ["N", "IY", "PV", "PMT", "FV"].filter(r => r !== target);
      const stale = required.filter(r => !inputtedRegisters.has(r) && (log.registers as any)[r] !== 0);
      
      if (stale.length > 0) {
        warnings.push({
          type: "STALE_DATA",
          message: `Stale Data Risk: You computed ${target} while using old values for ${stale.join(", ")} that weren't entered during this attempt. Always press 2ND CLR TVM before a new problem.`
        });
      }

      // Rule 2: Sign Convention
      // If PV, PMT, and FV are all positive (or all negative) and non-zero, that's almost always a cash flow sign error.
      const { PV, PMT, FV } = log.registers;
      const signs = [Math.sign(PV), Math.sign(PMT), Math.sign(FV)].filter(s => s !== 0);
      
      // If there are at least two non-zero cash flows and they all have the exact same sign
      if (signs.length >= 2 && signs.every(s => s === signs[0])) {
        warnings.push({
          type: "SIGN_CONVENTION",
          message: "Sign Convention Error: PV, PMT, and FV cannot all have the same sign. The calculator requires cash outflows (money invested) to be negative, and cash inflows (money received) to be positive."
        });
      }
    }
  }

  // Rule 3: Missing CPT
  // If they didn't compute anything but hit a lot of TVM keys
  if (computations === 0 && inputtedRegisters.size >= 3) {
    warnings.push({
      type: "MISSING_CPT",
      message: "Missing CPT: You entered TVM values but never pressed CPT to calculate the answer."
    });
  }
  
  // Rule 4: Excessive Strokes
  if (logs.length > 50) {
    warnings.push({
      type: "EXCESSIVE_STROKES",
      message: "Inefficient Keystrokes: You used more than 50 keystrokes for this problem. Practice using the calculator's memory and chain operations."
    });
  }

  // Deduplicate warnings by type
  const uniqueWarnings = [];
  const seen = new Set();
  for (const w of warnings) {
    if (!seen.has(w.type)) {
      seen.add(w.type);
      uniqueWarnings.push(w);
    }
  }

  return uniqueWarnings;
}
