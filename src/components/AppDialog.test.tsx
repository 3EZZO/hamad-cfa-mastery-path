import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { AppDialogProvider, useAppDialog } from "./AppDialog";

vi.mock("../features/liveSession/useDialogFocus", () => ({ useDialogFocus: vi.fn() }));
let tree: ReactTestRenderer;
let api: ReturnType<typeof useAppDialog>;
function Consumer({ scope = "one" }: { scope?: string }) { api = useAppDialog(scope); return null; }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); vi.unstubAllGlobals(); });
async function setup() { await act(async () => { tree = create(<AppDialogProvider><Consumer /></AppDialogProvider>); }); }
async function cancel() { await act(async () => { tree.root.findAllByType("button").find(node => node.children.includes("Cancel"))!.props.onClick(); }); }
async function submit() { await act(async () => { tree.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }); }); }

describe("P3 styled decisions", () => {
  it("requires explicit acceptance and exposes the complete message", async () => {
    await setup(); let result!: Promise<boolean>;
    await act(async () => { result = api.confirm("Replace shared progress on every device?"); });
    expect(tree.root.findByProps({ id: "app-decision-message" }).children.join("")).toContain("every device");
    expect(tree.root.findByProps({ role: "dialog" }).props["aria-modal"]).toBe("true");
    await submit(); expect(await result).toBe(true);
    expect(tree.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  });
  it("cancels without authorizing the operation", async () => {
    await setup(); let result!: Promise<boolean>;
    await act(async () => { result = api.confirm("Delete this note?"); });
    await cancel(); expect(await result).toBe(false);
  });
  it("preserves prompt defaults, exact typed text and null cancellation", async () => {
    await setup(); let result!: Promise<string | null>;
    await act(async () => { result = api.prompt("Confirmation", "Initial response"); });
    expect(tree.root.findByType("input").props.value).toBe("Initial response");
    await act(async () => tree.root.findByType("input").props.onChange({ target: { value: "RESET HAMAD MASTERY" } }));
    await submit(); expect(await result).toBe("RESET HAMAD MASTERY");
    await act(async () => { result = api.prompt("Confirmation"); });
    await cancel(); expect(await result).toBeNull();
  });
  it("settles a pending decision safely when its view unmounts", async () => {
    await setup(); let result!: Promise<boolean>;
    await act(async () => { result = api.confirm("Delete?"); });
    await act(async () => tree.update(<AppDialogProvider>{null}</AppDialogProvider>));
    expect(await result).toBe(false);
    expect(tree.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  });
  it("cancels when navigation or account scope changes", async () => {
    await setup(); const previous = api; let result!: Promise<string | null>;
    await act(async () => { result = api.prompt("Return request?"); });
    await act(async () => tree.update(<AppDialogProvider><Consumer scope="two" /></AppDialogProvider>));
    expect(await result).toBeNull(); expect(previous.active()).toBe(false);
  });
  // The shell and the views it was split into (P3.9); the contract spans all of them.
  const appSource = () =>
    ["../App.tsx", "../auth/screens.tsx", "../views/shared.tsx", ...readdirSync(new URL("../views", import.meta.url)).filter(file => file.endsWith("View.tsx")).map(file => `../views/${file}`)]
      .map(file => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");
  it("preserves reset safeguards and replaces all native decision calls", () => {
    const app = appSource();
    expect(app).not.toMatch(/window\.(?:confirm|prompt)\(/);
    expect(app.match(/await dialog\.(?:confirm|prompt)\(/g)).toHaveLength(11);
    expect(app).toContain('confirmation !== "RESET HAMAD MASTERY"');
    expect(app.indexOf("downloadBackup(tracker);", app.indexOf("const resetSharedProgress"))).toBeLessThan(app.indexOf("await replaceTrackerAuthoritatively(createDefaultState())"));
  });
  it("applies approved rescheduling to current overrides, not a pre-dialog snapshot", () => {
    const app = appSource();
    const handler = app.slice(app.indexOf("const submitReschedule"), app.indexOf("const restoreSchedule"));
    const approved = handler.slice(handler.indexOf("await dialog.confirm(summary)"));
    expect(approved).toMatch(/updateTracker\(\(current\) => \(\{[\s\S]*sessionOverrides: cascadeReschedule\(\s*current\.sessionOverrides,/);
    expect(approved).not.toContain("sessionOverrides: result.overrides");
  });
});
