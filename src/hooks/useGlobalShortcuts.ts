import { useEffect, useRef } from "react";

interface GlobalShortcutOptions {
  /** Ctrl/⌘+K anywhere, or "?" outside text fields. */
  onTogglePalette: () => void;
  /** Alt+1…9 → the Nth entry; omit (or pass []) to disable. */
  tabs?: readonly (() => void)[];
  /** True while the palette itself is open, so Ctrl+K can close it. */
  paletteOpen?: boolean;
  /** "?" opens the palette; off inside Session Mode, which binds "?" itself. */
  helpKey?: boolean;
  enabled?: boolean;
}

const INTERACTIVE = "input, textarea, select, [contenteditable='true']";

function isTextTarget(target: EventTarget | null): boolean {
  return typeof HTMLElement !== "undefined"
    && target instanceof HTMLElement
    && Boolean(target.closest(INTERACTIVE));
}

function dialogHasFocus(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return typeof HTMLElement !== "undefined"
    && active instanceof HTMLElement
    && Boolean(active.closest("[role='dialog'], [role='alertdialog']"));
}

/**
 * App-wide keyboard shortcuts. Single-letter keys are deliberately not
 * registered here because Session Mode owns them; Alt+digit and Ctrl+K do
 * not collide with it or with typing.
 */
export function useGlobalShortcuts({
  onTogglePalette,
  tabs = [],
  paletteOpen = false,
  helpKey = true,
  enabled = true,
}: GlobalShortcutOptions): void {
  const latest = useRef({ onTogglePalette, tabs, paletteOpen, helpKey });
  latest.current = { onTogglePalette, tabs, paletteOpen, helpKey };

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const { onTogglePalette: toggle, tabs: entries, paletteOpen: open, helpKey: help } = latest.current;
      const otherDialogOpen = !open && dialogHasFocus();

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        if (otherDialogOpen) return;
        event.preventDefault();
        toggle();
        return;
      }
      if (open || otherDialogOpen) return;

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
        const entry = entries[Number(event.key) - 1];
        if (!entry) return;
        event.preventDefault();
        entry();
        return;
      }
      if (help && event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTextTarget(event.target)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
