import { ArrowRight, BellRing, CalendarDays, ClipboardCheck, LibraryBig, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate } from "../../lib/dates";
import { summarizePayments, type ConsoleGlance, type TutorSection } from "../../lib/tutorConsole";
import type { TutorConsoleData } from "../../hooks/useTutorConsole";
import "./tutorConsole.css";

function Tile({ icon: Icon, title, children, action, onAction, tone }: {
  icon: typeof Wallet;
  title: string;
  children: ReactNode;
  action: string;
  onAction: () => void;
  tone?: "attention" | "good";
}) {
  return (
    <article className={`coach-tile${tone ? ` is-${tone}` : ""}`}>
      <header><Icon size={18} aria-hidden="true" /><h4>{title}</h4></header>
      <div className="coach-tile__body">{children}</div>
      <button type="button" className="coach-tile__action" onClick={onAction}>{action}<ArrowRight size={15} aria-hidden="true" /></button>
    </article>
  );
}

/** The console's front page: what stands where, one tap from each section. */
export function TutorOverview({
  glance,
  data,
  nextSession,
  today,
  onSection,
  onOpenPayments,
  brief,
}: {
  glance: ConsoleGlance;
  data: TutorConsoleData;
  nextSession: { number: number; date: string; title: string } | null;
  today: Date;
  onSection: (section: TutorSection) => void;
  onOpenPayments?: () => void;
  brief: ReactNode;
}) {
  const { tests, practice, reminders, approvals } = glance;
  const payments = data.payments?.config ? summarizePayments(data.payments.config, data.payments.records, today) : null;
  const loading = data.loading;
  return (
    <div className="view-stack">
      <section className="coach-glance" aria-label="At a glance">
        <Tile
          icon={ClipboardCheck}
          title="Module tests"
          action="Open tests"
          onAction={() => onSection("tests")}
          tone={tests.drafts + tests.toRelease + tests.toGrade > 0 ? "attention" : undefined}
        >
          {loading ? <p>Loading…</p> : (
            <>
              <p><strong>{tests.published}</strong> published{tests.drafts ? ` · ${tests.drafts} ${tests.drafts === 1 ? "draft" : "drafts"}` : ""}</p>
              <p>Hamad has finished <strong>{tests.done}</strong></p>
              {tests.toRelease > 0 && <p className="is-attention">{tests.toRelease} {tests.toRelease === 1 ? "review" : "reviews"} to release</p>}
              {tests.toGrade > 0 && <p className="is-attention">{tests.toGrade} to grade</p>}
            </>
          )}
        </Tile>
        <Tile icon={BellRing} title="Reminders" action="Open reminders" onAction={() => onSection("tests")}>
          {loading ? <p>Loading…</p> : (
            <>
              <p><strong>{reminders.active}</strong> active</p>
              <p>{reminders.unacknowledged ? `${reminders.unacknowledged} not yet acknowledged` : "All acknowledged"}</p>
            </>
          )}
        </Tile>
        <Tile icon={LibraryBig} title="Practice" action="Open practice" onAction={() => onSection("practice")}>
          {loading ? <p>Loading…</p> : (
            <>
              <p><strong>{practice.unlocked}</strong> of {practice.banks} banks unlocked</p>
              <p>{practice.questions} questions published</p>
            </>
          )}
        </Tile>
        <Tile
          icon={CalendarDays}
          title="Sessions"
          action="Open sessions"
          onAction={() => onSection("sessions")}
          tone={approvals > 0 ? "attention" : undefined}
        >
          {nextSession
            ? <p>Next: <strong>Session {String(nextSession.number).padStart(2, "0")}</strong> · {formatDate(nextSession.date, { weekday: "short", day: "numeric", month: "short" })}</p>
            : <p>No sessions left in the plan</p>}
          <p className={approvals ? "is-attention" : undefined}>{approvals ? `${approvals} completion ${approvals === 1 ? "request" : "requests"} to approve` : "No approvals waiting"}</p>
        </Tile>
        <Tile
          icon={Wallet}
          title="Payments"
          action="Open payments"
          onAction={() => onOpenPayments?.()}
          tone={payments?.state === "overdue" ? "attention" : payments?.state === "paid" ? "good" : undefined}
        >
          {loading ? <p>Loading…</p> : !payments ? <p>Payments are not set up yet.</p> : (
            <>
              <p><strong>{payments.currency} {payments.paidThisMonth.toLocaleString()}</strong> of {payments.monthlyAmount.toLocaleString()} paid this month</p>
              <p className={payments.outstandingCount ? "is-attention" : undefined}>
                {payments.outstandingCount
                  ? `${payments.outstandingCount} open (${payments.currency} ${payments.outstanding.toLocaleString()})${payments.overdueCount ? `, ${payments.overdueCount} overdue` : ""}`
                  : "Nothing outstanding"}
              </p>
              <p>Next due {formatDate(payments.nextDue, { day: "numeric", month: "short" })}</p>
            </>
          )}
        </Tile>
      </section>
      {brief}
    </div>
  );
}
