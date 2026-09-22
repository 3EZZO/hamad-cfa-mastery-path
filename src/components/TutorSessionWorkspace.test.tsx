import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TutorSessionWorkspace from "./TutorSessionWorkspace";
import { LiveSessionConsole } from "../features/liveSession";
import { createDefaultState } from "../lib/storage";
import { getTutorSession, TUTOR_SESSION_NUMBERS } from "../lib/tutorSessionCatalog";
import { asDraft, syntheticPlaybook } from "../testFixtures/tutorPlaybooks";
import {
  applyTutorLiveRunAction,
  type TutorLiveRun,
  type TutorLiveRunSaveRequest,
  type TutorPlaybookPackage,
} from "../lib/tutorContent";
import type { LiveSessionRunSnapshot } from "../features/liveSession/types";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  publish: vi.fn(),
  cache: vi.fn(),
  cacheRun: vi.fn(),
  journal: vi.fn(),
  save: vi.fn(),
  removeRun: vi.fn(),
  removePackage: vi.fn(),
}));
vi.mock("../lib/cloud", () => ({
  CloudClientError: class extends Error {},
  loadTutorPlaybookPackage: mocks.load,
  importTutorPlaybookPackage: mocks.publish,
  getTutorLiveRun: vi.fn(async () => null),
  saveTutorLiveRun: mocks.save,
  getCloudErrorMessage: (error: Error) => error.message,
  mapCloudError: (error: Error) => ({
    code: "unknown",
    message: error.message,
  }),
  diagnoseTutorCloudError: vi.fn(),
  probeTutorLiveRunAccess: vi.fn(),
  deleteTutorLiveRun: vi.fn(),
}));
vi.mock("../lib/tutorOffline", () => ({
  loadTutorPlaybookOffline: vi.fn(async () => null),
  loadTutorRunOffline: vi.fn(async () => null),
  loadTutorRunJournal: vi.fn(async () => []),
  cacheTutorPlaybookOffline: mocks.cache,
  cacheTutorRunOffline: mocks.cacheRun,
  journalTutorRunAction: mocks.journal,
  getTutorOfflineStatus: vi.fn(async () => ({ ready: false })),
  removeTutorPlaybookOffline: mocks.removePackage,
  removeTutorRunOffline: mocks.removeRun,
  removeTutorRunJournalAction: vi.fn(async () => undefined),
}));
vi.mock("../features/liveSession", async importOriginal => ({
  ...(await importOriginal<typeof import("../features/liveSession")>()),
  LiveSessionConsole: () => <div>Console fixture</div>,
}));

let tree: ReactTestRenderer | undefined;
let s1: TutorPlaybookPackage;
let s2: TutorPlaybookPackage;
let s3: TutorPlaybookPackage;
let s4: TutorPlaybookPackage;
const notify = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("navigator", { onLine: true });
  [s1, s2, s3, s4] = await Promise.all([
    syntheticPlaybook(1),
    syntheticPlaybook(2),
    syntheticPlaybook(3),
    syntheticPlaybook(4),
  ]);
  mocks.load.mockImplementation(async (id: string) => {
    if (id === s1.manifest.id) return s1;
    if (id === s2.manifest.id) return s2;
    if (id === s3.manifest.id) return s3;
    if (id === s4.manifest.id) return s4;
    // Sessions 05-23 exist in the catalog but have no published playbook yet.
    return null;
  });
  mocks.cache.mockResolvedValue({ ready: true });
  mocks.cacheRun.mockResolvedValue(undefined);
  mocks.journal.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    tree = create(
      <TutorSessionWorkspace
        userUid="fixture-tutor"
        tracker={createDefaultState()}
        updateTracker={vi.fn()}
        updatePrivateTutorNotes={vi.fn(async () => undefined)}
        notify={notify}
        onExit={vi.fn()}
      />
    );
  });
}
async function choose(number: number) {
  const buttons = tree!.root
    .findAllByType("button")
    .filter(button => "aria-pressed" in button.props);
  await act(async () => buttons[number - 1]!.props.onClick());
}
function consoleFor(number: number) {
  return tree!.root
    .findAllByType(LiveSessionConsole)
    .find(node => node.props.session.number === number)!;
}

