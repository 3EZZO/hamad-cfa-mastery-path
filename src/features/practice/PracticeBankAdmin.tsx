import { BookOpenCheck, Check, CircleAlert, CloudUpload, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  listPublishedPracticeBanks,
  loadPracticeAssignment,
  publishPracticeBank,
  savePracticeAssignment,
} from "../../lib/cloud";
import { getProgramWeek } from "../../lib/dates";
import { bankAccuracy, bankModules, bankTopicGroups, coverageGaps, moduleRangeText, setTopicUnlocked } from "../../lib/practiceBankControls";
import {
  parsePracticeBankDraft,
  type PracticeRun,
  type PublishedPracticeBank,
} from "../../lib/practiceContent";
import { consoleAnchor } from "../../lib/tutorConsole";

export function PracticeBankAdmin({ notify, runs = null }: {
  notify: (message: string, tone?: "success" | "warning") => void;
  /** Hamad's practice sets, for accuracy per bank (optional). */
  runs?: PracticeRun[] | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [banks, setBanks] = useState<PublishedPracticeBank[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    const [published, assignment] = await Promise.all([
      listPublishedPracticeBanks(),
      loadPracticeAssignment(),
    ]);
    setBanks(published);
    setAssigned(assignment?.bankStorageIds ?? []);
  };

  useEffect(() => { void refresh().catch(() => undefined); }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const published: PublishedPracticeBank[] = [];
    const failures: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const draft = parsePracticeBankDraft(JSON.parse(await file.text()));
          published.push(await publishPracticeBank(draft));
        } catch (cause) {
          failures.push(
            `${file.name}: ${cause instanceof Error ? cause.message : "invalid bank"}`,
          );
        }
      }
      const nextAssigned = [
        ...new Set([...assigned, ...published.map(bank => bank.storageId)]),
      ];
      await savePracticeAssignment(nextAssigned);
      await refresh();
      if (published.length) {
        notify(`${published.length} practice ${published.length === 1 ? "bank" : "banks"} published and assigned to Hamad.`);
      }
      if (failures.length) {
        setError(failures.join("\n"));
        notify(`${failures.length} practice ${failures.length === 1 ? "file was" : "files were"} rejected.`, "warning");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to publish these practice banks.";
      setError(message);
      notify(message, "warning");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const saveAssignment = async (next: string[], message: string) => {
    setBusy(true);
    try {
      await savePracticeAssignment(next);
      setAssigned(next);
      notify(message);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to update the assignment.", "warning");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (storageId: string) => {
    const unlocking = !assigned.includes(storageId);
    return saveAssignment(
      unlocking ? [...assigned, storageId] : assigned.filter(id => id !== storageId),
      unlocking ? "Practice module unlocked for Hamad." : "Practice module locked.",
    );
  };

  const groups = bankTopicGroups(banks, assigned);
  const gaps = coverageGaps(banks, getProgramWeek());

  return (
    <section className="panel practice-bank-admin">
      <div className="panel-heading">
        <div><p className="eyebrow">Student Practice Coach</p><h3>Published practice banks</h3></div>
        <BookOpenCheck size={21} />
      </div>
      <p className="practice-bank-admin__intro">Upload only student-safe, independently authored practice JSON. Published versions are immutable and contain no private tutor fields.</p>
      <p className="practice-bank-admin__intro">You can select several validated JSON files and publish the entire batch in one operation.</p>
      <input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={event => void upload(event.target.files)} />
      <button className="button button-primary" type="button" disabled={busy} onClick={() => input.current?.click()}><CloudUpload size={17} />{busy ? "Publishing…" : "Publish practice JSON"}</button>
      {error && <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}
      {banks.length === 0 ? <p className="practice-bank-admin__intro">No practice banks have been published.</p> : groups.map(group => {
        const allUnlocked = group.unlocked === group.banks.length;
        return (
          <section key={group.topic} className="practice-bank-admin__topic" aria-label={group.topic}>
            <header>
              <div><strong>{group.topic}</strong><small>{group.banks.length} {group.banks.length === 1 ? "bank" : "banks"} · {group.questions} questions · {group.unlocked} unlocked</small></div>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void saveAssignment(
                  setTopicUnlocked(assigned, group.banks, !allUnlocked),
                  allUnlocked ? `${group.topic} practice locked.` : `${group.topic} practice unlocked for Hamad.`,
                )}
              >
                {allUnlocked ? <><LockKeyhole size={16} />Lock all</> : <><LockKeyholeOpen size={16} />Unlock all</>}
              </button>
            </header>
            <div className="practice-bank-admin__list">
              {group.banks.map(bank => {
                const unlocked = assigned.includes(bank.storageId);
                const result = runs ? bankAccuracy(bank, runs) : null;
                return (
                  <article key={bank.storageId} id={consoleAnchor.bank(bank.storageId)}>
                    <div>
                      <span>{moduleRangeText(bankModules(bank))} · {bank.questions.length} questions</span>
                      <strong>{bank.title}</strong>
                      <small>
                        {bank.version}
                        {result && (result.answered ? ` · Hamad: ${Math.round(result.accuracy! * 100)}% of ${result.answered} answered` : " · not practised yet")}
                      </small>
                    </div>
                    <button type="button" disabled={busy} className={unlocked ? "is-unlocked" : ""} aria-pressed={unlocked} onClick={() => void toggle(bank.storageId)}>
                      {unlocked ? <><Check size={16} />Unlocked</> : <><LockKeyhole size={16} />Locked</>}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      {gaps.length > 0 && (
        <details className="practice-bank-admin__gaps">
          <summary>{gaps.length} {gaps.length === 1 ? "module" : "modules"} taught so far with no practice bank</summary>
          <ul>{gaps.map(gap => <li key={gap.catalogId}>Module {gap.number} · {gap.title} <small>({gap.topic})</small></li>)}</ul>
        </details>
      )}
    </section>
  );
}
