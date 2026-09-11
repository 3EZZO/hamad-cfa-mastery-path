import { ArrowLeft, ArrowRight, LibraryBig, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { flattenSessionDecks } from "./sessionDeckModel";
import { StageCard } from "./StageCard";
import type { LiveSessionStage, TeachingFlowStep } from "./types";
import { useDialogFocus } from "./useDialogFocus";

export function TeachingLibrary({ stages }: { stages: LiveSessionStage[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stageId, setStageId] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [step, setStep] = useState<TeachingFlowStep>("teach");
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const decks = useMemo(() => flattenSessionDecks(stages), [stages]);
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return decks.filter(deck => {
      const text = JSON.stringify(deck.question ?? deck.stage).toLowerCase();
      return (
        (!stageId || deck.stageId === stageId) &&
        terms.every(term => text.includes(term))
      );
    });
  }, [decks, query, stageId]);
  const current =
    filtered.find(deck => deck.key === selectedKey) ?? filtered[0];
  const index = current ? filtered.indexOf(current) : -1;
  useDialogFocus(open, dialogRef, searchRef, () => setOpen(false));
  if (!decks.length) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        <LibraryBig size={17} /> Full teaching library · {decks.length} library decks
      </button>
      {open &&
        createPortal(
          <div className="live-session ls-library-backdrop">
            <section
              ref={dialogRef}
              className="ls-library"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ls-library-title"
              tabIndex={-1}
            >
              <header className="ls-library__header">
                <div>
                  <h2 id="ls-library-title">Full teaching library</h2>
                  <p>
                    Reference only · your live route, position, and progress
                    stay unchanged.
                  </p>
                </div>
                <button
                  className="ls-button ls-button--quiet"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  <X size={18} /> Return to session
                </button>
              </header>
              <div className="ls-library__filters">
                <label>
                  <Search size={17} />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    aria-label="Search the full teaching library"
                    placeholder="Search a concept, question, or answer"
                    onChange={event => setQuery(event.target.value)}
                  />
                </label>
                <select
                  value={stageId}
                  aria-label="Filter library by module"
                  onChange={event => setStageId(event.target.value)}
                >
                  <option value="">All modules</option>
                  {stages.map(stage => (
                    <option key={stage.id} value={stage.id}>
                      {stage.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ls-library__navigation">
                <button
                  className="ls-button ls-button--quiet"
                  type="button"
                  disabled={index <= 0}
                  onClick={() => {
                    setSelectedKey(filtered[index - 1]!.key);
                    setStep("teach");
                  }}
                >
                  <ArrowLeft size={17} /> Previous
                </button>
                <select
                  aria-label="Choose a library deck"
                  value={current?.key ?? ""}
                  disabled={!current}
                  onChange={event => {
                    setSelectedKey(event.target.value);
                    setStep("teach");
                  }}
                >
                  {!current && <option value="">No matching decks</option>}
                  {filtered.map((deck, i) => (
                    <option key={deck.key} value={deck.key}>
                      {i + 1} / {filtered.length} ·{" "}
                      {deck.question?.title ?? deck.stage.title}
                    </option>
                  ))}
                </select>
                <button
                  className="ls-button ls-button--primary"
                  type="button"
                  disabled={index < 0 || index === filtered.length - 1}
                  onClick={() => {
                    setSelectedKey(filtered[index + 1]!.key);
                    setStep("teach");
                  }}
                >
                  Next <ArrowRight size={17} />
                </button>
              </div>
              <div className="ls-library__content">
                {current ? (
                  <StageCard
                    key={current.key}
                    stage={current.stage}
                    question={current.question}
                    questionIndex={current.questionIndex}
                    flowStep={step}
                    complete={false}
                    onFlowStepChange={setStep}
                  />
                ) : (
                  <div className="ls-reference-empty">
                    <Search size={22} />
                    <strong>No matching decks</strong>
                    <p>
                      Try fewer words or choose All modules. Your live position
                      has not changed.
                    </p>
                    <button
                      className="ls-button ls-button--quiet"
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setStageId("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>,
          document.body
        )}
    </>
  );
}
