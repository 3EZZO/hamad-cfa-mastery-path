import { BookOpenCheck, Check, CircleAlert, CloudUpload, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  listPublishedPracticeBanks,
  loadPracticeAssignment,
  publishPracticeBank,
  savePracticeAssignment,
} from "../../lib/cloud";
import {
  parsePracticeBankDraft,
  type PublishedPracticeBank,
} from "../../lib/practiceContent";

export function PracticeBankAdmin({ notify }: {
  notify: (message: string, tone?: "success" | "warning") => void;
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

  const toggle = async (storageId: string) => {
    setBusy(true);
    try {
      const next = assigned.includes(storageId)
        ? assigned.filter(id => id !== storageId)
        : [...assigned, storageId];
      await savePracticeAssignment(next);
      setAssigned(next);
      notify(assigned.includes(storageId) ? "Practice module locked." : "Practice module unlocked for Hamad.");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to update the assignment.", "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel practice-bank-admin">
      <div className="panel-heading">
        <div><p className="eyebrow">Student Practice Coach</p><h3>Published practice banks</h3></div>
        <BookOpenCheck size={21} />
      </div>
      <p className="practice-bank-admin__intro">Upload only student-safe, independently authored practice JSON. Published versions are immutable and contain no private tutor fields.</p>
      <input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={event => void upload(event.target.files)} />
      <button className="button button-primary" type="button" disabled={busy} onClick={() => input.current?.click()}><CloudUpload size={17} />{busy ? "Publishing…" : "Publish practice JSON"}</button>
      {error && <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}
      <div className="practice-bank-admin__list">
        {banks.length ? banks.map(bank => {
          const unlocked = assigned.includes(bank.storageId);
          return <article key={bank.storageId}><div><span>{bank.topic} · {bank.questions.length} questions</span><strong>{bank.title}</strong><small>{bank.version}</small></div><button type="button" disabled={busy} className={unlocked ? "is-unlocked" : ""} onClick={() => void toggle(bank.storageId)}>{unlocked ? <><Check size={16} />Unlocked</> : <><LockKeyhole size={16} />Locked</>}</button></article>;
        }) : <p>No practice banks have been published.</p>}
      </div>
    </section>
  );
}
