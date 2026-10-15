import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTeachingHostClock, type TeachingHostClock, type TeachingSurface } from "../liveSession/teachingHost";
import { useTeachingSessionRecord } from "./useTeachingSessionRecord";
import { TutorNotesPanel } from "./TutorNotesPanel";
import type { TeachingMaterialService } from "../../lib/cloudTeachingMaterials";

const fake = vi.hoisted(() => ({
  loadTeachingEnvelope: vi.fn(),
  saveTeachingEnvelope: vi.fn(),
}));
vi.mock("../../lib/cloudTeachingMaterials", async importOriginal => ({
  ...(await importOriginal<typeof import("../../lib/cloudTeachingMaterials")>()),
  teachingMaterialService: () => fake,
}));

const T0 = Date.parse("2026-10-17T06:00:00Z");
const VERSION_A = `r01-rates-and-returns-${"a".repeat(64)}`;
const VERSION_B = `r02-time-value-${"b".repeat(64)}`;
let tree: ReactTestRenderer | undefined;
let store: Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.clearAllMocks();
  store = {};
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval, clearInterval, setTimeout, clearTimeout });
  vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
  });
  fake.loadTeachingEnvelope.mockResolvedValue(null);
  fake.saveTeachingEnvelope.mockImplementation(async (next: object, expected: number) => ({ ...next, revision: expected + 1 }));
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

let host: TeachingHostClock;
let record: ReturnType<typeof useTeachingSessionRecord>;
function Harness({ surface, rehearsal, sessionNumber = 3 }: { surface: TeachingSurface; rehearsal: boolean; sessionNumber?: number }) {
  host = useTeachingHostClock({ durationMinutes: 150, active: true });
  record = useTeachingSessionRecord({ tutorUid: "tutor-1", sessionNumber, hostClock: host, surface, guidedRunId: null, rehearsal });
  return null;
}

