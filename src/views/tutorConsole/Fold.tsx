import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from "react";
import {
  foldIdsAround,
  isFoldOpen,
  loadFoldMemory,
  saveFoldMemory,
  withFold,
  withFoldsOpen,
  withSection,
  type FoldMemory,
} from "../../lib/foldMemory";
import "./tutorConsole.css";

/**
 * Collapsible blocks for Tutor Admin. Inside a `FoldProvider` the open state
 * is remembered per device and the section toolbar can collapse or expand
 * everything; without one (e.g. a panel rendered alone) each fold keeps its
 * own state. `reveal(id)` opens every fold around an element, then scrolls to it.
 */

interface FoldStore {
  isOpen: (id: string, defaultOpen: boolean) => boolean;
  setOpen: (id: string, open: boolean) => void;
  setSection: (section: string, open: boolean) => void;
  openFolds: (ids: string[]) => void;
}

const FoldContext = createContext<FoldStore | null>(null);

export function FoldProvider({ children }: { children: ReactNode }) {
  const [memory, setMemory] = useState<FoldMemory>(loadFoldMemory);
  const update = useCallback((change: (current: FoldMemory) => FoldMemory) => {
    setMemory((current) => {
      const next = change(current);
      saveFoldMemory(next);
      return next;
    });
  }, []);
  const store = useMemo<FoldStore>(() => ({
    isOpen: (id, defaultOpen) => isFoldOpen(memory, id, defaultOpen),
    setOpen: (id, open) => update((current) => withFold(current, id, open)),
    setSection: (section, open) => update((current) => withSection(current, section, open)),
    openFolds: (ids) => update((current) => withFoldsOpen(current, ids)),
  }), [memory, update]);
  return <FoldContext.Provider value={store}>{children}</FoldContext.Provider>;
}

/** Opens every fold around an element (so a jump never lands on hidden content). */
export function useOpenFoldsAround(): (target: Element) => void {
  const store = useContext(FoldContext);
  const openFolds = store?.openFolds;
  return useCallback((target) => {
    const ids = foldIdsAround(target);
    if (ids.length && openFolds) openFolds(ids);
  }, [openFolds]);
}

/** Open the folds around an element, then scroll it into view. */
export function useReveal(): (elementId: string, block?: ScrollLogicalPosition) => void {
  const openAround = useOpenFoldsAround();
  return useCallback((elementId, block = "start") => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(elementId);
    if (!target) return;
    openAround(target);
    window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block }), 30);
  }, [openAround]);
}

/** A collapsible panel (`variant="panel"`) or sub-section (`"sub"`). */
export function Fold({
  id,
  title,
  eyebrow,
  icon,
  meta,
  aside,
  summary,
  anchorId,
  className,
  variant = "panel",
  defaultOpen = true,
  children,
}: {
  /** `<section>:<name>`; the section part drives Collapse all. */
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  /** Always shown under the title (e.g. counts). */
  meta?: ReactNode;
  /** Always shown at the end of the header (e.g. a bulk action button). */
  aside?: ReactNode;
  /** Shown under the title while the fold is closed. */
  summary?: ReactNode;
  /** DOM id for quick find and other jumps. */
  anchorId?: string;
  className?: string;
  variant?: "panel" | "sub";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { open, setOpen } = useFoldOpen(id, defaultOpen);
  const bodyId = useId();
  const Heading = variant === "panel" ? "h3" : "h4";
  return (
    <section
      id={anchorId}
      data-fold-id={id}
      className={`${variant === "panel" ? "panel coach-fold" : "coach-subfold"}${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className={variant === "panel" ? "panel-heading coach-fold__head" : "coach-fold__head"}>
        <div className="coach-fold__titles">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <Heading>
            <button type="button" className="coach-fold__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
              <span>{title}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
          </Heading>
          {meta && <p className="coach-fold__meta">{meta}</p>}
          {!open && summary && <p className="coach-fold__summary">{summary}</p>}
        </div>
        {aside}
        {icon}
      </div>
      <div id={bodyId} className="coach-fold__body" hidden={!open}>{children}</div>
    </section>
  );
}

/** Collapse all / Expand all for one Tutor Admin section. */
export function FoldToolbar({ section }: { section: string }) {
  const store = useContext(FoldContext);
  if (!store) return null;
  return (
    <div className="coach-fold-toolbar" role="group" aria-label="Show or hide every block in this section">
      <button type="button" className="coach-chip" onClick={() => store.setSection(section, false)}><ChevronsDownUp size={15} aria-hidden="true" /> Collapse all</button>
      <button type="button" className="coach-chip" onClick={() => store.setSection(section, true)}><ChevronsUpDown size={15} aria-hidden="true" /> Expand all</button>
    </div>
  );
}

/** Controlled open state for a fold rendered by another component (e.g. a `<details>`). */
export function useFoldOpen(id: string, defaultOpen = true): { open: boolean; setOpen: (open: boolean) => void } {
  const store = useContext(FoldContext);
  const [local, setLocal] = useState(defaultOpen);
  const open = store ? store.isOpen(id, defaultOpen) : local;
  const setOpen = (next: boolean) => {
    if (next === open) return;
    if (store) store.setOpen(id, next); else setLocal(next);
  };
  return { open, setOpen };
}
