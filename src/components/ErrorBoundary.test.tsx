import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_LOG_KEY } from "../lib/errorReport";

const downloadBackup = vi.fn();
const loadState = vi.fn(() => ({ marker: "state" }));
vi.mock("../lib/storage", () => ({
  downloadBackup: (...args: unknown[]) => downloadBackup(...args),
  loadState: () => loadState(),
}));

import { ErrorBoundary } from "./ErrorBoundary";

// Read at render time so a boundary reset re-evaluates the child.
const state = { fail: false };
function Boom() {
  if (state.fail) throw new Error("render exploded");
  return <p>content ok</p>;
}

function fakeWindow() {
  const data = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    location: { hash: "" },
    reload: vi.fn(),
    data,
  };
}

let win: ReturnType<typeof fakeWindow>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  win = fakeWindow();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", win);
  // React reports caught render errors through console.error; keep the run quiet.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  downloadBackup.mockClear();
  state.fail = false;
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

const text = (tree: ReturnType<typeof create>) => JSON.stringify(tree.toJSON());
type Instance = ReturnType<typeof create>["root"];
const label = (node: Instance | string): string =>
  typeof node === "string" ? node : node.children.map(label).join("");
const buttonLabels = (tree: ReturnType<typeof create>) => tree.root.findAllByType("button").map(label);
const findButton = (tree: ReturnType<typeof create>, name: string) =>
  tree.root.findAllByType("button").find((button) => label(button).includes(name))!;

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<ErrorBoundary scope="view:home"><Boom /></ErrorBoundary>); });
    expect(text(tree)).toContain("content ok");
    expect(win.data.has(ERROR_LOG_KEY)).toBe(false);
    await act(async () => tree.unmount());
  });

  it("shows the recovery panel, records the error and offers a backup", async () => {
    let tree!: ReturnType<typeof create>;
    state.fail = true;
    await act(async () => { tree = create(<ErrorBoundary scope="view:practice"><Boom /></ErrorBoundary>); });
    const alert = tree.root.findByProps({ role: "alert" });
    expect(alert.props.className).toContain("error-recovery--view");
    expect(text(tree)).toContain("render exploded");
    expect(text(tree)).toContain("This view could not be shown");

    const log = JSON.parse(win.data.get(ERROR_LOG_KEY)!);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ source: "render", scope: "view:practice", message: "render exploded" });
    expect(log[0].componentStack).toContain("Boom");

    await act(async () => findButton(tree, "Download backup").props.onClick());
    expect(loadState).toHaveBeenCalled();
    expect(downloadBackup).toHaveBeenCalledWith({ marker: "state" });
    await act(async () => tree.unmount());
  });

  it("recovers on Try again and when the reset key changes", async () => {
    let tree!: ReturnType<typeof create>;
    const render = (key: string) => (
      <ErrorBoundary scope="view:x" resetKey={key}><Boom /></ErrorBoundary>
    );
    state.fail = true;
    await act(async () => { tree = create(render("a")); });
    expect(text(tree)).toContain("render exploded");

    // Try again while the cause persists shows the panel again (and logs again).
    await act(async () => findButton(tree, "Try again").props.onClick());
    expect(text(tree)).toContain("render exploded");
    expect(JSON.parse(win.data.get(ERROR_LOG_KEY)!)).toHaveLength(2);

    state.fail = false;
    await act(async () => findButton(tree, "Try again").props.onClick());
    expect(text(tree)).toContain("content ok");

    // A later failure shows the panel again; a reset-key change (the shell
    // switching tab) recovers without a click once the cause is gone.
    state.fail = true;
    await act(async () => tree.update(render("b")));
    expect(text(tree)).toContain("render exploded");
    state.fail = false;
    await act(async () => tree.update(render("b")));
    expect(text(tree)).toContain("render exploded"); // same key: stays on the panel
    await act(async () => tree.update(render("c")));
    expect(text(tree)).toContain("content ok");
    await act(async () => tree.unmount());
  });

  it("Back to Home changes the hash and resets, and Session/app variants differ", async () => {
    let tree!: ReturnType<typeof create>;
    state.fail = true;
    await act(async () => { tree = create(<ErrorBoundary scope="session-mode" variant="session"><Boom /></ErrorBoundary>); });
    expect(text(tree)).toContain("Session Mode interrupted");
    state.fail = false;
    await act(async () => findButton(tree, "Back to Home").props.onClick());
    expect(win.location.hash).toBe("dashboard");
    expect(text(tree)).toContain("content ok");
    await act(async () => tree.unmount());

    state.fail = true;
    await act(async () => { tree = create(<ErrorBoundary scope="app" variant="app"><Boom /></ErrorBoundary>); });
    const labels = buttonLabels(tree);
    expect(labels.some((item) => item.includes("Try again"))).toBe(false);
    expect(labels.some((item) => item.includes("Back to Home"))).toBe(false);
    expect(labels.some((item) => item.includes("Reload"))).toBe(true);
    await act(async () => tree.unmount());
  });
});
