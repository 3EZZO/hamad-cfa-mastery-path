import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PracticeQuestionState,
  PracticeRun,
  PublishedPracticeBank,
} from "../../lib/practiceContent";

const harness = vi.hoisted(() => ({
  loadedStateUid: "",
  loadedRunUid: "",
  rosterCalls: 0,
  saveState: vi.fn(),
  saveRun: vi.fn(),
  cacheRun: vi.fn(),
  cacheState: vi.fn(),
  queueWrite: vi.fn(),
}));

const bank: PublishedPracticeBank = {
  schemaVersion: 1,
  id: "session-01-practice",
  version: "v1",
  storageId: "session-01-practice--v1",
  title: "Session 1 practice",
  topic: "Quantitative Methods",
  moduleIds: ["module-01"],
  sourceSessionIds: ["session-01"],
  published: true,
  publishedBy: "tutor-uid",
  publishedAtClient: "2026-09-01T08:00:00.000Z",
  questions: [{
    id: "question-01",
    moduleId: "module-01",
    conceptId: "concept-01",
    type: "concept",
    difficulty: 3,
    estimatedSeconds: 60,
    prompt: "Which return measure preserves compounded wealth?",
    options: ["Arithmetic mean", "Geometric mean", "Harmonic mean"],
    correctOption: 1,
    explanation: "The geometric mean preserves the compounded wealth path.",
    working: [],
    formulae: [],
    distractorExplanations: ["It does not compound.", "Correct.", "It answers a different question."],
    examTrap: "Do not substitute an arithmetic average for compounded growth.",
    tags: ["return-measures"],
  }],
};

const unassignedBank: PublishedPracticeBank = {
  ...bank,
  id: "session-02-practice",
  storageId: "session-02-practice--v1",
  title: "Unassigned practice",
  questions: [{
    ...bank.questions[0],
    id: "question-unassigned",
    prompt: "This question must not appear in rehearsal.",
  }],
};

const state: PracticeQuestionState = {
  questionId: "question-01",
  bankStorageId: bank.storageId,
  attempts: 1,
  correctAttempts: 0,
  streak: 0,
  lapseCount: 1,
  intervalDays: 1,
  ease: 2,
  lastCorrect: false,
  lastConfidence: 4,
  lastResponseMs: 80_000,
  lastAttemptedAt: "2026-09-17T10:00:00.000Z",
  dueAt: "2026-09-18T10:00:00.000Z",
  misconceptionTags: ["return-measures"],
  updatedAtClient: "2026-09-17T10:00:00.000Z",
};

const run: PracticeRun = {
  id: "run-01",
  uid: "student-uid",
  mode: "quick",
  bankStorageIds: [bank.storageId],
  moduleId: null,
  questionIds: ["question-01"],
  answers: [{
    questionId: "question-01",
    selectedOption: 0,
    correct: false,
    confidence: 4,
    responseMs: 80_000,
    answeredAt: "2026-09-17T10:00:00.000Z",
  }],
  currentIndex: 1,
  status: "completed",
  startedAtClient: "2026-09-17T09:58:00.000Z",
  updatedAtClient: "2026-09-17T10:00:00.000Z",
  completedAtClient: "2026-09-17T10:00:00.000Z",
};

vi.mock("../../lib/cloud", () => ({
  listActiveStudentMembers: async () => {
    harness.rosterCalls += 1;
    return [{ uid: "student-uid", role: "student", active: true }];
  },
  listPublishedPracticeBanks: async () => [bank, unassignedBank],
  loadPracticeAssignment: async () => ({
    bankStorageIds: [bank.storageId],
    updatedBy: "tutor-uid",
    updatedAtClient: "2026-09-01T08:00:00.000Z",
  }),
  loadPracticeQuestionStates: async (uid: string) => {
    harness.loadedStateUid = uid;
    return [state];
  },
  listPracticeRuns: async (uid: string) => {
    harness.loadedRunUid = uid;
    return [{ ...run, uid }];
  },
  savePracticeQuestionState: harness.saveState,
  savePracticeRun: harness.saveRun,
}));

