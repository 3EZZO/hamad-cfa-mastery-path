import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { StageCard } from "./StageCard";
import { ReferenceDrawer } from "./ReferenceDrawer";
import { EvidenceRepairFlow } from "./EvidenceRepairFlow";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";

function luminance(hex: string) { const rgb = hex.match(/[0-9a-f]{2}/gi)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722; }
function contrast(a: string, b: string) { const l = [luminance(a), luminance(b)].sort((x, y) => y - x); return (l[0]! + .05) / (l[1]! + .05); }

describe("P7 accessibility source and markup", () => {
  it("meets text contrast for the authored key surface/semantic pairs", () => {
    for (const [text, surface] of [["132c44", "ffffff"], ["315fce", "ffffff"], ["5b6d80", "f3f6fa"], ["066570", "f3f6fa"], ["0f704c", "e2f6ed"], ["8a5408", "fff2d5"], ["b23b4a", "fee9ed"], ["076b6c", "eff8f7"], ["554987", "f1f2fb"], ["273c50", "f2f3fb"], ["583806", "fff2d5"], ["422b68", "eee8f6"]]) expect(contrast(text!, surface!), `${text}/${surface}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast("315fce", "ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrast("dceef4", "132c44")).toBeGreaterThanOrEqual(3);
    const css = readFileSync(new URL("./liveSession.css", import.meta.url), "utf8");
    expect(css).toContain("--ls-green: #0f704c"); expect(css).toContain("--ls-amber: #8a5408");
    expect(css).toContain(".ls-command-block__body:focus-visible");
  });
  it("uses unique heading IDs and names each keyboard-scrollable reading region", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(1)); const stage = book.stagesByRoute[book.routes[0]!.id]![0]!;
    const card = <StageCard stage={stage} question={stage.questions![0]} questionIndex={0} flowStep="teach" complete={false} onFlowStepChange={() => {}} />;
    const html = renderToStaticMarkup(<>{card}{card}</>);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html.match(/tabindex="0" role="region" aria-labelledby=/g)).toHaveLength(6);
  });
  it("names reference search and associates evidence validation with the field", () => {
    const refs = renderToStaticMarkup(<ReferenceDrawer open references={[]} onClose={() => {}} />);
    expect(refs).toContain('aria-label="Search references"');
    const html = renderToStaticMarkup(<EvidenceRepairFlow targetLabel="Fixture" value={{ verdict: "parked", confidence: 3, errorCodes: [], note: "" }} onChange={() => {}} onRecord={() => {}} />);
    expect(html).toMatch(/<textarea[^>]*aria-required="true"[^>]*aria-describedby=/);
    expect(html).toContain("Record why this item is deferred.");
  });
  it("uses the shared focus controller for calendar and mobile navigation dialogs", () => {
    const calendar = readFileSync(new URL("../../components/CalendarExportDialog.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
    expect(calendar).toContain("useDialogFocus(open, dialogRef, firstFieldRef, onClose)");
    expect(app).toContain("useDialogFocus(mobileMoreOpen, mobileDialogRef, mobileCloseRef");
  });
});
