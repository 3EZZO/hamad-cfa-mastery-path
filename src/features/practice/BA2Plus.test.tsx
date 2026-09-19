import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultTVMState } from "../../lib/calculator";
import { BA2Plus } from "./BA2Plus";

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
    expect(markup).toContain("Statistics worksheet is not available yet");
    expect(markup).toContain("Bond worksheet is not available yet");
    expect(markup).toContain("AMORT · N/A");
    expect(markup).toContain("STAT · N/A");
    expect(markup).toContain("BOND · N/A");
  });
});
