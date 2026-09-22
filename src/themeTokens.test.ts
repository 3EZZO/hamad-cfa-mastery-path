import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contract for the design tokens: every custom property a sheet reads
// must be declared by some sheet (or come from JS / carry a fallback).
// A `var(--x)` with no declaration makes the whole declaration invalid at
// computed-value time, and the browser drops it silently.
const SHEETS = [
  "./styles.css",
  "./theme.css",
  "./features/liveSession/liveSession.css",
  "./features/practice/practiceCoach.css",
  "./features/practice/ba2plus.css",
  "./features/payments/payments.css",
] as const;

/** Set from inline `style` in a component, never from a stylesheet. */
const SET_FROM_JS = new Set(["--slider-fill", "--readiness"]);

const sources = Object.fromEntries(
  SHEETS.map(sheet => [sheet, readFileSync(new URL(sheet, import.meta.url), "utf8")]),
) as Record<(typeof SHEETS)[number], string>;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Names declared anywhere (`--x:`), ignoring the `var(--x` reads. */
function declaredNames(css: string): Set<string> {
  const withoutReads = stripComments(css).replace(/var\(\s*--[\w-]+/g, "");
  return new Set(Array.from(withoutReads.matchAll(/(--[\w-]+)\s*:/g), match => match[1]!));
}

/** Each `var()` read with whether it carries a fallback. */
function reads(css: string): Array<{ name: string; fallback: boolean }> {
  return Array.from(
    stripComments(css).matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g),
    match => ({ name: match[1]!, fallback: match[2] === "," }),
  );
}

/** Declarations inside `html:root[data-theme="dark"] { … }` only. */
function darkRootNames(css: string): Set<string> {
  const block = stripComments(css).match(/html:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
  return new Set(Array.from(block?.[1]?.matchAll(/(--[\w-]+)\s*:/g) ?? [], match => match[1]!));
}

const declared = new Set(SHEETS.flatMap(sheet => Array.from(declaredNames(sources[sheet]))));

describe("theme tokens", () => {
  it("declares every custom property that a sheet reads without a fallback", () => {
    const missing = SHEETS.flatMap(sheet =>
      reads(sources[sheet])
        .filter(read => !read.fallback && !declared.has(read.name) && !SET_FROM_JS.has(read.name))
        .map(read => `${sheet}: ${read.name}`),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the semantic aliases in the light root and their literal overrides in dark", () => {
    const light = sources["./styles.css"];
    expect(light).toMatch(/:root\s*\{[^}]*--text-main:\s*var\(--ink\);/);
    expect(light).toMatch(/:root\s*\{[^}]*--text-muted:\s*var\(--muted\);/);
    expect(light).toMatch(/:root\s*\{[^}]*--line:\s*var\(--border\);/);
    expect(light).toMatch(/:root\s*\{[^}]*--surface-3:\s*#eef2f6;/);
    expect(light).toMatch(/:root\s*\{[^}]*--surface-floating:\s*rgba\(255, 255, 255, 0\.92\);/);
    const dark = darkRootNames(sources["./theme.css"]);
    expect(dark.has("--surface-3")).toBe(true);
    expect(dark.has("--surface-floating")).toBe(true);
    // Aliases follow their targets; redefining them in dark would fork the palette.
    expect(dark.has("--text-main")).toBe(false);
    expect(dark.has("--text-muted")).toBe(false);
    expect(dark.has("--line")).toBe(false);
  });

  it("declares the light tracker tokens in one :root block", () => {
    const blocks = stripComments(sources["./styles.css"]).match(/^:root\s*\{/gm) ?? [];
    expect(blocks).toHaveLength(1);
    // The values the second block used to override are now the only ones.
    expect(sources["./styles.css"]).toMatch(/:root\s*\{[^}]*--paper:\s*#eef2f6;[^}]*--surface-2:\s*#f6f8fb;[^}]*--border:\s*#d5dee8;/);
  });

  it("only overrides tracker tokens in dark mode that the light root declares", () => {
    const lightRoot = new Set(
      Array.from(stripComments(sources["./styles.css"]).matchAll(/:root\s*\{([^}]*)\}/g))
        .flatMap(block => Array.from(block[1]!.matchAll(/(--[\w-]+)\s*:/g), match => match[1]!)),
    );
    // Session Mode, chart and glass tokens are dark-only by design; the rest
    // must exist in light so the theme toggle never leaves a value undefined.
    const darkOnlyByDesign = /^--(ls-|theme-|chart-|surface-blur|surface-(base|raised|floating|overlay|modal)-)/;
    const orphaned = Array.from(darkRootNames(sources["./theme.css"]))
      .filter(name => !lightRoot.has(name) && !darkOnlyByDesign.test(name));
    expect(orphaned).toEqual([]);
  });
});
