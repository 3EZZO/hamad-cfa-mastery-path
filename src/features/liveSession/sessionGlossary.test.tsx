import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SESSION_TERMS, SessionCountLegend, libraryDeckCount } from "./sessionGlossary";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";

describe("session count glossary", () => {
  it("defines all six distinct counts and does not equate coverage with mastery", () => {
    const html = renderToStaticMarkup(<SessionCountLegend counts={{ library: 120, route: 60, queue: 48, target: 45, covered: 3, proofs: "1 / 30 recorded" }} />);
    for (const term of Object.values(SESSION_TERMS)) expect(html).toContain(term.label);
    expect(html).toContain("Covered does not mean mastered");
    expect(html).toContain("1 / 30 recorded");
    expect(html).toContain("<summary>");
  });
  it("uses the full library count rather than the selected 48/60-deck route", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(2));
    expect(libraryDeckCount(book)).toBe(120);
  });
});
