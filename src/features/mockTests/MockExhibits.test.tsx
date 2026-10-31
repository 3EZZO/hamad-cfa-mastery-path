import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockFigure, MockTree } from "../../lib/mockTestContent";
import { MockExhibits, MockReviewExhibits, formatTick, layoutTree, numericColumns } from "./MockExhibits";

const figure: MockFigure = {
  title: "Regression of fund returns on market returns",
  description: "Twelve points rise from lower left to upper right around a fitted line.",
  xLabel: "Market return (%)",
  yLabel: "Fund return (%)",
  xMin: -10, xMax: 10, yMin: -12, yMax: 12,
  xTicks: [-10, 0, 10],
  yTicks: [-12, 0, 12],
  series: [
    { kind: "scatter", label: "Monthly returns", tone: "primary", dashed: false, points: [{ x: -5, y: -6 }, { x: 0, y: 1 }, { x: 5, y: 6 }] },
    { kind: "line", label: "Fitted line", tone: "accent", dashed: true, points: [{ x: -10, y: -11 }, { x: 10, y: 11 }] },
    { kind: "bar", label: "Residuals", tone: "muted", dashed: false, points: [{ x: -5, y: -1 }, { x: 5, y: 1 }] },
  ],
  guides: [{ axis: "x", value: 0, label: "x = 0" }],
  markers: [{ x: 0, y: 1, label: "A" }],
};

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

let tree: ReactTestRenderer | undefined;

describe("MockExhibits", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  it("draws every series, guide and marker with a text alternative and a legend", async () => {
    await act(async () => { tree = create(<MockExhibits question={{ table: null, figure }} />); });
    const root = tree!.root;
    const svg = root.findByType("svg");
    expect(svg.props.role).toBe("img");
    expect(textOf(root.findByType("title"))).toBe(figure.title);
    expect(textOf(root.findByType("desc"))).toBe(figure.description);
    expect(root.findAllByType("polyline")).toHaveLength(1);
    // Three scatter points and one marker.
    expect(root.findAll((node) => node.type === "circle")).toHaveLength(4);
    const bars = root.find((node) => node.type === "g" && String(node.props.className ?? "").includes("is-bar"));
    expect(bars.findAllByType("rect")).toHaveLength(2);
    expect(textOf(svg)).toContain("x = 0");
    expect(textOf(svg)).toContain("A");
    expect(root.findByProps({ className: "mock-figure__legend" }).findAllByType("li").map(textOf)).toEqual([
      "Monthly returns", "Fitted line", "Residuals",
    ]);
    // Data coordinates map into the plot area (x: 58-462, y: 18-270 in SVG units).
    expect(root.findByType("polyline").props.points).toBe("58,259.5 462,28.5");
  });

  it("shows the table alongside the figure, and nothing when a question has neither", async () => {
    const table = { caption: "Data", headers: ["", "Value"], rows: [{ cells: ["Alpha", "0.0008"] }] };
    await act(async () => { tree = create(<MockExhibits question={{ table, figure }} />); });
    expect(tree!.root.findAllByType("figure")).toHaveLength(1);
    expect(tree!.root.findAllByType("table")).toHaveLength(1);
    await act(async () => { tree!.update(<MockExhibits question={{ table: null }} />); });
    expect(tree!.toJSON()).toBeNull();
  });

  it("right-aligns only columns whose filled cells are all figures", async () => {
    const table = {
      caption: "Exhibit 1",
      headers: ["Portfolio", "Value ($)", "Return (%)", "Rating", "Change"],
      rows: [
        { cells: ["Alpha", "1,000,000", "7.40%", "AA", "(2.5)"] },
        { cells: ["Beta", "$2,500,000", "−3.1", "A", "—"] },
      ],
    };
    expect(numericColumns(table)).toEqual([false, true, true, false, true]);
    await act(async () => { tree = create(<MockExhibits question={{ table, figure: null }} />); });
    const headerClasses = tree!.root.findAllByProps({ scope: "col" }).map((th) => th.props.className);
    expect(headerClasses).toEqual([undefined, "is-num", "is-num", undefined, "is-num"]);
    expect(tree!.root.findAllByType("td").filter((td) => td.props.className === "is-num")).toHaveLength(6);
  });

  it("formats tick values compactly", () => {
    expect([0, 0.5, 2.5, 1000, 0.0125, -3].map(formatTick)).toEqual(["0", "0.5", "2.5", "1000", "0.0125", "-3"]);
  });

  it("draws a supplied probability tree with every probability exactly as written and a text outline", async () => {
    const treeData: MockTree = {
      title: "Earnings and merger tree",
      description: "Growth splits three ways, each followed by merger or no merger.",
      rootLabel: "Today",
      branches: [
        { label: "Positive", probability: "0.50", note: "", children: [
          { label: "Merger", probability: "P(M | +) = 0.15", note: "", children: [] },
          { label: "No merger", probability: "0.85", note: "", children: [] },
        ] },
        { label: "Negative", probability: "0.50", note: "payoff -2", children: [] },
      ],
    };
    await act(async () => { tree = create(<MockExhibits question={{ table: null, figure: null, tree: treeData }} />); });
    const root = tree!.root;
    expect(root.findByType("svg").props.role).toBe("img");
    const probabilities = root.findAll(node => node.props.className === "mock-tree__probability").map(textOf);
    expect(probabilities).toEqual(["0.50", "P(M | +) = 0.15", "0.85", "0.50"]);
    const outline = textOf(root.findByType("figcaption"));
    expect(outline).toContain("Positive: 0.50");
    expect(outline).toContain("Negative: 0.50 (payoff -2)");
  });

  it("lays a tree out with one row per leaf and parents centred on their children", () => {
    const leaf = (label: string) => ({ label, probability: "0.5", note: "", children: [] });
    const layout = layoutTree({
      title: "t", description: "d", rootLabel: "",
      branches: [{ label: "A", probability: "0.5", note: "", children: [leaf("A1"), leaf("A2")] }, leaf("B")],
    });
    const at = (label: string) => layout.nodes.find(node => node.node.label === label)!;
    expect(layout.leaves).toBe(3);
    expect(layout.depth).toBe(2);
    expect([at("A1").y, at("A2").y, at("B").y]).toEqual([0, 1, 2]);
    expect(at("A").y).toBe(0.5);
    expect(at("A1").parentY).toBe(0.5);
    expect(at("A").parentY).toBe(1.25);
  });

  it("shows a worked review graphic only when the item has one", async () => {
    await act(async () => { tree = create(<MockReviewExhibits item={{ reviewFigure: null, reviewTree: null }} />); });
    expect(tree!.toJSON()).toBeNull();
    await act(async () => { tree!.update(<MockReviewExhibits item={{ reviewFigure: figure, reviewTree: null }} />); });
    expect(textOf(tree!.root)).toContain("Worked graphic");
  });
});