async function settle(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe("private teaching-session record", () => {
  it("is not created for a guided-only session", async () => {
    await act(async () => { tree = create(<Harness surface="guided" rehearsal={false} />); });
    await settle();
    await act(async () => host.timer.start(150));
    await settle(5_000);
    expect(fake.saveTeachingEnvelope).not.toHaveBeenCalled();
    expect(Object.keys(store)).toEqual([]);
  });

  it("records PDF teaching: clock, selected PDF and history, via compare-and-set", async () => {
    await act(async () => { tree = create(<Harness surface="pdf" rehearsal={false} />); });
    await settle();
    await act(async () => record.selectVersion(VERSION_A));
    await act(async () => record.recordOpened(VERSION_A));
    await act(async () => host.timer.start(150));
    await settle(3_000);
    expect(fake.saveTeachingEnvelope).toHaveBeenCalled();
    const [envelope, expected] = fake.saveTeachingEnvelope.mock.calls.at(-1)!;
    expect(expected).toBe(0);
    expect(envelope).toMatchObject({ runId: "session-03", sessionNumber: 3, rehearsal: false, surface: "pdf", selectedVersionId: VERSION_A, status: "teaching" });
    expect(envelope.history.map((entry: { versionId: string }) => entry.versionId)).toEqual([VERSION_A]);
    expect(JSON.parse(store["hamad-teaching-host:tutor-1:session-03"]!).selectedVersionId).toBe(VERSION_A);
  });

  it("writes nothing to the cloud or device while practising (rehearsal)", async () => {
    await act(async () => { tree = create(<Harness surface="pdf" rehearsal />); });
    await settle();
    await act(async () => record.selectVersion(VERSION_B));
    await act(async () => record.recordOpened(VERSION_B));
    await settle(5_000);
    expect(fake.saveTeachingEnvelope).not.toHaveBeenCalled();
    expect(Object.keys(store)).toEqual([]);
  });

  it("restores a recorded clock paused, never counting the time away", async () => {
    fake.loadTeachingEnvelope.mockResolvedValue({
      schemaVersion: 1, ownerUid: "tutor-1", runId: "session-03", sessionNumber: 3, rehearsal: false, status: "teaching",
      clock: { status: "running", durationMs: 9_000_000, elapsedBeforeRunMs: 600_000, runningSince: new Date(T0 - 120_000).toISOString(), updatedAt: new Date(T0 - 60_000).toISOString() },
      surface: "pdf", selectedVersionId: VERSION_A, guidedRunId: null, history: [], revision: 4, updatedAtClient: new Date(T0 - 60_000).toISOString(),
    });
    vi.setSystemTime(T0 + 3 * 3_600_000);
    await act(async () => { tree = create(<Harness surface="guided" rehearsal={false} />); });
    await settle();
    expect(host.timer.current().status).toBe("paused");
    // 10 min recorded + 1 min evidenced before capture; 3 hours away do not count.
    expect(host.timer.current().elapsedBeforeRunMs).toBe(660_000);
    expect(record.selectedVersionId).toBe(VERSION_A);
    expect(record.restoredSurface).toBe("pdf");
  });

  it("finishing PDF teaching pauses the clock and saves privately", async () => {
    await act(async () => { tree = create(<Harness surface="pdf" rehearsal={false} />); });
    await settle();
    await act(async () => host.timer.start(150));
    await act(async () => record.finish());
    await settle(3_000);
    expect(host.timer.current().status).toBe("paused");
    expect(fake.saveTeachingEnvelope.mock.calls.at(-1)![0]).toMatchObject({ status: "finished" });
  });
});

describe("private notes scoping", () => {
  it("serializes slow saves so newer typing uses the resulting revision", async () => {
    let release!: (revision: number) => void;
    const firstSave = new Promise<number>(resolve => { release = resolve; });
    const save = vi.fn()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValueOnce(2);
    const service = { loadTeachingNote: vi.fn(async () => null), saveTeachingNote: save } as unknown as TeachingMaterialService;
    await act(async () => {
      tree = create(<TutorNotesPanel service={service} tutorUid="tutor-1" runId="session-03" versionId={VERSION_A} rehearsal={false} />);
    });
    await settle();
    const type = (value: string) => tree!.root.findByType("textarea").props.onChange({ target: { value } });
    await act(async () => type("First draft"));
    await settle(1_000);
    await act(async () => type("Latest draft"));
    await settle(1_000);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { release(1); });
    await settle();
    expect(save).toHaveBeenNthCalledWith(2, "session-03", VERSION_A, "Latest draft", 1, "tutor-1");
    expect(tree!.root.findByType("textarea").props.value).toBe("Latest draft");
  });

  it("saves typed text to the note it was typed into, even after a fast switch", async () => {
    const saves: Array<[string, string, string, number]> = [];
    const service = {
      loadTeachingNote: vi.fn(async () => null),
      saveTeachingNote: vi.fn(async (runId: string, versionId: string, text: string, expected: number) => {
        saves.push([runId, versionId, text, expected]);
        return expected + 1;
      }),
    } as unknown as TeachingMaterialService;
    await act(async () => {
      tree = create(<TutorNotesPanel service={service} tutorUid="tutor-1" runId="session-03" versionId={VERSION_A} rehearsal={false} />);
    });
    await settle();
    const area = () => tree!.root.findByType("textarea");
    await act(async () => area().props.onChange({ target: { value: "Ask about TWR" } }));
    // Switch to another PDF before the debounce fires.
    await act(async () => tree!.update(<TutorNotesPanel service={service} tutorUid="tutor-1" runId="session-03" versionId={VERSION_B} rehearsal={false} />));
    await settle(2_000);
    expect(saves).toEqual([["session-03", VERSION_A, "Ask about TWR", 0]]);
    expect(area().props.value).toBe("");
  });

  it("keeps practice notes in memory only", async () => {
    const service = { loadTeachingNote: vi.fn(), saveTeachingNote: vi.fn() } as unknown as TeachingMaterialService;
    await act(async () => {
      tree = create(<TutorNotesPanel service={service} tutorUid="tutor-1" runId="session-03" versionId={VERSION_A} rehearsal />);
    });
    await act(async () => tree!.root.findByType("textarea").props.onChange({ target: { value: "scratch" } }));
    await settle(2_000);
    expect(service.saveTeachingNote).not.toHaveBeenCalled();
    expect(service.loadTeachingNote).not.toHaveBeenCalled();
  });
});

describe("PDF teaching stays separate from guided assessment (static guard)", () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  it("never imports closeout, tracker updates or mastery writes", () => {
    for (const file of [
      "src/features/teachingMaterials/PdfTeachingWorkspace.tsx",
      "src/features/teachingMaterials/TutorMaterialLibrary.tsx",
      "src/features/teachingMaterials/ShareMaterialDialog.tsx",
      "src/features/teachingMaterials/StudentSessionMaterials.tsx",
      "src/features/teachingMaterials/MaterialsTodayCard.tsx",
      "src/features/teachingMaterials/useTeachingSessionRecord.ts",
      "src/lib/cloudTeachingMaterials.ts",
    ]) {
      const text = source(file);
      expect(text, file).not.toMatch(/liveSessionCloseout|applyLiveSessionCloseout|updateTracker|saveCloudTracker|topicMastery|saveTutorLiveRun/);
    }
  });
});
