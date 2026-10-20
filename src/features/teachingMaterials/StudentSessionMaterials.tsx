import { ArrowLeft, BookOpen, FileText, RefreshCw, ShieldAlert } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MaterialServiceError, teachingMaterialService } from "../../lib/cloudTeachingMaterials";
import { formatSharedDate, materialLabel, sortShares, type ReaderPreference } from "./materialTypes";
import { PdfOpenError } from "./pdfErrors";
import type { ReaderErrorCopy, ReaderView } from "./PdfReader";
import "./teachingMaterials.css";
import { compareMaterialLabels, groupMaterialsByTopic, type LabeledMaterialGrant, type MaterialTopic } from "./materialDetails";
import { TopicGroup } from "./TopicGroup";
import { useTopicDisclosure } from "./topicDisclosure";

const PdfReader = lazy(() => import("./PdfReader"));
const PREFERENCE_SAVE_MS = 1_500;

function describeStudentError(error: unknown): ReaderErrorCopy {
  if (error instanceof PdfOpenError) return { message: "This PDF could not be displayed.", retryable: false };
  if (error instanceof MaterialServiceError && error.code === "permission-denied") {
    return { message: "This material is no longer shared with you.", retryable: false };
  }
  return { message: "The PDF could not be opened. Check your connection and try again.", retryable: true };
}

/**
 * Plan › Session materials. The student sees only the PDFs explicitly shared
 * with their account; each opens in their own reader (independent page and
 * zoom). "Opened" is recorded only after a page actually renders.
 */
