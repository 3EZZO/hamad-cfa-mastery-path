import type { MouseEvent } from "react";

/**
 * Thin page strip under the reader toolbar: pages taught in this session,
 * pages taught in earlier sessions and the current page. Clicking jumps to a
 * page; keyboard users keep the page field, so the strip is not a tab stop.
 */
export function CoverageStrip({ pageCount, page, thisSession, earlier, onJump }: {
  pageCount: number;
  page: number;
  thisSession: ReadonlySet<number>;
  earlier: ReadonlySet<number>;
  onJump: (page: number) => void;
}) {
  if (pageCount < 1) return null;
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const taughtAny = pages.filter(item => thisSession.has(item) || earlier.has(item)).length;
  const jump = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    onJump(Math.min(pageCount, Math.max(1, Math.floor(((event.clientX - box.left) / box.width) * pageCount) + 1)));
  };
  return (
    <div className="tm-coverage">
      <div className="tm-coverage__track" onClick={jump} title="Pages taught. Click to jump to a page." aria-hidden="true">
        {pages.map(item => (
          <span key={item} className={`tm-coverage__page${thisSession.has(item) ? " is-now" : earlier.has(item) ? " is-earlier" : ""}${item === page ? " is-current" : ""}`} />
        ))}
      </div>
      <span className="tm-coverage__label">
        {thisSession.size} taught this session · {taughtAny} of {pageCount} overall
      </span>
    </div>
  );
}
