import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TopicGroup } from "./TopicGroup";

describe("TopicGroup", () => {
  it("exposes the expanded state and hides a collapsed list", () => {
    const open = renderToStaticMarkup(<TopicGroup topic="Economics" count={2} open onToggle={() => undefined}><ul><li>PDF</li></ul></TopicGroup>);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("2 PDFs");
    expect(open).not.toContain(' hidden=""');

    const closed = renderToStaticMarkup(<TopicGroup topic="Economics" count={1} open={false} onToggle={() => undefined}><ul><li>PDF</li></ul></TopicGroup>);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain("1 PDF<");
    expect(closed).toMatch(/class="tm-topic-group__body" hidden=""/);
    const controls = closed.match(/aria-controls="([^"]+)"/)?.[1];
    expect(closed).toContain(`id="${controls}"`);
  });
});
