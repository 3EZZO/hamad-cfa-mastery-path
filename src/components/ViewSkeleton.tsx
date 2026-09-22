/**
 * Suspense fallback for lazily loaded tracker views.
 *
 * Mirrors the panel layout so the page does not jump when the real view
 * arrives, and announces the loading state once to assistive technology.
 * Built from the existing `.skeleton-loading` shimmer styles.
 */
export function ViewSkeleton({ label = "Loading this view" }: { label?: string }) {
  return (
    <div className="view-stack view-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}…</span>
      <section className="panel skeleton-loading" aria-hidden="true">
        <span className="skeleton-text short" />
        <span className="skeleton-text long" />
        <span className="skeleton-text" />
      </section>
      <section className="panel skeleton-loading" aria-hidden="true">
        <span className="skeleton-text short" />
        <span className="skeleton-text" />
        <span className="skeleton-text long" />
        <span className="skeleton-text" />
      </section>
    </div>
  );
}
