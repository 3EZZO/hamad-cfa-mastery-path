import { useEffect } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setShellBusy } from "../lib/shellBusy";
import { buildHash, parseHash } from "../lib/hashRoute";
import { PracticeHubView, practiceSectionFor, practiceSectionSegment, practiceTestModule } from "./PracticeHubView";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

describe("practice sections from the hash", () => {
  it("maps sections, test deep links and intents", () => {
    expect(practiceSectionFor("")).toBe("practise");
    expect(practiceSectionFor("quick5")).toBe("practise");
    expect(practiceSectionFor("module-m001-returns")).toBe("practise");
    expect(practiceSectionFor("mistakes")).toBe("mistakes");
    expect(practiceSectionFor("tests")).toBe("tests");
    expect(practiceSectionFor("tests-m01-rates-and-returns")).toBe("tests");
    expect(practiceTestModule("tests-m01-rates-and-returns")).toBe("m01-rates-and-returns");
    expect(practiceTestModule("tests")).toBe("");
    expect(practiceSectionSegment("practise")).toBe("");
    // Every section segment survives the hash grammar.
    for (const segment of ["mistakes", "tests", "tests-m01-rates-and-returns"]) {
      expect(parseHash(buildHash("practice", segment)).segment).toBe(segment);
    }
  });
});

describe("Practice hub", () => {
  const mounts = { tests: 0, unmounts: 0 };
  const trees: Array<ReturnType<typeof create>> = [];
  const mount = async (node: ReturnType<typeof element>) => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(node); });
    trees.push(tree);
    return tree;
  };
  function TestsProbe() {
    useEffect(() => {
      mounts.tests += 1;
      return () => { mounts.unmounts += 1; };
    }, []);
    return <p>Module tests body</p>;
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mounts.tests = 0;
    mounts.unmounts = 0;
  });
  afterEach(async () => {
    await act(async () => setShellBusy(null));
    for (const tree of trees.splice(0)) await act(async () => tree.unmount());
    vi.unstubAllGlobals();
  });

  const element = (segment: string, onSegment = vi.fn()) => (
    <PracticeHubView
      segment={segment}
      onSegment={onSegment}
      dueRetests={2}
      practise={<p>Coach body</p>}
      mistakes={<p>Vault body</p>}
      tests={<TestsProbe />}
    />
  );

  it("switches sections through the hash segment and shows the due count", async () => {
    const onSegment = vi.fn();
    const tree = await mount(element("", onSegment));
    const panel = () => textOf(tree.root.findByProps({ role: "tabpanel" }));
    expect(panel()).toBe("Coach body");
    const tabs = tree.root.findAllByProps({ role: "tab" });
    expect(textOf(tabs[1])).toBe("Mistakes2");
    await act(async () => tabs[1].props.onClick());
    expect(onSegment).toHaveBeenCalledWith("mistakes");
    await act(async () => tree.update(element("mistakes", onSegment)));
    expect(panel()).toBe("Vault body");
    await act(async () => tree.root.findAllByProps({ role: "tab" })[0].props.onClick());
    expect(onSegment).toHaveBeenLastCalledWith("");
  });

  it("keeps a running module test mounted and locks the sections", async () => {
    const tree = await mount(element("tests"));
    expect(mounts.tests).toBe(1);
    await act(async () => setShellBusy("mock"));
    expect(tree.root.findAllByProps({ role: "tab" }).every((tab) => tab.props.disabled)).toBe(true);
    // Even if the hash changes (back button), the test stays mounted, hidden.
    await act(async () => tree.update(element("")));
    expect(mounts.unmounts).toBe(0);
    await act(async () => setShellBusy(null));
    expect(mounts.unmounts).toBe(1);
  });

  it("locks the sections during a practice run", async () => {
    const tree = await mount(element(""));
    await act(async () => setShellBusy("practice"));
    expect(tree.root.findAllByProps({ role: "tab" }).every((tab) => tab.props.disabled)).toBe(true);
  });
});
