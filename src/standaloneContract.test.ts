import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contract for the installed-app (standalone) and touch behaviour.
// These are markup/stylesheet assertions, not rendered-device evidence.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const calculatorCss = readFileSync(
  new URL("./features/practice/ba2plus.css", import.meta.url),
  "utf8",
);

describe("standalone and touch contract", () => {
  it("opts into the full viewport so safe-area insets are honoured", () => {
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
    expect(css).toMatch(/@media \(max-width: 1023px\)\s*\{[\s\S]*?\.topbar\s*\{[^}]*env\(safe-area-inset-top\)/);
    expect(css).toMatch(/\.mobile-nav\s*\{[^}]*env\(safe-area-inset-bottom\)/);
  });

  it("uses dynamic viewport units with a 100vh fallback", () => {
    expect(css).toMatch(/body\s*\{[^}]*min-height:\s*100vh/);
    expect(css).toMatch(/@supports \(height: 100dvh\)\s*\{[\s\S]*?\.app-shell\s*\{[^}]*min-height:\s*100dvh/);
    expect(css).toMatch(/\.command-palette\s*\{[^}]*max-height:\s*min\(70dvh, 560px\)/);
  });

  it("keeps toasts above the fixed bottom navigation on phones", () => {
    expect(css).toMatch(/@media \(max-width: 1023px\)\s*\{[\s\S]*?\.toast\s*\{[^}]*bottom:\s*calc\(84px \+ env\(safe-area-inset-bottom\)\)/);
  });

  it("contains overlay scrolling and disables pull-to-refresh when installed", () => {
    expect(css).toMatch(/\.mobile-more-sheet,\s*\.calendar-dialog,\s*\.command-palette__results[^{]*\{[^}]*overscroll-behavior:\s*contain/);
    expect(css).toMatch(/@media \(display-mode: standalone\)\s*\{\s*html\s*\{[^}]*overscroll-behavior-y:\s*none/);
  });

  it("gives controls finger-sized targets without tap delay on touch devices", () => {
    expect(css).toMatch(/button,\s*summary,\s*a,[\s\S]*?\{[^}]*touch-action:\s*manipulation/);
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{[\s\S]*?\.icon-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{[\s\S]*?\.button,[\s\S]*?min-height:\s*44px/);
    expect(calculatorCss).toMatch(/@media \(pointer: coarse\)\s*\{\s*\.ba-key\s*\{[^}]*height:\s*44px/);
  });
});
