import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionConsole } from "./LiveSessionConsole";
import { LiveSessionRunner } from "./LiveSessionRunner";
import { adaptTutorPlaybookPackage } from "./adaptTutorPlaybook";
import { syntheticPlaybook } from "../../testFixtures/tutorPlaybooks";
import type { LiveSessionRunSnapshot } from "./types";

vi.mock("./LiveSessionRunner", () => ({
  LiveSessionRunner: () => <div>Runner fixture</div>,
}));
let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T06:20:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    hidden: false,
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("switching sessions checkpoints the live clock", () => {
  it("pauses without losing elapsed time, deck position, or evidence; reopening never auto-starts", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(1));
    const changed = vi.fn();
    const run: LiveSessionRunSnapshot = {
      phase: "running",
      routeId: book.routes[0]!.id,
      stageIndex: 0,
      questionIndex: 16,
      evidence: [],
      completedDeskIds: ["fixture-stage::s1-card-1"],
      timer: {
        status: "paused",
        durationMs: 150 * 60000,
        runningSince: null,
        elapsedBeforeRunMs: 20 * 60000,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    const props = {
      session: {
        id: "run-1",
        number: 1,
        date: "2026-09-12",
        startTime: "09:00",
        title: "Fixture",
        candidateName: "Hamad",
        topic: "Quant",
      },
      playbook: book,
      initialRun: run,
      onRunChange: changed,
      onComplete: vi.fn(),
    };
    await act(async () => {
      tree = create(<LiveSessionConsole {...props} active />);
    });
    await act(async () =>
      tree!.root.findByType(LiveSessionRunner).props.timer.resume()
    );
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () =>
      tree!.update(<LiveSessionConsole {...props} active={false} />)
    );
    expect(tree!.root.findAllByType(LiveSessionRunner)).toHaveLength(0);
    const paused = changed.mock.lastCall![0] as LiveSessionRunSnapshot;
    expect(paused.timer?.status).toBe("paused");
    expect(paused.timer?.elapsedBeforeRunMs).toBe(20 * 60000 + 2000);
    expect(paused.questionIndex).toBe(16);
    expect(paused.completedDeskIds).toEqual(run.completedDeskIds);
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    await act(async () =>
      tree!.update(<LiveSessionConsole {...props} active />)
    );
    const runner = tree!.root.findByType(LiveSessionRunner);
    expect(runner.props.timer.status).toBe("paused");
    expect(runner.props.timer.elapsedMs).toBe(paused.timer!.elapsedBeforeRunMs);
    expect(runner.props.initialQuestionIndex).toBe(16);
  });

  it("starts a separate Session 2 console with zero elapsed time and its 120-minute route", async () => {
    const book = adaptTutorPlaybookPackage(await syntheticPlaybook(2));
    const changed = vi.fn();
    await act(async () => {
      tree = create(
        <LiveSessionConsole
          session={{
            id: "run-2",
            number: 2,
            date: "2026-09-19",
            startTime: "09:00",
            title: "Fixture",
            candidateName: "Hamad",
            topic: "Quant",
          }}
          playbook={book}
          onRunChange={changed}
          onComplete={vi.fn()}
        />
      );
    });
    expect(changed.mock.lastCall![0]).toMatchObject({
      phase: "launch",
      routeId: "s2-48-120",
      questionIndex: 0,
      completedDeskIds: [],
      timer: { elapsedBeforeRunMs: 0, durationMs: 120 * 60000 },
    });
    const routes = tree!.root
      .findAllByType("input")
      .filter(input => input.props.type === "radio");
    expect(routes.map(route => route.props.value)).toEqual([
      "s2-48-120",
      "s2-60-150",
    ]);
  });
});
