import { GripHorizontal, MoveDiagonal2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import {
  clampRect, defaultRect, PANEL_BASE_WIDTH, readPanelRect, writePanelRect, type PanelRect, type Viewport,
} from "./floatingPanelModel";
import "./floatingCalculator.css";

const MOVE_STEP = 24;
const RESIZE_STEP = 20;
const COMPACT_QUERY = "(max-width: 700px)";

function viewportSize(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(COMPACT_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia?.(COMPACT_QUERY);
    if (!query) return;
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}

/**
 * The BA II Plus in a window that can be dragged by its title bar and resized
 * from its corner (both also with arrow keys). The calculator scales as a
 * whole, so it stays legible at any size. Position and size are remembered on
 * this device per `storageKey`. On narrow screens it is a plain bottom panel.
 */
export function FloatingCalculator({ storageKey, title = "BA II Plus", onClose, children, bodyRef, closeRef, className = "" }: {
  storageKey: string;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** Receives the calculator body, e.g. to scope its keyboard input. */
  bodyRef?: RefObject<HTMLDivElement | null>;
  /** Optional initial focus target for the surrounding workspace. */
  closeRef?: RefObject<HTMLButtonElement | null>;
  /** Extra class, e.g. to set --fcalc-z for the surrounding layers. */
  className?: string;
}) {
  const compact = useCompact();
  const panelRef = useRef<HTMLDivElement>(null);
  // `desired` is where the tutor put it (remembered); what is shown is that
  // place clamped to the current window, so a brief window change (entering
  // full screen) never moves the remembered position.
  const [desired, setDesired] = useState<PanelRect | null>(() => readPanelRect(storageKey));
  const [viewport, setViewport] = useState<Viewport>(viewportSize);
  const [panelHeight, setPanelHeight] = useState(480);
  const rect = desired ? clampRect(desired, panelHeight, viewport) : null;
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; origin: PanelRect } | null>(null);

  const commit = useCallback((next: PanelRect, save = true) => {
    const clamped = clampRect(next, panelRef.current?.offsetHeight ?? 480, viewportSize());
    rectRef.current = clamped;
    setDesired(clamped);
    if (save) writePanelRect(storageKey, clamped);
  }, [storageKey]);

  // First placement (measured hidden at the base width) and the shown height.
  useLayoutEffect(() => {
    if (compact) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.offsetHeight !== panelHeight) setPanelHeight(panel.offsetHeight);
    if (!desired) {
      const bar = panel.querySelector<HTMLElement>(".fcalc__bar")?.offsetHeight ?? 0;
      setDesired(defaultRect(viewportSize(), panel.offsetHeight, bar));
    }
  }, [compact, desired, panelHeight, viewport]);
  useEffect(() => {
    const onResize = () => setViewport(viewportSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const start = (mode: "move" | "resize") => (event: PointerEvent<HTMLElement>) => {
    if (!rect || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button") && mode === "move" && !(event.target as HTMLElement).closest(".fcalc__grip")) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, origin: rect };
    // No accidental text selection on the page while dragging.
    document.documentElement.classList.add("fcalc-dragging");
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    commit(drag.mode === "move"
      ? { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy }
      : { ...drag.origin, width: drag.origin.width + dx }, false);
  };
  const end = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.documentElement.classList.remove("fcalc-dragging");
    if (rectRef.current) writePanelRect(storageKey, rectRef.current);
  };

  const moveKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!rect) return;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    commit({ ...rect, x: rect.x + delta[0]! * MOVE_STEP, y: rect.y + delta[1]! * MOVE_STEP });
  };
  const resizeKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!rect) return;
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    commit({ ...rect, width: rect.width + delta * RESIZE_STEP });
  };

  if (compact) {
    return (
      <section className={`fcalc fcalc--compact ${className}`} aria-label={`${title} calculator`}>
        <div className="fcalc__bar">
          <strong>{title}</strong>
          <button type="button" ref={closeRef} className="fcalc__icon" aria-label="Close calculator" onClick={onClose}
            onKeyDown={event => { if (event.key === "Enter") event.stopPropagation(); }}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="fcalc__body" ref={bodyRef} tabIndex={-1}>{children}</div>
      </section>
    );
  }

  const scale = rect ? rect.width / PANEL_BASE_WIDTH : 1;
  return (
    <section
      ref={panelRef}
      className={`fcalc ${className}`}
      aria-label={`${title} calculator`}
      // Unplaced: measured hidden at the base width, then placed.
      style={rect ? { left: rect.x, top: rect.y, width: rect.width } : { visibility: "hidden", left: 0, top: 0, width: PANEL_BASE_WIDTH, maxHeight: "none" }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="fcalc__bar" onPointerDown={start("move")}>
        <button type="button" className="fcalc__grip fcalc__icon" aria-label="Move calculator: drag, or use the arrow keys" title="Drag to move" onKeyDown={moveKeys}>
          <GripHorizontal size={18} aria-hidden="true" />
        </button>
        <strong>{title}</strong>
        <button type="button" ref={closeRef} className="fcalc__icon" aria-label="Close calculator" onClick={onClose}
          // Enter closes here instead of reaching the calculator as "=".
          onKeyDown={event => { if (event.key === "Enter") event.stopPropagation(); }}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="fcalc__body" ref={bodyRef} tabIndex={-1} style={{ zoom: scale }}>{children}</div>
      <button type="button" className="fcalc__resize" aria-label="Resize calculator: drag, or use the arrow keys" title="Drag to resize"
        onPointerDown={start("resize")} onKeyDown={resizeKeys}>
        <MoveDiagonal2 size={16} aria-hidden="true" />
      </button>
    </section>
  );
}
