import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHash, parseHash, resolveLegacyRoute } from "../lib/hashRoute";
import { PlanView, parsePlanSegment, planSegment } from "./PlanView";
import { practiceSectionFor, practiceTestModule } from "./PracticeHubView";
import { parseProgressSection } from "./ProgressView";

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

describe("plan segments", () => {
  it("parse and build every section", () => {
    expect(parsePlanSegment("")).toEqual({ section: "week", week: null });
    expect(parsePlanSegment("week-7")).toEqual({ section: "week", week: 7 });
    expect(parsePlanSegment("week-99")).toEqual({ section: "week", week: null });
    expect(parsePlanSegment("roadmap")).toEqual({ section: "roadmap", week: null });
    expect(parsePlanSegment("roadmap-week-12")).toEqual({ section: "roadmap", week: 12 });
    expect(parsePlanSegment("sessions")).toEqual({ section: "sessions", week: null });
    expect(planSegment("week", 7)).toBe("week-7");
    expect(planSegment("roadmap", 12)).toBe("roadmap-week-12");
    expect(planSegment("roadmap")).toBe("roadmap");
    expect(planSegment("sessions", 3)).toBe("sessions");
  });
});

describe("every retired link lands on the right section", () => {
  const land = (hash: string) => {
    const moved = resolveLegacyRoute(parseHash(hash))!;
    // Through the hash grammar, as the browser would carry it.
    const route = parseHash(buildHash(moved.tab, moved.segment));
    return route;
  };

  it("Plan links", () => {
    expect(parsePlanSegment(land("#weekly/week-7").segment)).toEqual({ section: "week", week: 7 });
    expect(parsePlanSegment(land("#weekly").segment)).toEqual({ section: "week", week: null });
    expect(parsePlanSegment(land("#roadmap/week-12").segment)).toEqual({ section: "roadmap", week: 12 });
    expect(parsePlanSegment(land("#sessions").segment)).toEqual({ section: "sessions", week: null });
  });

  it("Practice links", () => {
    expect(practiceSectionFor(land("#errors").segment)).toBe("mistakes");
    const test = land("#moduleMocks/m03-statistical-measures");
    expect(test.tab).toBe("practice");
    expect(practiceSectionFor(test.segment)).toBe("tests");
    expect(practiceTestModule(test.segment)).toBe("m03-statistical-measures");
  });

  it("Progress links", () => {
    expect(parseProgressSection(land("#mastery").segment)).toBe("topics");
    expect(parseProgressSection(land("#mocks").segment)).toBe("mocks");
  });
});

describe("Plan view", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the chosen section and reports changes", async () => {
    const onSection = vi.fn();
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<PlanView section="roadmap" onSection={onSection} week={<p>Week body</p>} roadmap={<p>Roadmap body</p>} sessions={<p>Sessions body</p>} />);
    });
    expect(textOf(tree.root.findByProps({ role: "tabpanel" }))).toBe("Roadmap body");
    const tabs = tree.root.findAllByProps({ role: "tab" });
    expect(tabs.map((tab) => textOf(tab))).toEqual(["This week", "Full plan", "Session notes"]);
    await act(async () => tabs[2].props.onClick());
    expect(onSection).toHaveBeenCalledWith("sessions");
    await act(async () => tree.unmount());
  });
});