vi.mock("../../lib/practiceOffline", () => ({
  cachePracticeBanks: async () => {},
  cachePracticeRun: harness.cacheRun,
  cachePracticeState: harness.cacheState,
  loadCachedPracticeBanks: async () => [],
  loadCachedPracticeRuns: async () => [],
  loadCachedPracticeStates: async () => [],
  loadPendingPracticeWrites: async () => [],
  queuePracticeWrite: harness.queueWrite,
  removePendingPracticeWrite: async () => {},
}));

import { PracticeCoach } from "./PracticeCoach";

function renderedText(tree: ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

function nodeText(node: { children?: Array<unknown> }): string {
  return (node.children ?? []).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (child && typeof child === "object") return nodeText(child as { children?: Array<unknown> });
    return "";
  }).join("");
}

function button(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType("button").find(candidate => nodeText(candidate).includes(label));
}

async function render(
  role: "tutor" | "student",
  uid: string,
  onComplete = vi.fn(),
  notify = vi.fn()
) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <PracticeCoach
        uid={uid}
        role={role}
        manualLog={<div>Manual evidence</div>}
        onComplete={onComplete}
        notify={notify}
      />
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

describe("Practice Coach role views", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    harness.loadedStateUid = "";
    harness.loadedRunUid = "";
    harness.rosterCalls = 0;
    harness.saveState.mockClear();
    harness.saveRun.mockClear();
    harness.cacheRun.mockClear();
    harness.cacheState.mockClear();
    harness.queueWrite.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows the tutor Hamad's read-only performance and missed answer", async () => {
    const tree = await render("tutor", "tutor-uid");
    const text = renderedText(tree);

    expect(harness.rosterCalls).toBe(1);
    expect(harness.loadedStateUid).toBe("student-uid");
    expect(harness.loadedRunUid).toBe("student-uid");
    expect(text).toContain("Hamad's practice evidence");
    expect(text).toContain("Questions answered incorrectly");
    expect(text).toContain("Which return measure preserves compounded wealth?");
    expect(text).not.toContain("Recommended now");
    await act(async () => tree.unmount());
  });

  it("shows the student personal review alongside practice actions", async () => {
    const tree = await render("student", "student-uid");
    const text = renderedText(tree);

    expect(harness.rosterCalls).toBe(0);
    expect(harness.loadedStateUid).toBe("student-uid");
    expect(text).toContain("Your evidence");
    expect(text).toContain("Recommended now");
    expect(text).toContain("Which return measure preserves compounded wealth?");
    await act(async () => tree.unmount());
  });

  it("preserves normal student persistence", async () => {
    const tree = await render("student", "student-uid");
    harness.saveState.mockClear();
    harness.saveRun.mockClear();
    harness.cacheState.mockClear();
    harness.cacheRun.mockClear();

    await act(async () => button(tree, "Quick 5")!.props.onClick());
    const firstAnswer = tree.root.findAllByProps({ role: "radio" })[0];
    await act(async () => firstAnswer.props.onClick());
    await act(async () => button(tree, "Submit answer")!.props.onClick());

    expect(harness.saveState).toHaveBeenCalledTimes(1);
    expect(harness.saveRun).toHaveBeenCalled();
    expect(harness.cacheState).toHaveBeenCalledTimes(1);
    expect(harness.cacheRun).toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("runs an assigned-only tutor rehearsal without persisting any activity", async () => {
    const onComplete = vi.fn();
    const notify = vi.fn();
    const tree = await render("tutor", "tutor-uid", onComplete, notify);
    harness.cacheRun.mockClear();
    harness.cacheState.mockClear();

    await act(async () => button(tree, "Rehearse as student")!.props.onClick());
    let text = renderedText(tree);
    expect(text).toContain("Tutor rehearsal");
    expect(text).toContain("Quick 5");
    expect(text).toContain("Mixed Review");
    expect(text).toContain("Exam Drill");
    expect(text).not.toContain("This question must not appear in rehearsal.");

    await act(async () => button(tree, "Quick 5")!.props.onClick());
    const firstAnswer = tree.root.findAllByProps({ role: "radio" })[0];
    await act(async () => firstAnswer.props.onClick());
    await act(async () => button(tree, "Submit answer")!.props.onClick());
    await act(async () => button(tree, "View results")!.props.onClick());

    text = renderedText(tree);
    expect(text).toContain("Rehearsal complete");
    expect(harness.saveState).not.toHaveBeenCalled();
    expect(harness.saveRun).not.toHaveBeenCalled();
    expect(harness.cacheState).not.toHaveBeenCalled();
    expect(harness.cacheRun).not.toHaveBeenCalled();
    expect(harness.queueWrite).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  it("confirms before discarding an unfinished rehearsal", async () => {
    const tree = await render("tutor", "tutor-uid");
    await act(async () => button(tree, "Rehearse as student")!.props.onClick());
    await act(async () => button(tree, "Quick 5")!.props.onClick());
    await act(async () => button(tree, "Exit rehearsal")!.props.onClick());

    expect(renderedText(tree)).toContain("Discard this rehearsal?");
    await act(async () => button(tree, "Discard and exit")!.props.onClick());
    const text = renderedText(tree);
    expect(text).toContain("Hamad's practice evidence");
    expect(text).not.toContain("Tutor rehearsal");
    await act(async () => tree.unmount());
  });
});

// Deliberately a DOM model (as in useDialogFocus.test.tsx), not a claim of
// rendered-browser verification. Browser checks are listed in the PR notes.
class ElementModel {
  parentElement: ElementModel | null = null;
  children: ElementModel[] = [];
  attrs: Record<string, string> = {};
  style = { display: "block", visibility: "visible" };
  tabIndex = 0;
  isConnected = true;
  constructor(public tagName = "DIV") {}
  contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
  hasAttribute(name: string) { return name in this.attrs; }
  matches() { return false; }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll(): ElementModel[] { return []; }
  focus() { doc.activeElement = this; }
}

type Listener = (event: any) => void;
const documentListeners = new Map<string, Set<Listener>>();
const windowListeners = new Map<string, Set<Listener>>();
const listen = (store: Map<string, Set<Listener>>) => ({
  addEventListener: (name: string, fn: Listener) => {
    if (!store.has(name)) store.set(name, new Set());
    store.get(name)!.add(fn);
  },
  removeEventListener: (name: string, fn: Listener) => store.get(name)?.delete(fn),
});
const doc = { activeElement: null as ElementModel | null, ...listen(documentListeners) };

/**
 * Mirrors browser propagation order for the two listeners involved: the
 * dialog hook (document, capture) runs first; the calculator's window
 * listener runs only if propagation was not stopped.
 */
function dispatchKey(key: string, target: ElementModel | null = doc.activeElement) {
  let stopped = false;
  const event = {
    type: "keydown",
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(() => { stopped = true; }),
  };
  for (const fn of [...(documentListeners.get("keydown") ?? [])]) fn(event);
  if (!stopped) for (const fn of [...(windowListeners.get("keydown") ?? [])]) fn(event);
  return event;
}

describe("UI/UX behaviors", () => {
  let tree: ReactTestRenderer | undefined;
  let nodes: { toggle?: ElementModel; close?: ElementModel; dialog?: ElementModel };

  beforeEach(() => {
    documentListeners.clear();
    windowListeners.clear();
    doc.activeElement = null;
    nodes = {};
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("HTMLElement", ElementModel);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", {
      ...listen(windowListeners),
      getComputedStyle: (node: ElementModel) => node.style,
    });
    harness.saveState.mockReset();
    harness.saveRun.mockReset();
    harness.cacheRun.mockClear();
    harness.cacheState.mockClear();
    harness.queueWrite.mockClear();
  });

  afterEach(async () => {
    if (tree) await act(async () => tree!.unmount());
    tree = undefined;
    vi.unstubAllGlobals();
  });

  async function renderStudent() {
    await act(async () => {
      tree = create(
        <PracticeCoach
          uid="student-01"
          role="student"
          manualLog={null}
          onComplete={vi.fn()}
          notify={vi.fn()}
        />,
        {
          createNodeMock: element => {
            const node = new ElementModel(String(element.type).toUpperCase());
            const props = element.props as Record<string, unknown>;
            if (props["aria-label"] === "Close calculator") nodes.close = node;
            if (props.role === "dialog") nodes.dialog = node;
            return node;
          },
        }
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    return tree!;
  }

  const hasCalc = () => tree!.root.findAllByProps({ "aria-label": "BA II Plus Calculator" }).length > 0;
  const closeButton = () => tree!.root.findAllByType("button").find(b => b.props["aria-label"] === "Close calculator")!;

  async function openCalculator() {
    await act(async () => button(tree!, "Quick 5")!.props.onClick());
    const toggle = tree!.root.findAllByType("button").find(b => b.props.className?.includes("practice-calculator-toggle"))!;
    // The toggle carries no ref, so model the element that had focus at open.
    nodes.toggle = new ElementModel("BUTTON");
    nodes.toggle.focus();
    await act(async () => toggle.props.onClick());
    expect(hasCalc()).toBe(true);
  }

  it("closes via Escape at the dialog level without logging a calculator clear", async () => {
    await renderStudent();
    await openCalculator();

    await act(async () => button(tree!, "7")!.props.onClick());
    let event!: ReturnType<typeof dispatchKey>;
    await act(async () => { event = dispatchKey("Escape"); });

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(hasCalc()).toBe(false);

    await act(async () => tree!.root.findAllByProps({ role: "radio" })[0].props.onClick());
    await act(async () => button(tree!, "Submit answer")!.props.onClick());

    const savedRun = harness.saveRun.mock.calls.at(-1)?.[0] as PracticeRun;
    const keys = savedRun.answers[0].calculatorLog?.map((entry: { key: string }) => entry.key);
    expect(keys).toEqual(["7"]);
  });

  it("keeps the calculator's own clear shortcut while the drawer is open", async () => {
    await renderStudent();
    await openCalculator();
    await act(async () => button(tree!, "7")!.props.onClick());
    // Backspace is not a dialog key, so it reaches the calculator's listener.
    await act(async () => { dispatchKey("Backspace"); });
    expect(hasCalc()).toBe(true);

    await act(async () => closeButton().props.onClick());
    await act(async () => tree!.root.findAllByProps({ role: "radio" })[0].props.onClick());
    await act(async () => button(tree!, "Submit answer")!.props.onClick());

    const savedRun = harness.saveRun.mock.calls.at(-1)?.[0] as PracticeRun;
    expect(savedRun.answers[0].calculatorLog?.map((entry: { key: string }) => entry.key)).toEqual(["7", "CE/C"]);
  });

  it("focuses the Close button on open and restores the toggle on close", async () => {
    await renderStudent();
    await openCalculator();
    expect(doc.activeElement).toBe(nodes.close);

    await act(async () => closeButton().props.onClick());
    expect(hasCalc()).toBe(false);
    expect(doc.activeElement).toBe(nodes.toggle);
  });

  it("lets Enter activate the Close button natively", async () => {
    await renderStudent();
    await openCalculator();
    const dialog = tree!.root.find(node => typeof node.type === "string" && node.props.role === "dialog");

    const onClose = { key: "Enter", target: nodes.close, stopPropagation: vi.fn() };
    dialog.props.onKeyDown(onClose);
    expect(onClose.stopPropagation).toHaveBeenCalledTimes(1);

    const elsewhere = { key: "Enter", target: nodes.dialog, stopPropagation: vi.fn() };
    dialog.props.onKeyDown(elsewhere);
    expect(elsewhere.stopPropagation).not.toHaveBeenCalled();
  });

  it("updates saved timestamp only on explicit save", async () => {
    let resolveSave: (value?: any) => void = () => {};
    const savePromise = new Promise(r => { resolveSave = r; });
    harness.saveState.mockImplementation(() => savePromise);
    harness.saveRun.mockImplementation(() => savePromise);

    await renderStudent();

    const hasTimestamp = () => tree!.root.findAllByType("span").find(s => s.props.className?.includes("practice-sync"))?.children.join("").includes("Saved");
    expect(hasTimestamp()).toBe(false);

    await act(async () => button(tree!, "Quick 5")!.props.onClick());
    await act(async () => tree!.root.findAllByProps({ role: "radio" })[0].props.onClick());
    await act(async () => button(tree!, "Submit answer")!.props.onClick());

    // While saving is pending, timestamp should still not be updated
    expect(hasTimestamp()).toBe(false);

    await act(async () => {
      resolveSave();
    });

    // After resolving, timestamp should be updated
    expect(hasTimestamp()).toBe(true);
  });
});
