import { Maximize2, X } from "lucide-react";
import { useRef } from "react";
import { useDialogFocus } from "./useDialogFocus";

export interface CandidatePromptViewProps {
  open: boolean;
  sessionLabel: string;
  stageLabel: string;
  prompt: string;
  options?: string[];
  timeDisplay?: string;
  onClose: () => void;
}

export function CandidatePromptView({
  open,
  sessionLabel,
  stageLabel,
  prompt,
  options = [],
  timeDisplay,
  onClose,
}: CandidatePromptViewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useDialogFocus(open, dialogRef, closeRef, onClose);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="ls-candidate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ls-candidate-title"
      tabIndex={-1}
    >
      <header className="ls-candidate__header">
        <div>
          <span>{sessionLabel}</span>
          <strong>{stageLabel}</strong>
        </div>
        {timeDisplay && <time>{timeDisplay}</time>}
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Return to tutor view">
          <X size={22} />
        </button>
      </header>
      <main className="ls-candidate__canvas">
        <p className="ls-candidate__eyebrow"><Maximize2 size={17} /> Candidate view</p>
        <h2 id="ls-candidate-title">{prompt}</h2>
        {options.length > 0 && (
          <ol className="ls-candidate__options">
            {options.map((option, index) => (
              <li key={`${index}-${option}`}>
                <span>{String.fromCharCode(65 + index)}</span>
                <p>{option}</p>
              </li>
            ))}
          </ol>
        )}
        <p className="ls-candidate__instruction">Explain the decision before calculating.</p>
      </main>
    </div>
  );
}
