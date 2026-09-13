import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./liveSession.css", import.meta.url), "utf8");

describe("14-inch Session Mode layout contract", () => {
  it("uses the viewport as a bounded live-session cockpit", () => {
    expect(css).toMatch(
      /\.live-session--running\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s
    );
    expect(css).toContain(
      "grid-template-rows: auto auto auto minmax(0, 1fr)"
    );
  });

  it("defines compact geometry for common 14-inch laptop heights", () => {
    expect(css).toContain("@media (min-width: 900px) and (max-height: 1100px)");
    expect(css).toContain("--ls-laptop-livebar-h: 64px");
    expect(css).not.toContain("--ls-laptop-stagebar-h");
    expect(css).toContain("--ls-laptop-deckbar-h: 48px");
    expect(css).toMatch(
      /@media \(min-width: 900px\) and \(max-height: 1100px\)[\s\S]*?\.live-session--running \.ls-stage-card\s*\{[^}]*grid-template-rows:\s*minmax\(0, 72px\) minmax\(0, 1fr\) 34px;/
    );
  });

  it("keeps Teach, Ask, and Answer simultaneous with independent scrolling", () => {
    expect(css).toMatch(
      /\.live-session--running \.ls-command-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(css).toMatch(
      /\.live-session--running \.ls-command-block__body\s*\{[^}]*overflow-y:\s*auto;/s
    );
  });

  it("opens Deck tools as an overlay instead of changing page height", () => {
    expect(css).toMatch(
      /\.ls-deck-tools__popover\s*\{[^}]*position:\s*absolute;/s
    );
  });

  it("keeps pacing in the existing 50px action rail and details in an overlay", () => {
    expect(css).toContain("--ls-laptop-linear-h: 50px");
    expect(css).toMatch(/\.ls-linear-control__meta\s*\{[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.ls-pacing-panel\s*\{[^}]*display:\s*grid;/s);
    expect(css).not.toMatch(/\.ls-runner\s*\{[^}]*pacing/s);
  });
});
