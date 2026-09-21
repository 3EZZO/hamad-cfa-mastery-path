import { Component, type ErrorInfo, type ReactNode } from "react";
import { Download, House, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { describeError, recordError } from "../lib/errorReport";
import { downloadBackup, loadState } from "../lib/storage";

export type ErrorBoundaryVariant = "app" | "view" | "session";

interface ErrorBoundaryProps {
  /** Label stored with the diagnostics entry, e.g. "view:practice". */
  scope: string;
  /** Presentation of the recovery screen. Defaults to a view-level panel. */
  variant?: ErrorBoundaryVariant;
  /**
   * When this value changes the boundary clears its error and renders its
   * children again, so navigating to another tab recovers automatically.
   */
  resetKey?: unknown;
  /** Called after "Try again" or an automatic reset. */
  onReset?: () => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: { message: string } | null;
}

const COPY: Record<ErrorBoundaryVariant, { eyebrow: string; title: string; body: string }> = {
  app: {
    eyebrow: "Something went wrong",
    title: "The tracker hit an unexpected error",
    body: "Your saved progress is safe on this device and in the cloud. Reload to continue; download a backup first if you want an extra copy.",
  },
  view: {
    eyebrow: "Something went wrong",
    title: "This view could not be shown",
    body: "The rest of the tracker still works. Try again, go back to Home, or reload the app. Your saved progress is unaffected.",
  },
  session: {
    eyebrow: "Session Mode interrupted",
    title: "The classroom view hit an unexpected error",
    body: "The live run is journaled locally and in the cloud. Try again to reopen Session Mode at the recorded position, or return to Home.",
  },
};

function goHome(onRetry?: () => void) {
  // Changing the hash lets the shell switch tab (and reset a view boundary
  // through its resetKey); when Home itself failed the hash is unchanged, so
  // reset explicitly as well.
  window.location.hash = "dashboard";
  onRetry?.();
}

function reload() {
  window.location.reload();
}

function saveBackup() {
  downloadBackup(loadState());
}

export function ErrorRecovery({
  variant,
  message,
  onRetry,
}: {
  variant: ErrorBoundaryVariant;
  message: string;
  onRetry?: () => void;
}) {
  const copy = COPY[variant];
  return (
    <section
      className={`error-recovery error-recovery--${variant}`}
      role="alert"
      aria-labelledby="error-recovery-title"
    >
      <span className="error-recovery__icon" aria-hidden="true"><TriangleAlert size={24} /></span>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="error-recovery-title">{copy.title}</h2>
      <p className="error-recovery__body">{copy.body}</p>
      <p className="error-recovery__detail">
        <span>Details</span>
        <code>{message}</code>
      </p>
      <div className="error-recovery__actions">
        {onRetry && variant !== "app" && (
          <button className="button button-primary" type="button" onClick={onRetry}>
            <RotateCcw size={16} /> Try again
          </button>
        )}
        {variant !== "app" && (
          <button className="button button-secondary" type="button" onClick={() => goHome(onRetry)}>
            <House size={16} /> Back to Home
          </button>
        )}
        <button
          className={variant === "app" ? "button button-primary" : "button button-secondary"}
          type="button"
          onClick={reload}
        >
          <RefreshCw size={16} /> Reload
        </button>
        <button className="button button-secondary" type="button" onClick={saveBackup}>
          <Download size={16} /> Download backup
        </button>
      </div>
    </section>
  );
}

/**
 * Catches render errors below it, records them in the local diagnostics log
 * and shows a recovery panel instead of a blank page. Use one boundary per
 * shell tier: the app root, each tracker view, and Session Mode.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: { message: describeError(error).message } };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    recordError({
      source: "render",
      scope: this.props.scope,
      ...describeError(error),
      componentStack: info.componentStack ?? undefined,
    });
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorRecovery
          variant={this.props.variant ?? "view"}
          message={this.state.error.message}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
