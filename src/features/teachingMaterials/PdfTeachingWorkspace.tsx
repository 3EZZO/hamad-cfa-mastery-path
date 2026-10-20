import { ArrowLeft, CheckCircle2, FlaskConical, LogOut, NotebookPen, Pause, Play, Send } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listActiveStudentMembers } from "../../lib/cloud";
import {
  MaterialServiceError, teachingMaterialService, type RecipientShares,
} from "../../lib/cloudTeachingMaterials";
import { teachingRunIdFor, type TeachingHostClock, type TeachingSessionEnvelope } from "../liveSession/teachingHost";
import { formatSessionTime } from "../liveSession/useSessionTimer";
import { materialLabel, type MaterialGrant, type MaterialReceipt, type ReaderPreference } from "./materialTypes";
import { PdfOpenError } from "./pdfErrors";
import type { ReaderErrorCopy, ReaderView } from "./PdfReader";
import { ShareMaterialDialog, type ShareRecipient } from "./ShareMaterialDialog";
import { shareSummary, TutorMaterialLibrary, type LibraryEntry } from "./TutorMaterialLibrary";
import { TutorNotesPanel } from "./TutorNotesPanel";
import { buildLibraryEntries } from "./libraryModel";
import { materialTopicForSession } from "./topicDisclosure";
import { TeachingDesk } from "./TeachingDesk";
import { resumeEntry, sessionModules, sessionTopics, taughtEarlier, upNext } from "./teachingDeskModel";
import { parsePages, taughtPagesByVersion, type PageCoverage } from "./coverageModel";
import { CoverageStrip } from "./CoverageStrip";
import { SessionSummaryDialog, type SessionRecordInput, type SummaryRow } from "./SessionSummaryDialog";
import { usePageDwell } from "./usePageDwell";
import "./teachingMaterials.css";

const PdfReader = lazy(() => import("./PdfReader"));

const PDF_ONLY_MINUTES = 150;
const MAX_CACHED_DOCUMENTS = 4;
const PREFERENCE_SAVE_MS = 1_500;

export function describeMaterialError(error: unknown): ReaderErrorCopy {
  if (error instanceof PdfOpenError) return { message: error.message, retryable: false };
  if (error instanceof MaterialServiceError) {
    switch (error.code) {
      case "permission-denied":
        return { message: "Access to this PDF is not available for this account.", retryable: false };
      case "not-found":
        return { message: "This PDF file is missing from storage. Re-add it from the original file.", retryable: false };
      case "invalid-material":
        return { message: "The downloaded file did not match its recorded version, so it was not opened.", retryable: true };
      default:
        return { message: error.message, retryable: true };
    }
  }
  return { message: "The PDF could not be opened. Check the connection and try again.", retryable: true };
}

function defaultView(): ReaderView {
  const wide = typeof window !== "undefined" && window.innerWidth > window.innerHeight * 1.2;
  return { page: 1, zoom: 1, fitMode: wide ? "page" : "width" };
}

export interface PdfTeachingWorkspaceProps {
  active: boolean;
  tutorUid: string;
  runId: string;
  sessionNumber: number;
  sessionLabel: string;
  sessionTitle: string;
  /** Curriculum topic of the session's plan week. */
  sessionTopic?: string;
  hostClock: TeachingHostClock;
  clockReady: boolean;
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string | null) => void;
  onOpenedForTeaching: (versionId: string) => void;
  rehearsal: boolean;
  onRehearsalChange: (rehearsal: boolean) => void;
  finished: boolean;
  onFinish: () => void;
  onExit: () => void;
  /** This session's pages taught and time per PDF. */
  coverage?: readonly PageCoverage[];
  onPageTaught?: (versionId: string, page: number) => void;
  onTeachingSeconds?: (versionId: string, seconds: number) => void;
  /** Tutor-confirmed session log (and optional task approval). */
  onRecordSession?: (input: SessionRecordInput) => Promise<void>;
  sessionRecorded?: boolean;
}

const NO_COVERAGE: readonly PageCoverage[] = [];
const noop = () => undefined;

/**
 * Teach from PDF: the tutor's private library, reader, notes and sharing,
 * inside Session Mode. It never invokes guided closeout, marks mastery or
 * completes tasks; sharing is a separate deliberate action.
 */
