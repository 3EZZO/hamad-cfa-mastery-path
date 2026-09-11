import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const dialogStack: HTMLElement[] = [];

export function isElementAvailable(element: HTMLElement): boolean {
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (node.tagName === "DETAILS" && !node.hasAttribute("open")) {
      const summary = node.querySelector(":scope > summary");
      if (!summary?.contains(element)) return false;
    }
  }
  return true;
}

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    element => element.tabIndex >= 0 && !element.matches(":disabled") && isElementAvailable(element),
  );
}

/**
 * Keeps keyboard focus inside a modal and returns it to the control that
 * launched the modal. The close callback is held in a ref so timer-driven
 * parent renders do not reset focus while the dialog is open.
 */
export function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialogStack.push(dialog);
    const focusFirst = () => {
      const initial = initialFocusRef.current;
      (initial && isElementAvailable(initial) ? initial : focusableElements(dialog)[0] ?? dialog).focus();
    };
    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const containFocus = (event: FocusEvent) => {
      if (dialogStack.at(-1) === dialog && !dialog.contains(event.target as Node)) focusFirst();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", containFocus, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", containFocus, true);
      const wasTop = dialogStack.at(-1) === dialog;
      const index = dialogStack.lastIndexOf(dialog);
      if (index >= 0) dialogStack.splice(index, 1);
      const top = dialogStack.at(-1);
      if (wasTop && trigger?.isConnected && isElementAvailable(trigger) && (!top || top.contains(trigger))) trigger.focus();
      else if (wasTop && top) (focusableElements(top)[0] ?? top).focus();
    };
  }, [dialogRef, initialFocusRef, open]);
}
