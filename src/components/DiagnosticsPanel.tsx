import { useState } from "react";
import { Bug, Trash2 } from "lucide-react";
import { clearErrorLog, readErrorLog, type ErrorLogEntry } from "../lib/errorReport";

const SOURCE_LABEL: Record<ErrorLogEntry["source"], string> = {
  render: "Render error",
  window: "Uncaught error",
  promise: "Unhandled promise",
};

/**
 * Tutor-facing list of the errors recorded on this device (see
 * lib/errorReport.ts). Read on open so the list is current without a
 * subscription; nothing here leaves the browser.
 */
export function DiagnosticsPanel() {
  const [entries, setEntries] = useState<ErrorLogEntry[]>(() => readErrorLog());
  const refresh = () => setEntries(readErrorLog());
  const clear = () => {
    clearErrorLog();
    setEntries([]);
  };

  return (
    <details className="tracker-secondary-tools" onToggle={refresh}>
      <summary>
        <Bug size={16} aria-hidden="true" /> Diagnostics
        <small>{entries.length ? `${entries.length} recorded on this device` : "No errors recorded on this device"}</small>
      </summary>
      <div className="tracker-secondary-tools__content">
        <p className="error-recovery__body" style={{ margin: 0 }}>
          Errors caught by the tracker are kept locally (last 20) so they can be
          reported and fixed. They contain the message and code location only,
          never study data.
        </p>
        {entries.length ? (
          <ul className="diagnostics-list">
            {entries.map((entry) => (
              <li key={`${entry.at}-${entry.scope}`}>
                <small>
                  {new Date(entry.at).toLocaleString()} · {SOURCE_LABEL[entry.source] ?? entry.source} · {entry.scope}
                </small>
                <code>{entry.message}</code>
              </li>
            ))}
          </ul>
        ) : null}
        {entries.length ? (
          <div className="inline-actions">
            <button className="button button-secondary" type="button" onClick={clear}>
              <Trash2 size={16} /> Clear diagnostics
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}
