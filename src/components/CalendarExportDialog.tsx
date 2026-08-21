import { CalendarPlus, Clock3, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  loadCalendarExportPreferences,
  saveCalendarExportPreferences,
  type CalendarExportPreferences,
} from "../lib/calendarExport";

export interface CalendarExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (preferences: CalendarExportPreferences) => void;
}

const REMINDER_OPTIONS = [
  { value: 0, label: "At start time" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1_440, label: "1 day before" },
] as const;

const MILESTONE_REMINDER_OPTIONS = [
  { value: 0, label: "On the deadline" },
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "7 days before" },
  { value: 14, label: "14 days before" },
] as const;

export default function CalendarExportDialog({
  open,
  onClose,
  onExport,
}: CalendarExportDialogProps) {
  const [preferences, setPreferences] = useState<CalendarExportPreferences>(
    loadCalendarExportPreferences,
  );
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setPreferences(loadCalendarExportPreferences());
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const saved = saveCalendarExportPreferences(preferences);
    onExport(saved);
    onClose();
  };

  return (
    <div className="calendar-dialog-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="calendar-export-title"
        aria-modal="true"
        className="calendar-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="calendar-dialog-header">
          <span className="calendar-dialog-mark"><CalendarPlus size={22} /></span>
          <div>
            <p className="eyebrow">Calendar import settings</p>
            <h2 id="calendar-export-title">Confirm the weekly checkpoint</h2>
          </div>
          <button
            aria-label="Close calendar settings"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <p className="calendar-dialog-intro">
          The plan uses one weekly checkpoint every Saturday at 09:00 Riyadh
          time. Choose the reminder settings before creating the calendar
          import file. Reminder preferences stay only in this browser.
        </p>

        <form className="calendar-dialog-form" onSubmit={submit}>
          <fieldset>
            <legend><Clock3 size={15} /> Weekly checkpoint time</legend>
            <div className="calendar-time-grid">
              <label>
                <span>Saturday checkpoint · Asia/Riyadh</span>
                <input
                  ref={firstFieldRef}
                  aria-readonly="true"
                  readOnly
                  type="time"
                  value={preferences.saturdayTime}
                />
              </label>
            </div>
          </fieldset>

          <div className="calendar-reminder-grid">
            <label>
              <span>Session reminder</span>
              <select
                value={preferences.sessionReminderMinutes}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    sessionReminderMinutes: Number(event.target.value),
                  }))
                }
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Deadline reminder</span>
              <select
                value={preferences.milestoneReminderDays}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    milestoneReminderDays: Number(event.target.value),
                  }))
                }
              >
                {MILESTONE_REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <aside className="calendar-dialog-note">
            This creates a <strong>calendar import file</strong>, not email
            invitations. Session end times are calculated from each planned
            duration; important deadlines remain all-day reminders.
          </aside>

          <footer className="calendar-dialog-actions">
            <button className="button button-secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="button button-primary" type="submit">
              <CalendarPlus size={16} /> Download calendar import
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
