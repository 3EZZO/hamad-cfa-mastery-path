import { Maximize2, X } from "lucide-react";
import { useEffect, useRef } from "react";

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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="ls-candidate" role="dialog" aria-modal="true" aria-labelledby="ls-candidate-title">
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

