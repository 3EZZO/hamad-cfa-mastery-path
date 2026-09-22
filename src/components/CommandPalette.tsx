import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useDialogFocus } from "../features/liveSession/useDialogFocus";
import { filterCommands, type PaletteCommand } from "../lib/commandPalette";

interface CommandPaletteProps {
  open: boolean;
  commands: readonly PaletteCommand[];
  onClose: () => void;
}

const optionId = (id: string) => `command-option-${id}`;

/**
 * Ctrl/⌘+K palette: type to filter tabs and actions, arrow keys to choose,
 * Enter to run. Focus trapping, Escape and focus restoration come from
 * useDialogFocus; the input is the initial focus target.
 */
export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterCommands(query, commands), [commands, query]);
  const active = results[Math.min(activeIndex, Math.max(results.length - 1, 0))];

  useDialogFocus(open, dialogRef, inputRef, onClose);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    document.getElementById(optionId(active.id))?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const run = (command: PaletteCommand) => {
    onClose();
    command.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    const last = results.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(index => (index >= last ? 0 : index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(index => (index <= 0 ? last : index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(last);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      run(active);
    }
  };

  let lastGroup: string | null = null;

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="command-palette__search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={active ? optionId(active.id) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Go to a section or run an action…"
            value={query}
            onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={onKeyDown}
          />
          <kbd>Esc</kbd>
        </div>
        <p className="visually-hidden" aria-live="polite">
          {results.length === 1 ? "1 result" : `${results.length} results`}
        </p>
        <ul id="command-palette-results" className="command-palette__results" role="listbox" aria-label="Commands">
          {results.length === 0 && (
            <li className="command-palette__empty" role="presentation">No matches. Try a section name or an action.</li>
          )}
          {results.map((command, index) => {
            const heading = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            const Icon = command.icon;
            const selected = command === active;
            return (
              <li key={command.id} role="presentation">
                {heading && <div className="command-palette__group" role="presentation">{heading}</div>}
                <button
                  type="button"
                  id={optionId(command.id)}
                  role="option"
                  aria-selected={selected}
                  className={`command-palette__option${selected ? " is-active" : ""}`}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(command)}
                >
                  <span className="command-palette__icon" aria-hidden="true">{Icon ? <Icon size={17} /> : null}</span>
                  <span className="command-palette__text">
                    <strong>{command.label}</strong>
                    {command.hint && <small>{command.hint}</small>}
                  </span>
                  {command.shortcut && <kbd>{command.shortcut}</kbd>}
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="command-palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> choose</span>
          <span><kbd>Enter</kbd> run</span>
          <span><kbd>Alt</kbd>+<kbd>1–9</kbd> switch section</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> open</span>
        </footer>
      </section>
    </div>
  );
}
