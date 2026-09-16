import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./sessionPilot.css", import.meta.url), "utf8");

describe("Session Mode teaching-focus layout", () => {
  it("uses a compact distributed command bar", () => {
    expect(css).toContain("--ls-focus-livebar-h: 48px");
    expect(css).toMatch(
      /\.ls-runner\[data-focus="true"\] \.ls-livebar\s*\{[^}]*grid-template-columns:\s*auto minmax\(360px, 560px\) auto;[^}]*max-height:\s*var\(--ls-focus-livebar-h\);/s
    );
    expect(css).toMatch(
      /\.ls-runner\[data-focus="true"\] \.ls-clock\s*\{[^}]*flex-direction:\s*row;/s
    );
  });

  it("reserves the viewport remainder for the teaching workplane", () => {
    expect(css).toMatch(
      /\.ls-runner\[data-focus="true"\] \.ls-runner__grid\s*\{[^}]*height:\s*100%;[^}]*padding:\s*4px 8px 0;/s
    );
    expect(css).toMatch(
      /\.ls-runner\[data-focus="true"\] \.ls-coaching-drawer\s*\{[^}]*align-self:\s*end;/s
    );
  });
});
