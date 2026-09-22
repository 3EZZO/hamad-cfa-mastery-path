import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusableElements, useDialogFocus } from "./useDialogFocus";

// Deliberately a DOM model, not a claim of rendered-browser verification.
class ElementModel {
  parentElement: ElementModel | null = null;
  children: ElementModel[] = [];
  attrs: Record<string, string> = {};
  style = { display: "block", visibility: "visible" };
  tabIndex = 0;
  isConnected = true;
  constructor(public tagName = "BUTTON") {}
  add(child: ElementModel) { child.parentElement = this; this.children.push(child); return child; }
  contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
  hasAttribute(name: string) { return name in this.attrs; }
  matches() { return this.hasAttribute("disabled"); }
  closest(): ElementModel | null {
    if (this.hasAttribute("hidden") || this.hasAttribute("inert") || this.attrs["aria-hidden"] === "true") return this;
    return this.parentElement ? this.parentElement.closest() : null;
  }
  querySelector() { return this.children.find(child => child.tagName === "SUMMARY") ?? null; }
  querySelectorAll(): ElementModel[] { return this.children.flatMap(child => [...(["BUTTON", "INPUT", "SUMMARY"].includes(child.tagName) ? [child] : []), ...child.querySelectorAll()]); }
  focus() { doc.activeElement = this; }
}
const listeners = new Map<string, Set<(event: any) => void>>();
const doc = { activeElement: null as ElementModel | null, addEventListener: (name: string, fn: (event: any) => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); }, removeEventListener: (name: string, fn: (event: any) => void) => listeners.get(name)?.delete(fn) };
const ref = (node: ElementModel) => ({ current: node as unknown as HTMLElement });
function Trap({ open = true, dialog, initial, close }: { open?: boolean; dialog: ReturnType<typeof ref>; initial: ReturnType<typeof ref>; close: () => void }) { useDialogFocus(open, dialog, initial, close); return null; }
function dispatch(name: string, data: Record<string, unknown>) { const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), ...data }; for (const fn of [...listeners.get(name) ?? []]) fn(event); return event; }
let tree: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("HTMLElement", ElementModel); vi.stubGlobal("document", doc); vi.stubGlobal("window", { getComputedStyle: (node: ElementModel) => node.style }); });
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; listeners.clear(); vi.unstubAllGlobals(); });

describe("P7 dialog focus controller", () => {
  it("excludes hidden/inert/closed-details descendants and disabled/negative-tab elements", () => {
    const dialog = new ElementModel("SECTION"); const visible = dialog.add(new ElementModel());
    for (const attr of ["hidden", "inert", "aria-hidden"]) { const parent = dialog.add(new ElementModel("DIV")); parent.attrs[attr] = "true"; parent.add(new ElementModel()); }
    const collapsed = dialog.add(new ElementModel("DIV")); collapsed.style.display = "none"; collapsed.add(new ElementModel());
    const negative = dialog.add(new ElementModel()); negative.tabIndex = -1;
    const disabled = dialog.add(new ElementModel()); disabled.attrs.disabled = "";
    const details = dialog.add(new ElementModel("DETAILS")); const summary = details.add(new ElementModel("SUMMARY")); details.add(new ElementModel());
    expect(focusableElements(dialog as unknown as HTMLElement)).toEqual([visible, summary]);
  });
  it("cycles Tab/Shift-Tab, catches escaped focus and restores the opener", async () => {
    const opener = new ElementModel(); opener.focus();
    const dialog = new ElementModel("SECTION"), first = dialog.add(new ElementModel()), last = dialog.add(new ElementModel());
    await act(async () => { tree = create(<Trap dialog={ref(dialog)} initial={ref(first)} close={vi.fn()} />); });
    expect(doc.activeElement).toBe(first);
    dispatch("keydown", { key: "Tab", shiftKey: true }); expect(doc.activeElement).toBe(last);
    dispatch("keydown", { key: "Tab", shiftKey: false }); expect(doc.activeElement).toBe(first);
    opener.focus(); dispatch("focusin", { target: opener }); expect(doc.activeElement).toBe(first);
    await act(async () => tree!.unmount()); tree = undefined; expect(doc.activeElement).toBe(opener);
  });
  it("only the topmost modal handles Escape and returns focus to its parent", async () => {
    const opener = new ElementModel(); opener.focus();
    const outer = new ElementModel("SECTION"), inner = new ElementModel("SECTION");
    const outerButton = outer.add(new ElementModel()), innerButton = inner.add(new ElementModel());
    const a = { dialog: ref(outer), initial: ref(outerButton), close: vi.fn() };
    const b = { dialog: ref(inner), initial: ref(innerButton), close: vi.fn() };
    await act(async () => { tree = create(<><Trap {...a} /><Trap {...b} /></>); });
    dispatch("keydown", { key: "Escape" }); expect(b.close).toHaveBeenCalledTimes(1); expect(a.close).not.toHaveBeenCalled();
    await act(async () => tree!.update(<><Trap {...a} /></>));
    expect(doc.activeElement).toBe(outerButton);
    dispatch("keydown", { key: "Escape" }); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it("timer-driven rerenders do not reset current keyboard focus", async () => {
    const dialog = new ElementModel("SECTION"), first = dialog.add(new ElementModel()), last = dialog.add(new ElementModel());
    const props = { dialog: ref(dialog), initial: ref(first), close: vi.fn() };
    await act(async () => { tree = create(<Trap {...props} />); }); last.focus();
    await act(async () => tree!.update(<Trap {...props} close={vi.fn()} />)); expect(doc.activeElement).toBe(last);
  });
});
