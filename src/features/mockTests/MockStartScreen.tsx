import { CircleAlert, Maximize } from "lucide-react";
import { useState } from "react";
import { formatMockClock } from "../../lib/mockTestContent";

/**
 * Which attempt Start uses: a paper's only attempt, or a module test's first
 * attempt (answers shown on submit) or final attempt (the score that counts).
 */
export type StartAttempt = "only" | "first" | "final";

const ATTEMPT_RULE: Record<StartAttempt, { rule: [string, string]; ack: string }> = {
  only: {
    rule: ["One attempt.", "Pressing Start uses it. You cannot restart or retake the test."],
    ack: "I understand this is my only attempt and that leaving forfeits it.",
  },
  first: {
    rule: ["Two attempts: learn, then final.", "When you submit this first attempt you see every answer and explanation. Then you take a final attempt on the same questions; the final score is the one that counts."],
    ack: "I understand that pressing Start uses my first attempt and that leaving forfeits it.",
  },
  final: {
    rule: ["Final attempt.", "The same questions as your first try. This score counts as your final score, and there is no further attempt."],
    ack: "I understand this is my final attempt and that leaving forfeits it.",
  },
};

/** The rules screen before a module test or a full paper. */
export function StartScreen({
  eyebrow,
  title,
  questionCount,
  durationMs,
  busy,
  error,
  onCancel,
  onStart,
  attempt = "only",
}: {
  eyebrow: string;
  title: string;
  questionCount: number;
  durationMs: number;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onStart: () => void;
  attempt?: StartAttempt;
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
          <li><strong>{ATTEMPT_RULE[attempt].rule[0]}</strong> {ATTEMPT_RULE[attempt].rule[1]}</li>
          <li><strong>Full screen.</strong> Leaving full screen or switching apps is recorded for your tutor.</li>
          <li><strong>Leave Test forfeits.</strong> Closing the page does not stop the clock; at 00:00 your selected answers are submitted.</li>
          <li><strong>Tools.</strong> Flag questions, move freely between them, and use the BA II Plus calculator.</li>
        </ul>
        <label className="mock-start__ack">
          <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
          {ATTEMPT_RULE[attempt].ack}
        </label>
        {error && <p className="mock-hub__error" role="alert"><CircleAlert size={16} />{error}</p>}
        <div className="mock-start__actions">
          <button type="button" className="mock-button mock-button--ghost" onClick={onCancel} disabled={busy}>Not now</button>
          <button type="button" className="mock-button mock-button--start" onClick={onStart} disabled={!acknowledged || busy}>
            <Maximize size={18} />{busy ? "Starting…" : attempt === "final" ? "Start final attempt" : "Start Test"}
          </button>
        </div>
      </div>
    </section>
  );
}
