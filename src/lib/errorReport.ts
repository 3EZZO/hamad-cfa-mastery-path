/**
 * Local diagnostics log.
 *
 * The tracker has no remote error service on purpose (private app, no new
 * secrets). Instead, render errors caught by an error boundary and uncaught
 * window errors/rejections are kept in a small ring buffer on this device so
 * the tutor can read them from Notes & Data when something goes wrong. Only
 * the message, a trimmed stack and the scope are stored; never tracker data.
 */

export const ERROR_LOG_KEY = "project-202-error-log-v1";
export const ERROR_LOG_LIMIT = 20;
const STACK_LIMIT = 2_000;

export type ErrorSource = "render" | "window" | "promise";

export interface ErrorLogEntry {
  at: string;
  source: ErrorSource;
  scope: string;
  message: string;
  stack?: string;
  componentStack?: string;
}

type ErrorStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): ErrorStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function trim(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.length > STACK_LIMIT ? `${value.slice(0, STACK_LIMIT)}…` : value;
}

export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: trim(error.stack) };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

export function readErrorLog(store: ErrorStorage | null = storage()): ErrorLogEntry[] {
  if (!store) return [];
  try {
    const raw = store.getItem(ERROR_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ErrorLogEntry =>
        typeof entry === "object" && entry !== null
        && typeof (entry as ErrorLogEntry).at === "string"
        && typeof (entry as ErrorLogEntry).message === "string",
    );
  } catch {
    return [];
  }
}

export function recordError(
  entry: Omit<ErrorLogEntry, "at"> & { at?: string },
  store: ErrorStorage | null = storage(),
): ErrorLogEntry {
  const record: ErrorLogEntry = {
    at: entry.at ?? new Date().toISOString(),
    source: entry.source,
    scope: entry.scope,
    message: entry.message,
    stack: trim(entry.stack),
    componentStack: trim(entry.componentStack),
  };
  if (!store) return record;
  try {
    const next = [record, ...readErrorLog(store)].slice(0, ERROR_LOG_LIMIT);
    store.setItem(ERROR_LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage may be full or blocked; the boundary still shows its recovery UI.
  }
  return record;
}

export function clearErrorLog(store: ErrorStorage | null = storage()): void {
  try {
    store?.removeItem(ERROR_LOG_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

type ErrorEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/**
 * Capture errors that never reach a React boundary (event handlers, timers,
 * rejected promises). Returns a disposer. Nothing is swallowed: the browser
 * still reports the error to the console as usual.
 */
export function installGlobalErrorCapture(
  target: ErrorEventTarget | undefined = typeof window === "undefined" ? undefined : window,
  store: ErrorStorage | null = storage(),
): () => void {
  if (!target) return () => undefined;
  const onError = (event: Event) => {
    const { message, error } = event as ErrorEvent;
    const described = describeError(error ?? message);
    recordError({ source: "window", scope: "window", ...described }, store);
  };
  const onRejection = (event: Event) => {
    const described = describeError((event as PromiseRejectionEvent).reason);
    recordError({ source: "promise", scope: "window", ...described }, store);
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
