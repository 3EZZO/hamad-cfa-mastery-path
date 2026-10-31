import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaperBreakdownView } from "./PaperBreakdownView";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

describe("Mock exam results breakdown", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("groups by module test when the paper has them, with practice links", async () => {
    await act(async () => {
      tree = create(<PaperBreakdownView
        keyDoc={{ modules: ["m01-rates-and-returns", "m01-rates-and-returns"], catalogIds: ["cfa-2027-outline-m001", "cfa-2027-outline-m002"], skills: ["calculation", "concept"] }}
        answers={[0, 1]} correct={[true, false]} onPractise={vi.fn()}
      />);
    });
    const root = tree!.root;
    expect(textOf(root.findAllByType("caption")[0]!)).toBe("Module tests");
    expect(root.findAll(node => node.type === "button" && textOf(node) === "Practise")).toHaveLength(1);
  });

  it("falls back to the official 2027 modules for a topic without module tests, without practice links", async () => {
    await act(async () => {
      tree = create(<PaperBreakdownView
        keyDoc={{ catalogIds: ["cfa-2027-outline-m056", "cfa-2027-outline-m056"], skills: ["concept", "concept"] }}
        answers={[0, null]} correct={[false, false]} onPractise={vi.fn()}
      />);
    });
    const root = tree!.root;
    expect(textOf(root.findAllByType("caption")[0]!)).toBe("Official 2027 curriculum modules");
    expect(textOf(root)).toContain("0 / 2");
    expect(root.findAll(node => node.type === "button" && textOf(node) === "Practise")).toHaveLength(0);
  });
});
