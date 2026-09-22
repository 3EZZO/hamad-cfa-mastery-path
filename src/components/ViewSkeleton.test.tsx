import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ViewSkeleton } from "./ViewSkeleton";

describe("ViewSkeleton", () => {
  it("announces loading once and hides the shimmer panels from assistive technology", () => {
    const html = renderToStaticMarkup(<ViewSkeleton />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('class="visually-hidden">Loading this view…');
    expect(html.match(/class="panel skeleton-loading" aria-hidden="true"/g)).toHaveLength(2);
    expect(html).not.toContain("<button");
  });

  it("accepts a view-specific label", () => {
    expect(renderToStaticMarkup(<ViewSkeleton label="Opening Practice" />)).toContain("Opening Practice…");
  });
});
