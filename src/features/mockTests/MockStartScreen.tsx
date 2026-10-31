import { CircleAlert, Maximize } from "lucide-react";
import { useState } from "react";
import { formatMockClock } from "../../lib/mockTestContent";

/** The rules screen before a module test or a full paper; Start uses the only attempt. */
export function StartScreen({
  eyebrow,
  title,
  questionCount,
  durationMs,
  busy,
  error,
  onCancel,
  onStart,
}: {
  eyebrow: string;
  title: string;
  questionCount: number;
  durationMs: number;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onStart: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const clock = formatMockClock(durationMs);
  const minutes = Math.round(durationMs / 60_000);
  return (
    <section className="mock-start" aria-labelledby="mock-start-title">
      <div className="mock-start__card">
        <p className="mock-start__eyebrow">{eyebrow}</p>
        <h2 id="mock-start-title">{title}</h2>
        <div className="mock-start__clock" aria-hidden="true">{clock}</div>
        <ul className="mock-start__rules">
          <li><strong>{questionCount} questions, {minutes} minutes.</strong> About 90 seconds each. The clock runs on the server and does not pause.</li>
          <li><strong>One attempt.</strong> Pressing Start uses it. You cannot restart or retake the test.</li>
          <li><strong>Full screen.</strong> Leaving full screen or switching apps is recorded for your tutor.</li>
          <li><strong>Leave Test forfeits.</strong> Closing the page does not stop the clock; at 00:00 your selected answers are submitted.</li>
          <li><strong>Tools.</strong> Flag questions, move freely between them, and use the BA II Plus calculator.</li>
        </ul>
        <label className="mock-start__ack">
          <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
          I understand this is my only attempt and that leaving forfeits it.
        </label>
        {error && <p className="mock-hub__error" role="alert"><CircleAlert size={16} />{error}</p>}
        <div className="mock-start__actions">
          <button type="button" className="mock-button mock-button--ghost" onClick={onCancel} disabled={busy}>Not now</button>
          <button type="button" className="mock-button mock-button--start" onClick={onStart} disabled={!acknowledged || busy}>
            <Maximize size={18} />{busy ? "Starting…" : "Start Test"}
          </button>
        </div>
      </div>
    </section>
  );
}
