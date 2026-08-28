import { BookOpenCheck, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveSessionReference } from "./types";

export interface ReferenceDrawerProps {
  open: boolean;
  references: LiveSessionReference[];
  activeReferenceIds?: string[];
  onClose: () => void;
}

function referenceGroup(category: string): string {
  if (category.startsWith("Question Bank")) return "Question Bank";
  if (/formula/i.test(category)) return "Formula Desk";
  if (/calculator|BA II/i.test(category)) return "Calculator";
  if (/repair/i.test(category)) return "Repair Engine";
  if (/workflow/i.test(category)) return "Workflows";
  if (/evidence/i.test(category)) return "Evidence";
  if (/index|integrity/i.test(category)) return "Fast Find";
  return "Reference";
}

export function ReferenceDrawer({
  open,
  references,
  activeReferenceIds = [],
  onClose,
}: ReferenceDrawerProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () => ["All", ...new Set(references.map(item => referenceGroup(item.category)))],
    [references],
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const ordered = [...references].sort((left, right) => {
      const leftActive = activeReferenceIds.includes(left.id) ? 1 : 0;
      const rightActive = activeReferenceIds.includes(right.id) ? 1 : 0;
      return rightActive - leftActive || left.title.localeCompare(right.title);
    });
    return ordered.filter(reference => {
      const groupMatch = group === "All" || referenceGroup(reference.category) === group;
      const queryMatch =
        !normalized ||
        [
          reference.id,
          reference.title,
          reference.category,
          reference.summary ?? "",
          ...(reference.tags ?? []),
          ...reference.content,
          ...(reference.formulae ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return groupMatch && queryMatch;
    });
  }, [activeReferenceIds, group, query, references]);

  if (!open) return null;

  return (
    <div className="ls-drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="ls-reference-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ls-reference-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="ls-eyebrow">Private knowledge system</p>
            <h2 id="ls-reference-title">Knowledge desk</h2>
          </div>
          <button className="ls-icon-button" type="button" onClick={onClose} aria-label="Close reference drawer">
            <X size={20} />
          </button>
        </header>
        <label className="ls-reference-search">
          <Search size={17} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Find a concept, formula, repair, or question ID"
            onChange={event => setQuery(event.target.value)}
          />
          <kbd>F</kbd>
        </label>
        <div className="ls-reference-groups" role="group" aria-label="Reference category">
          {groups.map(item => (
            <button
              type="button"
              className={group === item ? "is-selected" : ""}
              aria-pressed={group === item}
              key={item}
              onClick={() => setGroup(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="ls-reference-count">
          {filtered.length} {filtered.length === 1 ? "reference" : "references"}
        </p>
        <div className="ls-reference-list">
          {filtered.map(reference => (
            <details
              className={activeReferenceIds.includes(reference.id) ? "is-active" : ""}
              key={reference.id}
              open={activeReferenceIds.includes(reference.id)}
            >
              <summary>
                <span className="ls-reference-icon"><BookOpenCheck size={17} /></span>
                <span><small>{reference.category} · {reference.id}</small><strong>{reference.title}</strong></span>
              </summary>
              <div className="ls-reference-body">
                {reference.summary && <p className="ls-reference-summary">{reference.summary}</p>}
                {reference.formulae?.map(formula => <code key={formula}>{formula}</code>)}
                {reference.content.length === 1 ? (
                  <p>{reference.content[0]}</p>
                ) : (
                  <ul>{reference.content.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                )}
              </div>
            </details>
          ))}
          {!filtered.length && (
            <div className="ls-reference-empty">
              <Search size={22} />
              <strong>No knowledge item found</strong>
              <p>Try a shorter concept name, choose All, or enter a question ID.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
