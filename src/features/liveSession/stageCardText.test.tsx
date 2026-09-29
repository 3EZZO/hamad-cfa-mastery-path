import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText, questionSpecificLines } from "./StageCard";

describe("Teaching focus text", () => {
  it("renders dash lines as a real bullet list and keeps plain text as one paragraph", () => {
    expect(renderToStaticMarkup(<RichText text="One plain sentence." />)).toBe("<p>One plain sentence.</p>");
    const html = renderToStaticMarkup(<RichText text={"Use the growing perpetuity because:\n- cash flows grow forever\n- r > g"} />);
    expect(html).toBe('<p>Use the growing perpetuity because:</p><ul class="ls-rich-list"><li>cash flows grow forever</li><li>r &gt; g</li></ul>');
  });

  it("turns inline dash lists into bullets without splitting formulas", () => {
    const html = renderToStaticMarkup(<RichText text="Calculation and interpretation: - PV = 5.20 / (0.09 - 0.03). - PV = USD 86.67." />);
    expect(html).toBe('<p>Calculation and interpretation:</p><ul class="ls-rich-list"><li>PV = 5.20 / (0.09 - 0.03).</li><li>PV = USD 86.67.</li></ul>');
  });

  it("keeps only the question-specific working lines in Answer", () => {
    expect(questionSpecificLines(
      ["PV = C1 / (r - g)", "PV = 5.20 / (0.09 - 0.03)", "PV = USD 86.67"],
      ["PV  =  c1 / (r - g)"],
    )).toEqual(["PV = 5.20 / (0.09 - 0.03)", "PV = USD 86.67"]);
  });
});