export default function StudentSessionMaterials({
  uid, versionId, invalidRoute = false, onOpen, onClose,
}: {
  uid: string;
  versionId: string | null;
  invalidRoute?: boolean;
  onOpen: (versionId: string) => void;
  onClose: () => void;
}) {
  const service = useMemo(() => teachingMaterialService(), []);
  const [grants, setGrants] = useState<LabeledMaterialGrant[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [initialView, setInitialView] = useState<{ key: string; view: ReaderView } | null>(null);
  // The topic of the newest share opens by default; the others start collapsed.
  const newestTopic = grants?.[0]?.topic; // grants are kept newest first
  const defaultOpen = useMemo<MaterialTopic[]>(() => (newestTopic ? [newestTopic] : []), [newestTopic]);
  const disclosure = useTopicDisclosure(`student:${uid}`, defaultOpen);
  // In-memory only (v1 has no offline PDFs); keyed by account, version and
  // share revision so a revoked or re-shared document is never served stale.
  const bytesCache = useRef(new Map<string, Uint8Array>());
  const prefTimer = useRef<number | null>(null);

  useEffect(() => {
    setError("");
    return service.subscribeMyActiveGrants(
      next => setGrants(sortShares(next)),
      failure => {
        // Authorization cannot be re-established: close everything.
        setGrants(null);
        bytesCache.current.clear();
        setError(failure.code === "permission-denied"
          ? "Your account cannot open session materials right now."
          : "Session materials could not be loaded. Check your connection.");
      },
    );
  }, [attempt, service, uid]);

  const grant = versionId && grants ? grants.find(item => item.versionId === versionId) ?? null : null;
  const readerKey = grant ? `${uid}:${grant.versionId}:${grant.shareRevision}` : "";
  const [removedWhileReading, setRemovedWhileReading] = useState(false);
  // v1 has no offline PDFs: without a connection the share cannot be
  // re-confirmed, so the reader closes and in-memory bytes are dropped.
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const goOffline = () => { setOffline(true); bytesCache.current.clear(); };
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);
  const shownKeyRef = useRef("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Access removed while the PDF is open: close it and leave the document
  // address, so a later re-share never reopens (or counts as opened)
  // without the student choosing to open it again.
  useEffect(() => {
    if (readerKey) {
      shownKeyRef.current = readerKey;
      setRemovedWhileReading(false);
      return;
    }
    if (shownKeyRef.current && grants !== null) {
      shownKeyRef.current = "";
      bytesCache.current.clear();
      setRemovedWhileReading(true);
      onCloseRef.current();
    }
  }, [grants, readerKey]);

  // Drop cached bytes for anything no longer actively shared.
  useEffect(() => {
    if (!grants) return;
    const live = new Set(grants.map(item => `${uid}:${item.versionId}:${item.shareRevision}`));
    for (const key of bytesCache.current.keys()) if (!live.has(key)) bytesCache.current.delete(key);
  }, [grants, uid]);

  useEffect(() => {
    if (!grant) return;
    let cancelled = false;
    const key = readerKey;
    setInitialView(null);
    const fallback = { page: 1, zoom: 1, fitMode: "width" as const };
    const timer = window.setTimeout(() => {
      if (!cancelled) setInitialView(current => current?.key === key ? current : { key, view: fallback });
    }, 2_500);
    void service.loadReaderPreference(grant.versionId, grant.pageCount).then(preference => {
      if (!cancelled) setInitialView(current => current?.key === key ? current : { key, view: preference ?? fallback });
    }, () => {
      if (!cancelled) setInitialView(current => current?.key === key ? current : { key, view: fallback });
    });
    return () => { cancelled = true; window.clearTimeout(timer); };
    // The key captures the grant identity and revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running for an unchanged grant object would reset the reader.
  }, [readerKey, service]);

  useEffect(() => () => { if (prefTimer.current !== null) window.clearTimeout(prefTimer.current); }, []);

  const loadBytes = useCallback(async (signal: AbortSignal) => {
    if (!grant) throw new MaterialServiceError("permission-denied");
    const key = `${uid}:${grant.versionId}:${grant.shareRevision}`;
    const cached = bytesCache.current.get(key);
    if (cached) return cached;
    const bytes = await service.downloadVersionBytes(grant, signal);
    bytesCache.current.clear();
    bytesCache.current.set(key, bytes);
    return bytes;
  }, [grant, service, uid]);

  const rememberView = (view: ReaderView) => {
    if (!grant) return;
    const target = grant;
    if (prefTimer.current !== null) window.clearTimeout(prefTimer.current);
    prefTimer.current = window.setTimeout(() => {
      prefTimer.current = null;
      const preference: ReaderPreference = { versionId: target.versionId, ...view };
      void service.saveReaderPreference(preference, target.pageCount).catch(() => undefined);
    }, PREFERENCE_SAVE_MS);
  };

  if (error) {
    return (
      <div className="tm-student">
        <div className="tm-notice" role="alert">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="tm-button" onClick={() => setAttempt(value => value + 1)}>
            <RefreshCw size={15} aria-hidden="true" /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (grants === null) {
    return <p className="tm-state" role="status"><RefreshCw className="tm-spin" size={18} aria-hidden="true" /> Loading session materials…</p>;
  }

  if (versionId || invalidRoute) {
    if (grant && offline) {
      return (
        <div className="tm-student">
          <div className="tm-notice" role="status">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>You are offline. Shared PDFs open only while connected; reconnect to keep reading.</span>
          </div>
          <button type="button" className="tm-button" onClick={onClose}>
            <ArrowLeft size={16} aria-hidden="true" /> All session materials
          </button>
        </div>
      );
    }
    if (!grant) {
      return (
        <div className="tm-student">
          <div className="tm-notice" role="status">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>This material is not available. It may not have been shared with you, or your tutor removed access.</span>
          </div>
          <button type="button" className="tm-button" onClick={onClose}>
            <ArrowLeft size={16} aria-hidden="true" /> All session materials
          </button>
        </div>
      );
    }
    return (
      <div className="tm-student">
        <div className="tm-student__reader">
          {initialView?.key === readerKey ? (
            <Suspense fallback={<p className="tm-state" role="status">Loading the reader…</p>}>
              <PdfReader
                key={readerKey}
                documentKey={readerKey}
                variant="student"
                title={grant.title}
                subtitle={`${grant.readingNumber !== null ? `Reading ${String(grant.readingNumber).padStart(2, "0")} · ` : ""}${grant.pageCount} pages`}
                loadBytes={loadBytes}
                initialView={initialView.view}
                describeError={describeStudentError}
                onViewChange={rememberView}
                onRendered={() => { void service.recordOpened(grant.versionId, grant.shareRevision).catch(() => undefined); }}
                toolbarStart={(
                  <button type="button" className="tm-button" onClick={onClose}>
                    <ArrowLeft size={16} aria-hidden="true" /> <span>Materials</span>
                  </button>
                )}
              />
            </Suspense>
          ) : <p className="tm-state" role="status">Opening…</p>}
        </div>
        {grant.message && <p className="tm-student__message"><strong>From your tutor:</strong> {grant.message}</p>}
      </div>
    );
  }

  return (
    <div className="tm-student">
      <div>
        <h3 style={{ margin: 0 }}>Session materials</h3>
        <p className="fine-print" style={{ margin: "4px 0 0" }}>
          PDFs your tutor shared with you. They are study resources, not tasks, and opening one does not change your progress.
        </p>
      </div>
      {removedWhileReading && (
        <div className="tm-notice" role="status">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>Your tutor removed access to the PDF you were reading, so it was closed.</span>
        </div>
      )}
      {!grants.length ? (
        <p className="tm-state"><FileText size={20} aria-hidden="true" /> Nothing has been shared yet.</p>
      ) : (
        <div className="tm-topic-groups">
          {groupMaterialsByTopic([...grants].sort(compareMaterialLabels), item => item.topic).map(group => (
          <TopicGroup key={group.topic} topic={group.topic} count={group.items.length} open={disclosure.isOpen(group.topic)}
            onToggle={() => disclosure.setOpen([group.topic], !disclosure.isOpen(group.topic))}>
            <ul className="tm-student__list" aria-label={`${group.topic} PDFs`}>
          {group.items.map(item => (
            <li key={item.versionId} className="tm-material tm-student__item">
              <p className="tm-material__eyebrow">
                {item.readingNumber !== null ? `Reading ${String(item.readingNumber).padStart(2, "0")} · ` : ""}{item.sourceEdition} study notes
              </p>
              <h3>{item.title}</h3>
              <p className="tm-material__meta">
                <span>{item.pageCount} pages</span>
                <span>{formatSharedDate(item.sharedAtMs)}</span>
                {item.sessionNumbers.length > 0 && (
                  <span>{item.sessionNumbers.map(number => `Session ${String(number).padStart(2, "0")}`).join(", ")}</span>
                )}
              </p>
              {item.message && <p className="tm-student__message">{item.message}</p>}
              <div className="tm-material__actions">
                <button type="button" className="tm-button tm-button--primary" onClick={() => onOpen(item.versionId)} aria-label={`Open ${materialLabel(item)}`}>
                  <BookOpen size={16} aria-hidden="true" /> Open
                </button>
              </div>
            </li>
          ))}
            </ul>
          </TopicGroup>))}
        </div>
      )}
    </div>
  );
}