describe("Session Mode workspace isolation", () => {
  it("keeps the S1 workspace and caches when S2 opens, and binds each descriptor to its own package", async () => {
    await mount();
    const firstId = consoleFor(1).props.session.id;
    await choose(2);
    expect(consoleFor(1).props.active).toBe(false);
    expect(consoleFor(2).props.active).toBe(true);
    expect(consoleFor(2).props.playbook.id).toBe(getTutorSession(2).playbookId);
    expect(consoleFor(2).props.session).toMatchObject({
      number: 2,
      date: "2026-09-26",
    });
    expect(consoleFor(2).props.session.id).not.toBe(firstId);
    await choose(1);
    expect(consoleFor(1).props.session.id).toBe(firstId);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.removeRun).not.toHaveBeenCalled();
    expect(mocks.removePackage).not.toHaveBeenCalled();
  });

  it("opens Session 03 in an isolated workspace with its planned 150-minute appointment", async () => {
    await mount();
    await choose(3);
    expect(consoleFor(1).props.active).toBe(false);
    expect(consoleFor(3).props.active).toBe(true);
    expect(consoleFor(3).props.playbook.id).toBe(getTutorSession(3).playbookId);
    expect(consoleFor(3).props.session).toMatchObject({
      number: 3,
      date: "2026-10-03",
    });
  });

  it("opens Session 04 in an isolated workspace with its planned appointment", async () => {
    await mount();
    await choose(4);
    expect(consoleFor(1).props.active).toBe(false);
    expect(consoleFor(4).props.active).toBe(true);
    expect(consoleFor(4).props.playbook.id).toBe(getTutorSession(4).playbookId);
    expect(consoleFor(4).props.session).toMatchObject({
      number: 4,
      date: "2026-10-10",
    });
  });

  it("lists every plan session and opens an unauthored one on the private import screen", async () => {
    await mount();
    const switcher = tree!.root.findAllByType("button").filter(button => "aria-pressed" in button.props);
    expect(switcher).toHaveLength(23);
    expect(switcher.map(button => button.props.children[0])).toEqual(TUTOR_SESSION_NUMBERS.map(number => `Session ${String(number).padStart(2, "0")}`));
    await choose(5);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(consoleFor(1).props.active).toBe(false);
    expect(tree!.root.findAllByType(LiveSessionConsole).some(node => node.props.session.number === 5)).toBe(false);
    const setup = tree!.root.findAllByProps({ id: "private-setup-title" }).find(node => typeof node.type === "string");
    expect(setup).toBeDefined();
    expect(JSON.stringify(setup!.children)).toContain("Session 05");
    expect(mocks.publish).not.toHaveBeenCalled();
    await choose(1);
    expect(consoleFor(1).props.active).toBe(true);
  });

  it("rejects a wrong-session upload before any cloud or offline publication, retaining the live console", async () => {
    await mount();
    const file = { size: 100, text: async () => JSON.stringify(asDraft(s2)) };
    await act(async () =>
      tree!.root
        .findByType("input")
        .props.onChange({ target: { files: [file] } })
    );
    // The event deliberately fire-and-forgets; allow hash verification to finish.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Session 01"),
      "warning"
    );
    expect(consoleFor(1).props.playbook.id).toBe(s1.manifest.id);
  });

  it("resolves a slow S1 load only into S1 after switching to S2", async () => {
    let resolveFirst!: (book: TutorPlaybookPackage) => void;
    mocks.load.mockImplementation((id: string) =>
      id === s1.manifest.id
        ? new Promise(resolve => {
            resolveFirst = resolve;
          })
        : Promise.resolve(s2)
    );
    await mount();
    await choose(2);
    expect(consoleFor(2).props.playbook.id).toBe(s2.manifest.id);
    await act(async () => resolveFirst(s1));
    expect(consoleFor(1).props.playbook.id).toBe(s1.manifest.id);
    expect(consoleFor(1).props.active).toBe(false);
    expect(consoleFor(2).props.playbook.id).toBe(s2.manifest.id);
  });

  it("scopes device snapshots to the selected run and never reuses another session's notes", async () => {
    await mount();
    await choose(2);
    for (const number of [1, 2]) {
      const console = consoleFor(number);
      const snapshot: LiveSessionRunSnapshot = {
        phase: "launch",
        routeId: console.props.playbook.routes[0].id,
        stageIndex: 0,
        questionIndex: number,
        evidence: [],
        completedDeskIds: [],
        timer: null,
        updatedAt: new Date().toISOString(),
      };
      await act(async () => console.props.onRunChange(snapshot));
      expect(mocks.cacheRun).toHaveBeenCalledWith(
        "fixture-tutor",
        console.props.session.id,
        snapshot
      );
    }
    expect(mocks.cacheRun.mock.calls[0]![1]).not.toBe(
      mocks.cacheRun.mock.calls[1]![1]
    );
  });

  it("finishes a pending S1 cloud save after switching without sending it to S2", async () => {
    let finishSave!: (value: TutorLiveRun) => void;
    mocks.save.mockImplementation(
      () =>
        new Promise(resolve => {
          finishSave = resolve;
        })
    );
    await mount();
    const console = consoleFor(1);
    const snapshot: LiveSessionRunSnapshot = {
      phase: "running",
      routeId: console.props.playbook.routes[0].id,
      stageIndex: 0,
      questionIndex: 0,
      evidence: [],
      completedDeskIds: [],
      timer: null,
      updatedAt: new Date().toISOString(),
    };
    await act(async () => console.props.onRunChange(snapshot));
    expect(mocks.journal).toHaveBeenCalledWith(
      "fixture-tutor",
      console.props.session.id,
      expect.any(String),
      expect.objectContaining({ type: "start" }),
      snapshot
    );
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const request = mocks.save.mock.calls[0]![0] as TutorLiveRunSaveRequest;
    expect(request.sessionNumber).toBe(1);
    await choose(2);
    await act(async () =>
      finishSave(applyTutorLiveRunAction(null, request, "fixture-tutor"))
    );
    expect(consoleFor(1).props.syncState).toBe("synced");
    expect(consoleFor(2).props.session.id).not.toBe(request.runId);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await choose(1);
    expect(consoleFor(1).props.session.id).toBe(request.runId);
    expect(mocks.removeRun).not.toHaveBeenCalled();
  });
});
