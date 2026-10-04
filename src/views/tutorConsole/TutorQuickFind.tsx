import { CalendarDays, ClipboardCheck, LayoutGrid, LibraryBig, Search, BellRing } from "lucide-react";
import { useId, useState } from "react";
import { searchConsole, type ConsoleEntry, type ConsoleEntryKind } from "../../lib/tutorConsole";
import "./tutorConsole.css";

const KIND_ICON: Record<ConsoleEntryKind, typeof Search> = {
  section: LayoutGrid,
  test: ClipboardCheck,
  bank: LibraryBig,
  session: CalendarDays,
  reminder: BellRing,
};

/** Search across tests, practice banks, sessions, reminders and sections; picking a result jumps to it. */
export function TutorQuickFind({ entries, onPick }: { entries: readonly ConsoleEntry[]; onPick: (entry: ConsoleEntry) => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const results = searchConsole(entries, query);
  const pick = (entry: ConsoleEntry) => {
    onPick(entry);
    setQuery("");
    setCursor(0);
  };
  return (
    <div className="coach-find" role="search">
      <label className="coach-find__field">
        <Search size={17} aria-hidden="true" />
        <span className="visually-hidden">Quick find in Tutor Admin</span>
        <input
          type="search"
          value={query}
          placeholder="Quick find: a test, practice bank, session or reminder…"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results.length ? `${listId}-${cursor}` : undefined}
          onChange={(event) => { setQuery(event.target.value); setCursor(0); }}
          onKeyDown={(event) => {
            if (!results.length) return;
            if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => (value + 1) % results.length); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => (value - 1 + results.length) % results.length); }
            else if (event.key === "Enter") { event.preventDefault(); pick(results[Math.min(cursor, results.length - 1)]!); }
            else if (event.key === "Escape") setQuery("");
          }}
        />
      </label>
      {results.length > 0 && (
        <ul className="coach-find__results" id={listId} role="listbox" aria-label="Quick find results">
          {results.map((entry, index) => {
            const Icon = KIND_ICON[entry.kind];
            return (
              <li key={entry.id} id={`${listId}-${index}`} role="option" aria-selected={index === cursor}>
                <button type="button" className={index === cursor ? "is-active" : ""} onMouseEnter={() => setCursor(index)} onClick={() => pick(entry)}>
                  <Icon size={16} aria-hidden="true" />
                  <span><strong>{entry.label}</strong><small>{entry.detail}</small></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
