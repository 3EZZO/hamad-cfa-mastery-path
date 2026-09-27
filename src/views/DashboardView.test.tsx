import { act, create, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanTasks, PLAN } from "../data/plan";
import { createDefaultState } from "../lib/storage";
import type { TrackerState } from "../types";

const sources = vi.hoisted(() => ({
  value: {
    dueReviews: null as number | null,
    pendingModuleTests: null as null | Array<{ moduleId: string; title: string; deadline: string | null; inProgress?: boolean }>,
    moduleTestProgress: null as null | { published: number; completed: number },
  },
}));
vi.mock("../hooks/useTodaySources", () => ({ useTodaySources: () => sources.value }));

import { DashboardView } from "./DashboardView";

const TODAY = "2026-09-27"; // Week 4

function upToDate(): TrackerState {
  const state = createDefaultState();
  for (const week of PLAN.slice(0, 3)) {
    for (const task of getPlanTasks(week)) {
      if (task.kind === "session") {
        const requestedAt = "2026-09-01T00:00:00.000Z";
        state.sessionCompletionRequests[task.id] = { taskId: task.id, requestedAt };
        state.sessionCompletionReviews[task.id] = { taskId: task.id, requestedAt, reviewedAt: requestedAt, status: "approved", note: "" };
      } else {
        state.taskCompletions[task.id] = true;
      }
    }
  }
  return state;
}

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
}

function buttonNamed(root: ReactTestInstance, name: string): ReactTestInstance {
  const match = root.findAll((node) => node.type === "button" && textOf(node).includes(name));
  if (!match.length) throw new Error(`No button named ${name}`);
  return match[0];
}

async function render(props: Partial<Parameters<typeof DashboardView>[0]> & { tracker: TrackerState }) {
  const handlers = {
    onToggleTask: vi.fn(),
    onNavigate: vi.fn(),
    onOpenPractice: vi.fn(),
    onOpenModuleTest: vi.fn(),
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <DashboardView
        currentWeek={4}
        rawProgramWeek={4}
        role="student"
        studentUid="student-1"
        {...handlers}
        {...props}
      />,
    );
  });
  return { tree, handlers };
}

describe("Home Today card", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Metric cards animate their bars; the node test environment has no frames.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
    sources.value = { dueReviews: null, pendingModuleTests: null, moduleTestProgress: null };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leads with the next week task when nothing else is due", async () => {
    const { tree, handlers } = await render({ tracker: upToDate() });
    const heading = tree.root.findByType("h1");
    expect(textOf(heading)).toBe("Your next study task");
    await act(async () => buttonNamed(tree.root, "Mark complete").props.onClick());
    expect(handlers.onToggleTask).toHaveBeenCalledWith("w4-independent-1");
    const queue = tree.root.findByProps({ className: "today-queue" });
    expect(queue.findAllByType("li")).toHaveLength(2);
  });

  it("puts a pending module test first and opens its start screen", async () => {
    sources.value = {
      dueReviews: 6,
      pendingModuleTests: [{ moduleId: "m01-rates-and-returns", title: "Rates and Returns", deadline: null }],
      moduleTestProgress: null,
    };
    const { tree, handlers } = await render({ tracker: upToDate() });
    expect(textOf(tree.root.findByType("h1"))).toBe("Module test: Rates and Returns");
    await act(async () => buttonNamed(tree.root, "Open the test").props.onClick());
    expect(handlers.onOpenModuleTest).toHaveBeenCalledWith("m01-rates-and-returns");
    // The due review is the next row and starts the review intent when pressed.
    await act(async () => buttonNamed(tree.root, "6 questions due for review").props.onClick());
    expect(handlers.onOpenPractice).toHaveBeenCalledWith("review");
    expect(textOf(tree.root.findByProps({ className: "today-queue-total" }))).toContain("About 21 min of timed work");
  });

  it("resumes a test in progress ahead of overdue work and shows the test status strip", async () => {
    sources.value = {
      dueReviews: null,
      pendingModuleTests: [
        { moduleId: "m03-statistical-measures", title: "Statistical Measures of Asset Returns", deadline: "2026-10-02" },
        { moduleId: "m02-time-value-of-money", title: "The Time Value of Money in Finance", deadline: null, inProgress: true },
      ],
      moduleTestProgress: { published: 5, completed: 3 },
    };
    const { tree, handlers } = await render({ tracker: createDefaultState() });
    expect(textOf(tree.root.findByType("h1"))).toBe("Module test: The Time Value of Money in Finance");
    expect(textOf(tree.root.findByProps({ className: "today-test-strip" }))).toBe(" Module tests: 3 of 5 done · one in progress · next due Fri 2 Oct");
    await act(async () => buttonNamed(tree.root, "Resume the test").props.onClick());
    expect(handlers.onOpenModuleTest).toHaveBeenCalledWith("m02-time-value-of-money");
  });

  it("leads with overdue work when no module test is waiting", async () => {
    const { tree } = await render({ tracker: createDefaultState() });
    expect(textOf(tree.root.findByType("h1"))).toBe("Catch up first");
  });

  it("never starts practice for the tutor", async () => {
    sources.value = { dueReviews: 6, pendingModuleTests: null, moduleTestProgress: null };
    const tracker = upToDate();
    getPlanTasks(PLAN[3]).forEach((task) => { tracker.taskCompletions[task.id] = true; });
    const { tree, handlers } = await render({ tracker, role: "tutor", studentUid: null });
    await act(async () => buttonNamed(tree.root, "Open Practice").props.onClick());
    expect(handlers.onOpenPractice).not.toHaveBeenCalled();
    expect(handlers.onNavigate).toHaveBeenCalledWith("practice");
  });

  it("says so when the plan is complete", async () => {
    const { tree } = await render({ tracker: createDefaultState(), currentWeek: 25, rawProgramWeek: 26 });
    expect(textOf(tree.root.findByType("h1"))).toBe("The plan is complete.");
  });
});
