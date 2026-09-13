import {
  Archive,
  Check,
  CircleAlert,
  CircleDashed,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import type { EvidenceDraft, EvidenceVerdict, ErrorCode } from "./types";
import { useId } from "react";
import { ERROR_CODE_COPY } from "./types";

export interface EvidenceRepairFlowProps {
  mode?: "live" | "rehearsal";
  targetLabel: string;
  value: EvidenceDraft;
  repairInstructions?: string[];
  onChange: (value: EvidenceDraft) => void;
  onRecord: () => void;
  onClose?: () => void;
}

const VERDICTS: Array<{
  id: EvidenceVerdict;
  label: string;
  detail: string;
  icon: typeof Check;
  shortcut: string;
}> = [
  {
    id: "correct",
    label: "Secure",
    detail: "Independent and explained",
    icon: Check,
    shortcut: "C",
  },
  {
    id: "partial",
    label: "Developing",
    detail: "Sound method, incomplete proof",
    icon: CircleDashed,
    shortcut: "L",
  },
  {
    id: "repair",
    label: "Repair",
    detail: "Diagnose, correct, retest",
    icon: CircleAlert,
    shortcut: "R",
  },
  {
    id: "parked",
    label: "Defer",
    detail: "Return before completion",
    icon: Archive,
    shortcut: "P",
  },
];

export function EvidenceRepairFlow({
  mode = "live",
  targetLabel,
  value,
  repairInstructions = [],
  onChange,
  onRecord,
  onClose,
}: EvidenceRepairFlowProps) {
  const errorHintId = useId();
  const deferHintId = useId();
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
      (!needsParkReason || value.note.trim())
  );

  return (
    <aside
      className="ls-evidence"
      id="ls-evidence-panel"
      tabIndex={-1}
      aria-labelledby="ls-evidence-title"
    >
      <header className="ls-evidence__header">
        <div>
          <p className="ls-eyebrow">Tutor observation</p>
          <h2 id="ls-evidence-title">Record the evidence</h2>
        </div>
        {onClose ? (
          <button
            className="ls-evidence-close ls-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Return to the teaching panels"
          >
            <X size={18} />
          </button>
        ) : (
          <ShieldCheck size={20} aria-label="Tutor-only evidence" />
        )}
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
              <span>
                <strong>{verdict.label}</strong>
                <small>{verdict.detail}</small>
              </span>
              <kbd>{verdict.shortcut}</kbd>
            </button>
          );
        })}
      </div>

      <fieldset className="ls-confidence">
        <legend>Confidence before feedback</legend>
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
        <small>1 means guessing; 5 means he can teach it back accurately.</small>
      </fieldset>

      {value.verdict === "repair" && (
        <section className="ls-repair" aria-label="Repair path">
          <div className="ls-repair__heading">
            <CircleAlert size={17} />
            <div>
              <strong>Locate the first broken step</strong>
              <span>Select every code supported by evidence.</span>
            </div>
          </div>
          <div className="ls-error-codes" role="group" aria-label="Error codes" aria-describedby={needsErrorCode && !value.errorCodes.length ? errorHintId : undefined}>
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
                <span>
                  {ERROR_CODE_COPY[code].label}
                  <small>{ERROR_CODE_COPY[code].repairCue}</small>
                </span>
              </button>
            ))}
          </div>
          {repairInstructions.length > 0 && (
            <div className="ls-repair__script">
              <span>Smallest effective repair</span>
              <ol>
                {repairInstructions.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <label className="ls-note-field">
        <span>
          Evidence note{" "}
          <small>
            {needsParkReason ? "required when deferred" : "optional"}
          </small>
        </span>
        <textarea
          rows={3}
          aria-required={needsParkReason}
          aria-describedby={needsParkReason && !value.note.trim() ? deferHintId : undefined}
          maxLength={500}
          placeholder="Record what Hamad said, wrote, calculated, or corrected."
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
        <Save size={17} /> {mode === "rehearsal" ? "Practice evidence and continue" : "Save evidence and continue"} <kbd>Enter</kbd>
      </button>
      {needsErrorCode && !value.errorCodes.length && (
        <p className="ls-evidence__hint" id={errorHintId} role="status">
          <CircleAlert size={14} /> Select at least one error code.
        </p>
      )}
      {needsParkReason && !value.note.trim() && (
        <p className="ls-evidence__hint" id={deferHintId} role="status">
          <CircleAlert size={14} /> Record why this item is deferred.
        </p>
      )}
    </aside>
  );
}
