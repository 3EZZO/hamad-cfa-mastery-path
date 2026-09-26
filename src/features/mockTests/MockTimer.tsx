import { MOCK_DURATION_MS, MOCK_URGENT_MS, formatMockClock } from "../../lib/mockTestContent";

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The exam clock: large, always visible, urgent for the final five minutes. */
export function MockTimer({ remainingMs }: { remainingMs: number }) {
  const urgent = remainingMs <= MOCK_URGENT_MS;
  const final = remainingMs <= 60_000;
  const fraction = Math.max(0, Math.min(1, remainingMs / MOCK_DURATION_MS));
  const label = formatMockClock(remainingMs);
  const minutesLeft = Math.ceil(remainingMs / 60_000);
  return (
    <div
      className={`mock-timer${urgent ? " is-urgent" : ""}${final ? " is-final" : ""}`}
      role="timer"
      aria-label={`${label} remaining`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="mock-timer__track" cx="32" cy="32" r={RADIUS} />
        <circle
          className="mock-timer__arc"
          cx="32"
          cy="32"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <span className="mock-timer__digits">{label}</span>
      {/* Screen readers hear a calm update each minute, not every second. */}
      <span className="visually-hidden" aria-live="polite">
        {urgent ? `${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"} remaining` : ""}
      </span>
    </div>
  );
}
