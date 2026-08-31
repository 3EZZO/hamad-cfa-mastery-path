import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionPreflightReport } from "./sessionPreflight";
import { SessionPreflightPanel } from "./SessionPreflightPanel";

function report(status: "ready" | "blocked"): SessionPreflightReport {
  return {
    checks: [
      {
        id: "tutor-access",
        label: "Tutor access",
        detail:
          status === "ready"
            ? "Active tutor access confirmed."
            : "Run the cloud check.",
        status,
        blocksStart: status === "blocked",
      },
      {
        id: "offline-recovery",
        label: "Offline recovery",
        detail: "A verified device recovery copy is available.",
        status: "ready",
        blocksStart: false,
      },
    ],
    canStart: status === "ready",
    readyCount: status === "ready" ? 2 : 1,
    warningCount: 0,
    blockingCount: status === "blocked" ? 1 : 0,
    position: null,
  };
}

describe("SessionPreflightPanel", () => {
  it("presents one explicit full-scan action and all check details", () => {
    const html = renderToStaticMarkup(
      <SessionPreflightPanel
        report={report("blocked")}
        calculatorReady={false}
        timerReady={false}
        onRun={() => undefined}
        onCalculatorReadyChange={() => undefined}
        onTimerReadyChange={() => undefined}
      />
    );

    expect(html).toContain("Run full preflight");
    expect(html).toContain("Tutor access");
    expect(html).toContain("Action required");
    expect(html).toContain("Calculator confirmed");
    expect(html).toContain("Teaching station confirmed");
  });

  it("shows a verified status with a device check time", () => {
    const html = renderToStaticMarkup(
      <SessionPreflightPanel
        report={report("ready")}
        checkedAt="2026-09-05T06:00:00.000Z"
        calculatorReady
        timerReady
        onRun={() => undefined}
        onCalculatorReadyChange={() => undefined}
        onTimerReadyChange={() => undefined}
      />
    );

    expect(html).toContain("Session systems verified");
    expect(html).toContain("Run again");
    expect(html).toContain("2/2");
  });

  it("distinguishes protected offline recovery from full cloud verification", () => {
    const warningReport = report("ready");
    warningReport.checks[0] = {
      ...warningReport.checks[0],
      status: "warning",
      detail: "Firebase is unavailable; verified recovery is ready.",
    };
    warningReport.readyCount = 1;
    warningReport.warningCount = 1;

    const html = renderToStaticMarkup(
      <SessionPreflightPanel
        report={warningReport}
        checkedAt="2026-09-05T06:00:00.000Z"
        calculatorReady
        timerReady
        onRun={() => undefined}
        onCalculatorReadyChange={() => undefined}
        onTimerReadyChange={() => undefined}
      />
    );

    expect(html).toContain("is-warning");
    expect(html).toContain("Ready with protected recovery");
    expect(html).not.toContain("Session systems verified");
  });
});
