import { useSyncExternalStore } from "react";

/**
 * Whether the app is in the middle of something an update must not
 * interrupt: a live or rehearsed session, a practice run, or a module mock
 * test. Feature code sets it; the update toast reads it. Module-level so the
 * toast, which is mounted beside <App/>, needs no prop drilling.
 */
export type ShellBusyReason = "session" | "practice" | "mock";

let reason: ShellBusyReason | null = null;
const listeners = new Set<() => void>();

export function setShellBusy(next: ShellBusyReason | null): void {
  if (reason === next) return;
  reason = next;
  listeners.forEach((listener) => listener());
}

export function getShellBusy(): ShellBusyReason | null {
  return reason;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useShellBusy(): ShellBusyReason | null {
  return useSyncExternalStore(subscribe, getShellBusy, () => null);
}
