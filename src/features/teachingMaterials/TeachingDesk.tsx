import { BookOpen, History } from "lucide-react";
import type { LibraryEntry } from "./libraryModel";
import { materialLabel } from "./materialTypes";
import type { SessionModule } from "./teachingDeskModel";
import { keyPageLabel, type KeyPage } from "./pdfNotesModel";

/**
 * The PDF surface's start screen: continue where teaching stopped, the next
 * PDFs for this session's topics and the session's curriculum modules.
 * Opening from here is the same as "Open for teaching" in the library.
 */
export function TeachingDesk({ sessionLabel, modules, next, more, resume, resumePage, resumeKeyPages = [], loading, onOpen, onOpenAt }: {
  sessionLabel: string;
  modules: readonly SessionModule[];
  next: readonly LibraryEntry[];
  more: number;
  resume: LibraryEntry | null;
  resumePage: number | null;
  /** Pinned key pages of the PDF to continue with. */
  resumeKeyPages?: readonly KeyPage[];
  loading: boolean;
  onOpen: (entry: LibraryEntry) => void;
  onOpenAt?: (entry: LibraryEntry, page: number) => void;
}) {
  return (
    <section className="tm-desk" aria-label={`${sessionLabel} teaching desk`}>
      <div className="tm-desk__grid">
        {resume && (
          <article className="tm-desk__card tm-desk__card--resume">
            <p className="tm-material__eyebrow"><History size={14} aria-hidden="true" /> Continue where you left off</p>
            <h3>{materialLabel(resume.version)}</h3>
            <p className="tm-material__meta">
              {resumePage !== null ? `Page ${resumePage} of ${resume.version.pageCount}` : `${resume.version.pageCount} pages`} · {resume.topic}
            </p>
            <div className="tm-material__actions">
              <button type="button" className="tm-button tm-button--primary" onClick={() => onOpen(resume)}>
                <BookOpen size={16} aria-hidden="true" /> Continue
              </button>
            </div>
            {onOpenAt && resumeKeyPages.length > 0 && (
              <div className="tm-desk__keys">
                <span>Key pages</span>
                <ul>
                  {resumeKeyPages.map(entry => (
                    <li key={entry.page}>
                      <button type="button" className="tm-chip" onClick={() => onOpenAt(resume, entry.page)}>{keyPageLabel(entry)}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        )}
        <article className="tm-desk__card">
          <p className="tm-material__eyebrow">Up next for {sessionLabel}</p>
          {loading ? (
            <p className="tm-material__meta" role="status">Checking earlier sessions…</p>
          ) : next.length ? (
            <ol className="tm-desk__next">
              {next.map(entry => (
                <li key={entry.version.versionId}>
                  <span>
                    <strong>{materialLabel(entry.version)}</strong>
                    <small>{entry.topic} · {entry.version.pageCount} pages</small>
                  </span>
                  <button type="button" className="tm-button" onClick={() => onOpen(entry)} aria-label={`Open ${materialLabel(entry.version)} for teaching`}>
                    <BookOpen size={16} aria-hidden="true" /> Open
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="tm-material__meta">Every PDF in this session’s topics has been opened in an earlier session. The full library is below.</p>
          )}
          {more > 0 && !loading && <p className="tm-material__meta">{more} more in these topics in the library below.</p>}
        </article>
      </div>
      {modules.length > 0 && (
        <details className="tm-desk__curriculum">
          <summary>Curriculum for this session · {modules.length} {modules.length === 1 ? "module" : "modules"}</summary>
          <ol>
            {modules.map(module => (
              <li key={module.number}><span>{String(module.number).padStart(2, "0")}</span> {module.title} <small>{module.topic}</small></li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
