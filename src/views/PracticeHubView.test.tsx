import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setShellBusy } from "../lib/shellBusy";
import { buildHash, parseHash } from "../lib/hashRoute";
import { PracticeHubView, practiceSectionFor, practiceSectionSegment } from "./PracticeHubView";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

describe("practice sections from the hash", () => {
  it("maps Mistakes and leaves intents to Practise", () => {
    expect(practiceSectionFor("")).toBe("practise");
    expect(practiceSectionFor("quick5")).toBe("practise");
    expect(practiceSectionFor("module-m001-returns")).toBe("practise");
    expect(practiceSectionFor("mistakes")).toBe("mistakes");
    expect(practiceSectionSegment("practise")).toBe("");
    expect(parseHash(buildHash("practice", "mistakes")).segment).toBe("mistakes");
  });
});

describe("Practice hub", () => {
  const trees: Array<ReturnType<typeof create>> = [];
  const element = (segment: string, onSegment = vi.fn()) => (
    <PracticeHubView segment={segment} onSegment={onSegment} dueRetests={2} practise={<p>Coach body</p>} mistakes={<p>Vault body</p>} />
  );
  const mount = async (node: ReturnType<typeof element>) => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(node); });
    trees.push(tree);
    return tree;
  };

  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => {
    await act(async () => setShellBusy(null));
    for (const tree of trees.splice(0)) await act(async () => tree.unmount());
    vi.unstubAllGlobals();
  });

  it("switches sections through the hash segment and shows the due count", async () => {
    const onSegment = vi.fn();
    const tree = await mount(element("", onSegment));
    const panel = () => textOf(tree.root.findByProps({ role: "tabpanel" }));
    expect(panel()).toBe("Coach body");
    const tabs = tree.root.findAllByProps({ role: "tab" });
    expect(tabs.map((tab) => textOf(tab))).toEqual(["Practise", "Mistakes2"]);
    await act(async () => tabs[1].props.onClick());
    expect(onSegment).toHaveBeenCalledWith("mistakes");
    await act(async () => tree.update(element("mistakes", onSegment)));
    expect(panel()).toBe("Vault body");
    await act(async () => tree.root.findAllByProps({ role: "tab" })[0].props.onClick());
    expect(onSegment).toHaveBeenLastCalledWith("");
  });

  it("locks the sections during a practice run", async () => {
    const tree = await mount(element(""));
    await act(async () => setShellBusy("practice"));
    expect(tree.root.findAllByProps({ role: "tab" }).every((tab) => tab.props.disabled)).toBe(true);
  });
});