export function PdfTeachingWorkspace({
  active, tutorUid, runId, sessionNumber, sessionLabel, sessionTitle, sessionTopic, hostClock, clockReady,
  selectedVersionId, onSelectVersion, onOpenedForTeaching, rehearsal, onRehearsalChange,
  finished, onFinish, onExit, coverage = NO_COVERAGE, onPageTaught = noop, onTeachingSeconds = noop,
  onRecordSession, sessionRecorded = false,
}: PdfTeachingWorkspaceProps) {
  const service = useMemo(() => teachingMaterialService(), []);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [recipients, setRecipients] = useState<ShareRecipient[]>([]);
  const [recipientsError, setRecipientsError] = useState("");
  const [recipientUid, setRecipientUid] = useState<string | null>(null);
  const [shares, setShares] = useState<RecipientShares>({ grants: [], receipts: [] });
  const [mode, setMode] = useState<"library" | "reader">(selectedVersionId ? "reader" : "library");
  const [notesOpen, setNotesOpen] = useState(true);
  const [presenting, setPresenting] = useState(false);
  const [shareTarget, setShareTarget] = useState<LibraryEntry | null>(null);
  const [initialView, setInitialView] = useState<{ versionId: string; view: ReaderView } | null>(null);
  const bytesCache = useRef(new Map<string, Uint8Array>());
  const prefsCache = useRef(new Map<string, ReaderView>());
  const prefTimers = useRef(new Map<string, number>());
  const timer = hostClock.timer;
  const [earlier, setEarlier] = useState<(TeachingSessionEnvelope | null)[] | null>(null);
  const [resumePage, setResumePage] = useState<{ versionId: string; page: number } | null>(null);
  const [readerPage, setReaderPage] = useState<{ versionId: string; page: number } | null>(null);
  const [jumpTo, setJumpTo] = useState<{ page: number } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // A hidden PDF surface must release its modal's global focus trap.
  useEffect(() => { if (!active) { setShareTarget(null); setSummaryOpen(false); } }, [active]);

  // ------------------------------------------------------------ library
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void Promise.all([service.listMaterials(), service.listVersions(), service.listDetails()]).then(([materials, versions, details]) => {
      if (cancelled) return;
      setEntries(buildLibraryEntries(materials, versions, details));
      setLoading(false);
    }, error => {
      if (cancelled) return;
      setLoadError(error instanceof Error ? error.message : "The private library could not be loaded.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [reloadKey, service]);

  // Recipients come from the active membership list; never hard-coded.
  useEffect(() => {
    let cancelled = false;
    void listActiveStudentMembers().then(members => {
      if (cancelled) return;
      const list = members.map((member, index) => ({
        uid: member.uid,
        label: members.length === 1 ? "Hamad" : `Student ${index + 1} (…${member.uid.slice(-4)})`,
      }));
      setRecipients(list);
      setRecipientUid(current => current ?? (list.length === 1 ? list[0]!.uid : null));
    }, () => { if (!cancelled) setRecipientsError("Active student accounts could not be loaded."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!recipientUid) {
      setShares({ grants: [], receipts: [] });
      return;
    }
    return service.subscribeRecipientShares(recipientUid, setShares, () => setShares({ grants: [], receipts: [] }));
  }, [recipientUid, service]);

  const grants = useMemo(() => new Map<string, MaterialGrant>(shares.grants.map(item => [item.versionId, item])), [shares.grants]);
  const receipts = useMemo(() => new Map<string, MaterialReceipt>(shares.receipts.map(item => [item.versionId, item])), [shares.receipts]);
  const recipient = recipients.find(item => item.uid === recipientUid) ?? null;

  // ------------------------------------------------------- teaching desk
  // Earlier sessions' private records say what was already taught and where
  // teaching stopped; a failed read only hides that information.
  useEffect(() => {
    let cancelled = false;
    const numbers = Array.from({ length: Math.max(0, Math.min(sessionNumber, 26) - 1) }, (_, index) => index + 1);
    void Promise.all(numbers.map(number => service.loadTeachingEnvelope(teachingRunIdFor(number)).catch(() => null)))
      .then(envelopes => { if (!cancelled) setEarlier(envelopes); });
    return () => { cancelled = true; };
  }, [service, sessionNumber]);

  const topics = useMemo(() => sessionTopics(sessionNumber, materialTopicForSession(sessionTopic)), [sessionNumber, sessionTopic]);
  const modules = useMemo(() => sessionModules(sessionNumber), [sessionNumber]);
  const next = useMemo(() => upNext(entries, topics, taughtEarlier(earlier ?? [])), [earlier, entries, topics]);
  const resume = useMemo(() => resumeEntry(entries, selectedVersionId, earlier ?? []), [earlier, entries, selectedVersionId]);

  useEffect(() => {
    if (!resume) return;
    const { versionId, pageCount } = resume.version;
    const cached = prefsCache.current.get(versionId);
    if (cached) {
      setResumePage({ versionId, page: cached.page });
      return;
    }
    let cancelled = false;
    void service.loadReaderPreference(versionId, pageCount).then(preference => {
      if (!cancelled && preference) setResumePage({ versionId, page: preference.page });
    }, () => undefined);
    return () => { cancelled = true; };
  }, [resume, service, mode]);

  const selected = useMemo(() => {
    if (!selectedVersionId) return null;
    const current = entries.find(entry => entry.version.versionId === selectedVersionId);
    return current ?? null;
  }, [entries, selectedVersionId]);

  // ------------------------------------------- reader preference restore
  useEffect(() => {
    if (!selected) return;
    const versionId = selected.version.versionId;
    const cached = prefsCache.current.get(versionId);
    if (cached) {
      setInitialView({ versionId, view: cached });
      return;
    }
    let cancelled = false;
    setInitialView(null);
    const fallback = window.setTimeout(() => {
      if (!cancelled) setInitialView(current => current?.versionId === versionId ? current : { versionId, view: defaultView() });
    }, 2_500);
    void service.loadReaderPreference(versionId, selected.version.pageCount).then(preference => {
      if (cancelled) return;
      setInitialView(current => current?.versionId === versionId ? current
        : { versionId, view: preference ? { page: preference.page, zoom: preference.zoom, fitMode: preference.fitMode } : defaultView() });
    }, () => {
      if (!cancelled) setInitialView(current => current?.versionId === versionId ? current : { versionId, view: defaultView() });
    });
    return () => { cancelled = true; window.clearTimeout(fallback); };
  }, [selected, service]);

  useEffect(() => () => {
    prefTimers.current.forEach(handle => window.clearTimeout(handle));
  }, []);

  const rememberView = useCallback((versionId: string, pageCount: number, view: ReaderView) => {
    prefsCache.current.set(versionId, view);
    setReaderPage(current => (current?.versionId === versionId && current.page === view.page ? current : { versionId, page: view.page }));
    if (rehearsal) return;
    const existing = prefTimers.current.get(versionId);
    if (existing) window.clearTimeout(existing);
    prefTimers.current.set(versionId, window.setTimeout(() => {
      prefTimers.current.delete(versionId);
      const preference: ReaderPreference = { versionId, ...view };
      void service.saveReaderPreference(preference, pageCount).catch(() => undefined);
    }, PREFERENCE_SAVE_MS));
  }, [rehearsal, service]);

  const loadBytes = useCallback(async (signal: AbortSignal) => {
    if (!selected) throw new MaterialServiceError("not-found");
    const version = selected.version;
    const cached = bytesCache.current.get(version.versionId);
    if (cached) return cached;
    const bytes = await service.downloadVersionBytes(version, signal);
    bytesCache.current.set(version.versionId, bytes);
    while (bytesCache.current.size > MAX_CACHED_DOCUMENTS) {
      bytesCache.current.delete(bytesCache.current.keys().next().value!);
    }
    return bytes;
  }, [selected, service]);

  // ----------------------------------------------------------- coverage
  const selectedId = selected?.version.versionId ?? null;
  usePageDwell({
    versionId: selectedId,
    page: readerPage && readerPage.versionId === selectedId ? readerPage.page : null,
    counting: active && mode === "reader" && !rehearsal && timer.status === "running",
    onPageTaught,
    onSeconds: onTeachingSeconds,
  });
  const earlierPages = useMemo(() => taughtPagesByVersion((earlier ?? []).map(envelope => envelope?.coverage ?? [])), [earlier]);
  const allPages = useMemo(() => taughtPagesByVersion([...(earlier ?? []).map(envelope => envelope?.coverage ?? []), coverage]), [coverage, earlier]);
  const taughtCounts = useMemo(() => new Map([...allPages].map(([versionId, pages]) => [versionId, pages.size])), [allPages]);
  const selectedPagesText = coverage.find(entry => entry.versionId === selectedId)?.pages ?? "";
  const thisSessionPages = useMemo(() => new Set(parsePages(selectedPagesText)), [selectedPagesText]);
  const summaryRows = useMemo<SummaryRow[]>(() => coverage.flatMap(item => {
    const entry = entries.find(candidate => candidate.version.versionId === item.versionId);
    if (!entry) return [];
    const pagesTaught = parsePages(item.pages).length;
    const minutes = Math.round(item.seconds / 60);
    return pagesTaught || minutes ? [{ versionId: item.versionId, label: materialLabel(entry.version), pages: item.pages, pagesTaught, pageCount: entry.version.pageCount, minutes }] : [];
  }), [coverage, entries]);

  const openEntry = (entry: LibraryEntry) => {
    setJumpTo(null);
    onSelectVersion(entry.version.versionId);
    setMode("reader");
    if (!rehearsal) onOpenedForTeaching(entry.version.versionId);
  };

  // ------------------------------------------------------------- sharing
  const shareDisabledReason = rehearsal
    ? "Practice mode is on, so sharing is turned off."
    : recipientsError || (!recipients.length ? "No active student account is approved for sharing. Teaching from this PDF still works." : "");

  const send = async (entry: LibraryEntry, message: string): Promise<string> => {
    if (!recipientUid || !recipient) throw new Error("Choose a student first.");
    const outcome = await service.shareVersion(entry.sourceVersion, recipientUid, { sessionNumber, message });
    switch (outcome) {
      case "create": return `Sent. ${recipient.label} can open this version under Plan › Session materials.`;
      case "reactivate": return `Shared again as a new share. ${recipient.label}'s earlier opening no longer counts.`;
      case "update-metadata": return "Already shared. The session or message was updated; this is not a new opening.";
      default: return `Already shared with ${recipient.label}. Nothing changed.`;
    }
  };

  // --------------------------------------------------------------- clock
  const startOrToggle = () => {
    if (timer.status === "idle") timer.start(PDF_ONLY_MINUTES);
    else timer.toggle();
  };

  const enterRehearsal = (next: boolean) => {
    if (next && timer.status === "running") timer.pause();
    onRehearsalChange(next);
  };

  const shareState = selected && recipient ? shareSummary(grants.get(selected.version.versionId), receipts.get(selected.version.versionId)) : null;

  return (
    <div className="tm-teach">
      <div className="tm-teach__bar">
        <div className="tm-teach__title">
          <h1>{sessionLabel} · Teach from PDF</h1>
          <p title={sessionTitle}>{sessionTitle}</p>
        </div>
        <div className="tm-clock" role="group" aria-label="Session clock">
          <small>{timer.status === "complete" ? "Session clock finished" : "Session clock"}</small>
          <strong aria-live="off">{formatSessionTime(timer.elapsedMs)}</strong>
          {timer.status !== "complete" && (
            <button
              type="button"
              className="tm-button"
              disabled={!clockReady || rehearsal}
              aria-label={timer.status === "running" ? "Pause session clock" : timer.status === "paused" ? "Resume session clock" : "Start session clock"}
              onClick={startOrToggle}
            >
              {timer.status === "running" ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {timer.status === "running" ? "Pause" : timer.status === "paused" ? "Resume" : "Start"}
            </button>
          )}
        </div>
        <button type="button" className="tm-button" aria-pressed={rehearsal} aria-label={rehearsal ? "Exit practice" : "Practise without saving"} onClick={() => enterRehearsal(!rehearsal)}>
          <FlaskConical size={16} aria-hidden="true" /> <span>{rehearsal ? "Exit practice" : "Practise without saving"}</span>
        </button>
        <button type="button" className="tm-button" disabled={rehearsal} aria-label={finished ? "Open the session summary" : "Finish PDF teaching"} onClick={() => setSummaryOpen(true)}>
          <CheckCircle2 size={16} aria-hidden="true" /> <span>{finished ? "Session summary" : "Finish PDF teaching"}</span>
        </button>
        <button type="button" className="tm-button" aria-label="Exit Session Mode" onClick={onExit}>
          <LogOut size={16} aria-hidden="true" /> <span>Exit</span>
        </button>
      </div>
      {rehearsal && (
        <div className="tm-rehearsal-banner" role="status">
          <strong>Practice — nothing is saved.</strong>
          <span>Notes, reader positions and the session clock are not recorded, and sharing is off.</span>
        </div>
      )}
      {finished && !rehearsal && (
        <div className="tm-rehearsal-banner" role="status">
          <span>PDF teaching history and private notes are saved. Sharing, the session log and task approval remain separate actions.</span>
        </div>
      )}
      <div className="tm-teach__main">
        {mode === "reader" && selected ? (
          initialView?.versionId === selected.version.versionId ? (
            <Suspense fallback={<p className="tm-state" role="status">Loading the reader…</p>}>
              <PdfReader
                active={active}
                key={`${tutorUid}:${selected.version.versionId}`}
                documentKey={`${tutorUid}:${selected.version.versionId}`}
                variant="tutor"
                title={selected.version.title}
                subtitle={`${selected.version.readingNumber !== null ? `Reading ${String(selected.version.readingNumber).padStart(2, "0")} · ` : ""}${selected.version.pageCount} pages · private copy`}
                loadBytes={loadBytes}
                initialView={initialView.view}
                describeError={describeMaterialError}
                onViewChange={view => rememberView(selected.version.versionId, selected.version.pageCount, view)}
                onPresentationChange={setPresenting}
                toolbarStart={(
                  <button type="button" className="tm-button" onClick={() => setMode("library")}>
                    <ArrowLeft size={16} aria-hidden="true" /> Library
                  </button>
                )}
                toolbarEnd={(
                  <>
                    {shareState && <span className={`tm-badge tm-badge--${shareState.tone}`}>{shareState.label}</span>}
                    <button type="button" className="tm-button" disabled={rehearsal} onClick={() => setShareTarget(selected)}>
                      <Send size={16} aria-hidden="true" /> Share
                    </button>
                    <button type="button" className="tm-icon" aria-pressed={notesOpen} aria-label={notesOpen ? "Hide private notes" : "Show private notes"} onClick={() => setNotesOpen(value => !value)}>
                      <NotebookPen size={18} aria-hidden="true" />
                    </button>
                  </>
                )}
                jumpTo={jumpTo}
                belowToolbar={!rehearsal ? (
                  <CoverageStrip pageCount={selected.version.pageCount} page={readerPage?.versionId === selectedId ? readerPage.page : 1}
                    thisSession={thisSessionPages} earlier={earlierPages.get(selected.version.versionId) ?? new Set()}
                    onJump={page => setJumpTo({ page })} />
                ) : null}
                aside={notesOpen && !presenting ? (
                  <TutorNotesPanel service={service} tutorUid={tutorUid} runId={runId} versionId={selected.version.versionId} rehearsal={rehearsal} />
                ) : null}
              />
            </Suspense>
          ) : <p className="tm-state" role="status">Restoring your last position…</p>
        ) : (
          <div className="tm-teach__library">
            {selectedVersionId && !selected && !loading && (
              <p className="tm-notice" role="status">The PDF chosen earlier for this session is no longer in the library.</p>
            )}
            {entries.length > 0 && (
              <TeachingDesk sessionLabel={sessionLabel} modules={modules} next={next.items} more={next.more}
                resume={resume} resumePage={resumePage?.versionId === resume?.version.versionId ? resumePage!.page : null}
                loading={earlier === null} onOpen={openEntry} />
            )}
            <TutorMaterialLibrary
              service={service}
              entries={entries}
              loading={loading}
              loadError={loadError}
              onReload={() => setReloadKey(value => value + 1)}
              recipientLabel={recipient?.label ?? null}
              grants={grants}
              receipts={receipts}
              selectedVersionId={selectedVersionId}
              rehearsal={rehearsal}
              active={active}
              disclosureKey={`tutor:${tutorUid}:session-${sessionNumber}`}
              sessionTopics={topics}
              taughtCounts={taughtCounts}
              onOpen={openEntry}
              onShare={setShareTarget}
              onDetailsSaved={details => setEntries(current => current.map(entry => entry.version.versionId === details.versionId
                ? { ...entry, version: { ...entry.version, title: details.title, readingNumber: details.readingNumber },
                  topic: details.topic, detailsRevision: details.revision } : entry))}
            />
          </div>
        )}
      </div>
      {active && shareTarget && (
        <ShareMaterialDialog
          version={shareTarget.version}
          recipients={recipients}
          recipientUid={recipientUid}
          onRecipientChange={setRecipientUid}
          grant={grants.get(shareTarget.version.versionId) ?? null}
          receipt={receipts.get(shareTarget.version.versionId) ?? null}
          sessionNumber={sessionNumber}
          disabledReason={shareDisabledReason || undefined}
          onSend={message => send(shareTarget, message)}
          onRevoke={async () => {
            if (!recipientUid) return;
            await service.revokeVersion(shareTarget.version.versionId, recipientUid);
          }}
          onClose={() => setShareTarget(null)}
        />
      )}
      {active && summaryOpen && !rehearsal && (
        <SessionSummaryDialog
          active={active}
          sessionLabel={sessionLabel}
          clockMinutes={Math.round(timer.elapsedMs / 60_000)}
          rows={summaryRows}
          recorded={sessionRecorded}
          finished={finished}
          onFinishOnly={() => { onFinish(); setSummaryOpen(false); }}
          onRecord={async input => {
            if (!onRecordSession) throw new Error("The session log is not available here.");
            if (!finished) onFinish();
            await onRecordSession(input);
            setSummaryOpen(false);
          }}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      <span className="visually-hidden" aria-live="polite">{selected ? `Teaching ${materialLabel(selected.version)}` : ""}</span>
    </div>
  );
}
