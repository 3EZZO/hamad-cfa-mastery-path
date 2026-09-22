import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpdateToast from "./UpdateToast";
import { setShellBusy } from "../lib/shellBusy";

// DOM-model test: a fake registration and service-worker container stand in
// for the browser; what is proven is the toast's state, not a real reload.
let tree: ReactTestRenderer | undefined;
let updateFound: (() => void) | undefined;
let controllerChange: (() => void) | undefined;
let stateChange: (() => void) | undefined;
const reload = vi.fn();
const installing = {
  state: "installing",
  postMessage: vi.fn(),
  addEventListener: (_type: string, listener: () => void) => { stateChange = listener; },
};
const registration = {
  waiting: null,
  installing,
  addEventListener: (_type: string, listener: () => void) => { updateFound = listener; },
} as unknown as ServiceWorkerRegistration;

beforeEach(() => {
  reload.mockReset();
  installing.postMessage.mockReset();
  installing.state = "installing";
  setShellBusy(null);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: {},
      addEventListener: (_type: string, listener: () => void) => { controllerChange = listener; },
      removeEventListener: vi.fn(),
    },
  });
  vi.stubGlobal("window", { location: { reload } });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  setShellBusy(null);
  vi.unstubAllGlobals();
});

const text = () => JSON.stringify(tree!.toJSON());
const button = (label: string) =>
  tree!.root.findAllByType("button").find(node =>
    node.props["aria-label"] === label || node.children.some(child => typeof child === "string" && child.includes(label)),
  )!;

async function mount() {
  await act(async () => {
    tree = create(<UpdateToast registration={Promise.resolve(registration)} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function installUpdate() {
  await act(async () => {
    updateFound!();
    installing.state = "installed";
    stateChange!();
  });
}

describe("UpdateToast", () => {
  it("stays hidden until a new worker is waiting, then reloads on request", async () => {
    await mount();
    expect(tree!.toJSON()).toBeNull();
    await installUpdate();
    expect(text()).toContain("Update ready");
    await act(async () => button("Reload").props.onClick());
    expect(installing.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(text()).toContain("Updating");
    await act(async () => controllerChange!());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("defers the prompt while a session or practice run is busy and shows it afterwards", async () => {
    setShellBusy("session");
    await mount();
    await installUpdate();
    expect(tree!.toJSON()).toBeNull();
    await act(async () => setShellBusy(null));
    expect(text()).toContain("Update ready");
    await act(async () => setShellBusy("practice"));
    expect(tree!.toJSON()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("can be put off for later without reloading", async () => {
    await mount();
    await installUpdate();
    await act(async () => button("Update later").props.onClick());
    expect(tree!.toJSON()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});
