import { BookOpen, FilePlus2, RefreshCw, Send, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { publishMaterialVersion, type TeachingMaterialService } from "../../lib/cloudTeachingMaterials";
import {
  materialLabel, MAX_MATERIAL_BYTES, normalizeMaterialTitle, normalizeReadingNumber, proposeMaterialLabel,
  receiptCountsAsOpened, toHex, validatePdfFileShape,
  type MaterialGrant, type MaterialReceipt,
} from "./materialTypes";
import type { LibraryEntry } from "./libraryModel";
export type { LibraryEntry } from "./libraryModel";

interface ImportRow {
  id: string;
  fileName: string;
  bytes: Uint8Array | null;
  sha256: string;
  pageCount: number;
  title: string;
  reading: string;
  status: "checking" | "ready" | "invalid" | "uploading" | "done" | "failed" | "cancelled";
  message: string;
  progress: number;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function shareSummary(grant: MaterialGrant | undefined, receipt: MaterialReceipt | undefined): { label: string; tone: "private" | "shared" | "opened" | "revoked" } {
  if (!grant) return { label: "Private", tone: "private" };
  if (grant.status === "revoked") return { label: "Access removed", tone: "revoked" };
  return receiptCountsAsOpened(receipt, grant) ? { label: "Shared · Opened", tone: "opened" } : { label: "Shared", tone: "shared" };
}

export function TutorMaterialLibrary({
  service, entries, loading, loadError, onReload, recipientLabel, grants, receipts,
  selectedVersionId, rehearsal, onOpen, onShare,
}: {
  service: TeachingMaterialService;
  entries: LibraryEntry[];
  loading: boolean;
  loadError: string;
  onReload: () => void;
  recipientLabel: string | null;
  grants: Map<string, MaterialGrant>;
  receipts: Map<string, MaterialReceipt>;
  selectedVersionId: string | null;
  rehearsal: boolean;
  onOpen: (entry: LibraryEntry) => void;
  onShare: (entry: LibraryEntry) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase().replace(/^r(?:eading)?\s*0?/, "");
    const sorted = [...entries].sort((a, b) =>
      (a.version.readingNumber ?? 999) - (b.version.readingNumber ?? 999)
      || a.material.materialId.localeCompare(b.material.materialId)
      || Number(b.version.versionId === b.material.currentVersionId) - Number(a.version.versionId === a.material.currentVersionId)
      || (b.version.createdAtMs ?? 0) - (a.version.createdAtMs ?? 0));
    if (!needle) return sorted;
    return sorted.filter(({ version }) =>
      version.title.toLowerCase().includes(filter.trim().toLowerCase())
      || (version.readingNumber !== null && String(version.readingNumber) === needle.replace(/^0+/, "")));
  }, [entries, filter]);

  const update = (id: string, patch: Partial<ImportRow>) =>
    setRows(current => current.map(row => (row.id === id ? { ...row, ...patch } : row)));

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const { inspectPdf } = await import("./pdfEngine");
    const fresh: ImportRow[] = [...files].map((file, index) => {
      const label = proposeMaterialLabel(file.name);
      return {
        id: `${Date.now()}-${index}-${file.name}`, fileName: file.name, bytes: null, sha256: "", pageCount: 0,
        title: label.title, reading: label.readingNumber === null ? "" : String(label.readingNumber),
        status: "checking", message: "Checking…", progress: 0,
      };
    });
    setRows(current => [...current.filter(row => row.status !== "done"), ...fresh]);
    await Promise.all([...files].map(async (file, index) => {
      const row = fresh[index]!;
      try {
        if (file.size > MAX_MATERIAL_BYTES || file.size === 0) {
          return update(row.id, { status: "invalid", message: file.size === 0 ? "The file is empty." : "The file is larger than the 5 MiB limit." });
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const problem = validatePdfFileShape(file, bytes.subarray(0, 1024));
        if (problem) return update(row.id, { status: "invalid", message: problem });
        const sha256 = toHex(await crypto.subtle.digest("SHA-256", bytes));
        const { pageCount } = await inspectPdf(bytes);
        const known = entries.find(entry => entry.version.sha256 === sha256);
        update(row.id, {
          bytes, sha256, pageCount, status: "ready",
          message: known ? `Already in the library as ${materialLabel(known.version)}` : `${pageCount} pages · ${formatSize(bytes.byteLength)}`,
        });
      } catch (error) {
        update(row.id, { status: "invalid", message: error instanceof Error ? error.message : "The PDF could not be read." });
      }
    }));
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadReady = async () => {
    const queue = rows.filter(row => row.status === "ready" || row.status === "failed" || row.status === "cancelled");
    if (!queue.length) return;
    setUploading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    for (const row of queue) {
      if (controller.signal.aborted) {
        update(row.id, { status: "cancelled", message: "Cancelled before upload." });
        continue;
      }
      const title = normalizeMaterialTitle(row.title);
      if (!row.bytes || !title) {
        update(row.id, { status: "failed", message: "Add a title first." });
        continue;
      }
      update(row.id, { status: "uploading", message: "Publishing privately…", progress: 0 });
      try {
        const result = await publishMaterialVersion(service, {
          bytes: row.bytes, sha256: row.sha256, byteSize: row.bytes.byteLength, pageCount: row.pageCount,
          title, readingNumber: normalizeReadingNumber(row.reading),
        }, { signal: controller.signal });
        update(row.id, {
          status: "done", progress: 1, bytes: null,
          message: result.duplicate ? "Already in the library — no new version created."
            : "Added privately. Not shared with anyone.",
        });
      } catch (error) {
        const cancelled = controller.signal.aborted;
        update(row.id, { status: cancelled ? "cancelled" : "failed", message: cancelled ? "Import stopped. Check the library before retrying the current PDF." : error instanceof Error ? error.message : "Upload failed." });
      }
    }
    abortRef.current = null;
    setUploading(false);
    onReload();
  };

  const readyCount = rows.filter(row => row.status === "ready" || row.status === "failed" || row.status === "cancelled").length;

  return (
    <div className="tm-library">
      <div className="tm-library__head">
        <div>
          <h2>Teaching PDFs</h2>
          <p>Any PDF can be used in any session. Opening or teaching a PDF never shares it.</p>
        </div>
        <div className="tm-library__tools">
          <label>
            <span className="visually-hidden">Search by title or reading number</span>
            <input type="search" placeholder="Search title or reading no." value={filter} onChange={event => setFilter(event.target.value)} />
          </label>
          <button type="button" className="tm-button" disabled={rehearsal} onClick={() => fileRef.current?.click()}>
            <FilePlus2 size={16} aria-hidden="true" /> Add PDFs
          </button>
          <input ref={fileRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" multiple tabIndex={-1}
            onChange={event => void addFiles(event.target.files)} />
        </div>
      </div>

      {rows.length > 0 && (
        <section className="tm-import" aria-labelledby="tm-import-title">
          <h3 id="tm-import-title">Add PDFs to the private library</h3>
          <table>
            <thead><tr><th>File</th><th>Reading</th><th>Title</th><th>Result</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{row.fileName}</td>
                  <td>
                    <input type="number" min={1} max={99} aria-label={`Reading number for ${row.fileName}`} value={row.reading}
                      disabled={row.status !== "ready" && row.status !== "failed"}
                      onChange={event => update(row.id, { reading: event.target.value })} />
                  </td>
                  <td>
                    <input type="text" aria-label={`Title for ${row.fileName}`} value={row.title} maxLength={160}
                      disabled={row.status !== "ready" && row.status !== "failed"}
                      onChange={event => update(row.id, { title: event.target.value })} />
                  </td>
                  <td className={row.status === "invalid" || row.status === "failed" ? "tm-import__status--error" : row.status === "done" ? "tm-import__status--ok" : ""}>
                    {row.status === "uploading" ? <progress aria-label={`Publishing ${row.fileName}`} /> : null}
                    <span role="status">{row.message}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tm-import__actions">
            <button type="button" className="tm-button tm-button--primary" disabled={uploading || !readyCount} onClick={() => void uploadReady()}>
              {uploading ? <RefreshCw className="tm-spin" size={16} aria-hidden="true" /> : <FilePlus2 size={16} aria-hidden="true" />}
              Upload {readyCount || ""} privately
            </button>
            {uploading && (
              <button type="button" className="tm-button" onClick={() => abortRef.current?.abort()}>
                <X size={16} aria-hidden="true" /> Stop import
              </button>
            )}
            {!uploading && <button type="button" className="tm-button" onClick={() => setRows([])}>Clear list</button>}
          </div>
        </section>
      )}

      {loadError && (
        <div className="tm-notice" role="alert">
          <span>{loadError}</span>
          <button type="button" className="tm-button" onClick={onReload}><RefreshCw size={15} aria-hidden="true" /> Retry</button>
        </div>
      )}
      {loading && !entries.length ? (
        <p className="tm-state" role="status"><RefreshCw className="tm-spin" size={18} aria-hidden="true" /> Loading the private library…</p>
      ) : !entries.length && !loadError ? (
        <p className="tm-state">No PDFs yet. Use “Add PDFs” to import the branded summaries privately.</p>
      ) : (
        <ul className="tm-library__list" aria-label="Teaching PDFs">
          {visible.map(entry => {
            const grant = grants.get(entry.version.versionId);
            const summary = shareSummary(grant, receipts.get(entry.version.versionId));
            const olderShared = [...grants.values()].some(item =>
              item.materialId === entry.material.materialId && item.versionId !== entry.version.versionId && item.status === "active");
            return (
              <li key={entry.version.versionId} className={`tm-material${selectedVersionId === entry.version.versionId ? " is-selected" : ""}`}>
                <p className="tm-material__eyebrow">
                  {entry.version.readingNumber !== null ? `Reading ${String(entry.version.readingNumber).padStart(2, "0")}` : "Supplementary"}
                  {" · "}{entry.version.sourceEdition} study notes
                </p>
                <h3>{entry.version.title}</h3>
                <p className="tm-material__meta">
                  <span>{entry.version.pageCount} pages</span>
                  <span>{formatSize(entry.version.byteSize)}</span>
                  {entry.version.versionId !== entry.material.currentVersionId && <span>Earlier version · {entry.version.sha256.slice(0, 8)}</span>}
                  {recipientLabel && <span className={`tm-badge tm-badge--${summary.tone}`}>{summary.label}</span>}
                  {olderShared && <span className="tm-badge tm-badge--shared">Older version shared</span>}
                </p>
                <div className="tm-material__actions">
                  <button type="button" className="tm-button tm-button--primary" onClick={() => onOpen(entry)}>
                    <BookOpen size={16} aria-hidden="true" /> Open for teaching
                  </button>
                  <button type="button" className="tm-button" disabled={rehearsal} onClick={() => onShare(entry)}>
                    <Send size={16} aria-hidden="true" /> {recipientLabel ? `Share with ${recipientLabel}` : "Share"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
