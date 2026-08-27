import {
  Archive,
  Check,
  CircleAlert,
  CircleDashed,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { EvidenceDraft, EvidenceVerdict, ErrorCode } from "./types";
import { ERROR_CODE_COPY } from "./types";

export interface EvidenceRepairFlowProps {
  targetLabel: string;
  value: EvidenceDraft;
  repairInstructions?: string[];
  onChange: (value: EvidenceDraft) => void;
  onRecord: () => void;
}

const VERDICTS: Array<{
  id: EvidenceVerdict;
  label: string;
  detail: string;
  icon: typeof Check;
  shortcut: string;
}> = [
  { id: "correct", label: "Correct", detail: "Independent proof", icon: Check, shortcut: "C" },
  { id: "partial", label: "Partial", detail: "Right path, incomplete", icon: CircleDashed, shortcut: "L" },
  { id: "repair", label: "Repair", detail: "Name and correct", icon: CircleAlert, shortcut: "R" },
  { id: "parked", label: "Park", detail: "Return before close", icon: Archive, shortcut: "P" },
];

export function EvidenceRepairFlow({
  targetLabel,
  value,
  repairInstructions = [],
  onChange,
  onRecord,
}: EvidenceRepairFlowProps) {
  const setVerdict = (verdict: EvidenceVerdict) => {
    onChange({
      ...value,
      verdict,
      errorCodes: verdict === "repair" ? value.errorCodes : [],
    });
  };
  const toggleError = (code: ErrorCode) => {
    onChange({
      ...value,
      errorCodes: value.errorCodes.includes(code)
        ? value.errorCodes.filter(item => item !== code)
        : [...value.errorCodes, code],
    });
  };
  const needsErrorCode = value.verdict === "repair";
  const needsParkReason = value.verdict === "parked";
  const canRecord = Boolean(
    value.verdict &&
      (!needsErrorCode || value.errorCodes.length > 0) &&
      (!needsParkReason || value.note.trim()),
  );

  return (
    <aside className="ls-evidence" aria-labelledby="ls-evidence-title">
      <header className="ls-evidence__header">
        <div>
          <p className="ls-eyebrow">Live evidence</p>
          <h2 id="ls-evidence-title">What happened?</h2>
        </div>
        <ShieldCheck size={20} aria-label="Tutor-only evidence" />
      </header>
      <p className="ls-evidence__target">{targetLabel}</p>

      <div className="ls-verdicts" role="group" aria-label="Evidence verdict">
        {VERDICTS.map(verdict => {
          const Icon = verdict.icon;
          return (
            <button
              className={`ls-verdict ls-verdict--${verdict.id}${
                value.verdict === verdict.id ? " is-selected" : ""
              }`}
              type="button"
              aria-pressed={value.verdict === verdict.id}
              key={verdict.id}
              onClick={() => setVerdict(verdict.id)}
            >
              <Icon size={17} />
              <span><strong>{verdict.label}</strong><small>{verdict.detail}</small></span>
              <kbd>{verdict.shortcut}</kbd>
            </button>
          );
        })}
      </div>

      <fieldset className="ls-confidence">
        <legend>Hamad&apos;s confidence</legend>
        <div>
          {[1, 2, 3, 4, 5].map(score => (
            <button
              type="button"
              className={value.confidence === score ? "is-selected" : ""}
              aria-pressed={value.confidence === score}
              key={score}
              onClick={() => onChange({ ...value, confidence: score })}
            >
              {score}
            </button>
          ))}
        </div>
        <small>1 = guessing · 5 = can teach it back</small>
      </fieldset>

      {value.verdict === "repair" && (
        <section className="ls-repair" aria-label="Repair path">
          <div className="ls-repair__heading">
            <CircleAlert size={17} />
            <div><strong>Name the broken step</strong><span>Select every code that applies.</span></div>
          </div>
          <div className="ls-error-codes">
            {(Object.keys(ERROR_CODE_COPY) as ErrorCode[]).map(code => (
              <button
                type="button"
                className={value.errorCodes.includes(code) ? "is-selected" : ""}
                aria-pressed={value.errorCodes.includes(code)}
                title={ERROR_CODE_COPY[code].description}
                key={code}
                onClick={() => toggleError(code)}
              >
                <strong>{code}</strong>
                <span>{ERROR_CODE_COPY[code].label}<small>{ERROR_CODE_COPY[code].repairCue}</small></span>
              </button>
            ))}
          </div>
          {repairInstructions.length > 0 && (
            <div className="ls-repair__script">
              <span>Exact repair sequence</span>
              <ol>{repairInstructions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>
            </div>
          )}
        </section>
      )}

      <label className="ls-note-field">
        <span>
          Quick tutor note{" "}
          <small>{needsParkReason ? "required when parked" : "optional"}</small>
        </span>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="Record observable evidence, not a general impression."
          value={value.note}
          onChange={event => onChange({ ...value, note: event.target.value })}
        />
      </label>

      <button
        className="ls-button ls-button--primary ls-button--block"
        type="button"
        disabled={!canRecord}
        onClick={onRecord}
      >
        <Save size={17} /> Record and continue <kbd>Enter</kbd>
      </button>
      {needsErrorCode && !value.errorCodes.length && (
        <p className="ls-evidence__hint"><CircleAlert size={14} /> Select at least one error code.</p>
      )}
      {needsParkReason && !value.note.trim() && (
        <p className="ls-evidence__hint"><CircleAlert size={14} /> Record why this item is parked.</p>
      )}
    </aside>
  );
}
