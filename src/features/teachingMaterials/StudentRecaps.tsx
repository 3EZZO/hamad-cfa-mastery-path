import { BookOpen, ClipboardList } from "lucide-react";
import { describePages } from "./coverageModel";
import { formatRecapDate, recapTitle, requestStudentPage, type SessionRecap } from "./recapModel";

/**
 * The student's session recaps (newest first). A key page links into a PDF
 * only when that PDF is shared with them; otherwise it is plain text.
 */
export function StudentRecaps({ recaps, sharedVersionIds, onOpen }: {
  recaps: readonly SessionRecap[];
  sharedVersionIds: ReadonlySet<string>;
  onOpen: (versionId: string) => void;
}) {
  if (!recaps.length) return null;
  return (
    <section className="tm-recaps" aria-labelledby="tm-recaps-title">
      <h4 id="tm-recaps-title"><ClipboardList size={18} aria-hidden="true" /> Session recaps</h4>
      <ul>
        {recaps.map(recap => (
          <li key={recap.runId} className="tm-recap">
            <p className="tm-material__eyebrow">{recapTitle(recap)} · {formatRecapDate(recap.sentAtMs)}</p>
            {recap.covered.length > 0 && (
              <>
                <h5>What we covered</h5>
                <ul>{recap.covered.map(item => <li key={item.label}>{item.label} — {describePages(item.pages)}</li>)}</ul>
              </>
            )}
            {recap.keyPages.length > 0 && (
              <>
                <h5>Key pages</h5>
                <ul className="tm-recap__keys">
                  {recap.keyPages.map(item => (
                    <li key={`${item.versionId}:${item.page}`}>
                      {sharedVersionIds.has(item.versionId) ? (
                        <button type="button" className="tm-chip" onClick={() => { requestStudentPage(item.versionId, item.page); onOpen(item.versionId); }}>
                          <BookOpen size={14} aria-hidden="true" /> {item.label} · p. {item.page}
                        </button>
                      ) : <span>{item.label} · p. {item.page}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {recap.checks && <p><strong>Quick checks:</strong> {recap.checks.correct} of {recap.checks.total} correct</p>}
            {recap.nextStep && <p className="tm-recap__next"><strong>Before next time:</strong> {recap.nextStep}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
