import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { computeTVM, defaultTVMState, type TVMState } from "../../lib/calculator";
import { BA2Plus, type KeystrokeLog } from "./BA2Plus";

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

function renderCalculator() {
  act(() => {
    renderer = create(
      <BA2Plus
        onLog={() => {}}
        startTime={0}
        tvmState={defaultTVMState()}
        onStateChange={() => {}}
      />,
    );
  });
  return renderer!.root;
}

function pressText(root: ReactTestInstance, text: string) {
  const button = root
    .findAllByType("button")
    .find(node => node.children.join("") === text);
  if (!button) throw new Error(`Button ${text} not found`);
  act(() => button.props.onClick());
}

function pressLabel(root: ReactTestInstance, label: string) {
  const button = root.findByProps({ "aria-label": label });
  act(() => button.props.onClick());
}

function displayValue(root: ReactTestInstance): string {
  return root.findByProps({ className: "ba2-digits" }).children.join("");
}

describe("BA II Plus worksheet controls", () => {
  it("exposes working cash-flow controls and marks unfinished worksheets", () => {
    const markup = renderToStaticMarkup(
      <BA2Plus
        onLog={() => {}}
        startTime={0}
        tvmState={{ ...defaultTVMState(), IY: 10 }}
        onStateChange={() => {}}
      />,
    );

    expect(markup).toContain(">CF</button>");
    expect(markup).toContain(">NPV</button>");
    expect(markup).toContain(">IRR</button>");
    expect(markup).not.toContain("Addition is not available yet");
    expect(markup).not.toContain("Division is not available yet");
    expect(markup).toContain('aria-label="Add"');
    expect(markup).toContain('aria-label="Equals"');
    expect(markup).toContain('aria-label="Store in memory"');
    expect(markup).toContain("AMORT · N/A");
    expect(markup).toContain("STAT · N/A");
    expect(markup).toContain("BOND · N/A");
  });

  it("executes arithmetic, unary functions, and grouped expressions", () => {
    const root = renderCalculator();

    pressText(root, "2");
    pressLabel(root, "Add");
    pressText(root, "3");
    pressLabel(root, "Equals");
    expect(displayValue(root)).toBe("5.00");

    pressText(root, "9");
    pressLabel(root, "Square root");
    expect(displayValue(root)).toBe("3.00");

    pressText(root, "2");
    pressLabel(root, "Multiply");
    pressLabel(root, "Open parenthesis");
    pressText(root, "3");
    pressLabel(root, "Add");
    pressText(root, "4");
    pressLabel(root, "Close parenthesis");
    pressLabel(root, "Equals");
    expect(displayValue(root)).toBe("14.00");
  });

  it("sets P/Y (with C/Y following) and C/Y independently in the P/Y worksheet", () => {
    let latest = defaultTVMState();
    const logs: KeystrokeLog[] = [];
    function Controlled() {
      const [state, setState] = useState<TVMState>(defaultTVMState);
      latest = state;
      return <BA2Plus onLog={(log) => logs.push(log)} startTime={0} tvmState={state} onStateChange={setState} />;
    }
    act(() => { renderer = create(<Controlled />); });
    const root = renderer!.root;

    pressText(root, "2ND");
    pressText(root, "I/Y");
    expect(displayValue(root)).toBe("1.00");
    pressText(root, "1");
    pressText(root, "2");
    pressText(root, "ENTER");
    expect(latest.PY).toBe(12);
    expect(latest.CY).toBe(12);

    pressLabel(root, "Next setting");
    expect(displayValue(root)).toBe("12.00");
    pressText(root, "2");
    pressText(root, "ENTER");
    expect(latest.PY).toBe(12);
    expect(latest.CY).toBe(2);

    pressText(root, "0");
    pressText(root, "ENTER");
    expect(displayValue(root)).toBe("Error 6");
    expect(latest.CY).toBe(2);

    pressText(root, "2ND");
    pressText(root, "CPT");
    expect(displayValue(root)).toBe("0.00");
    expect(logs.map((log) => log.key)).toEqual(expect.arrayContaining(["P/Y", "ENTER P/Y", "C/Y", "ENTER C/Y", "QUIT"]));
    expect(logs.find((log) => log.key === "ENTER C/Y")?.registers).toMatchObject({ PY: 12, CY: 2 });

    // The worksheet values feed the solver: 25 years monthly, compounded semi-annually.
    const pmt = computeTVM("PMT", { ...latest, N: 300, IY: 6, PV: 100000, FV: 0 });
    expect(Math.abs(pmt - -639.81)).toBeLessThanOrEqual(0.01);
  });

  it("stores and recalls calculator memory", () => {
    const root = renderCalculator();
    pressText(root, "4");
    pressText(root, "2");
    pressLabel(root, "Store in memory");
    pressText(root, "7");
    pressLabel(root, "Recall memory");
    expect(displayValue(root)).toBe("42.00");
    pressLabel(root, "Reset calculator");
    pressLabel(root, "Recall memory");
    expect(displayValue(root)).toBe("0.00");
  });
});
