import { describe, expect, it } from "vitest";
import { shortTitle } from "./WeeklyView";

describe("week selector titles", () => {
  it("keeps short titles and cuts long ones at a word boundary with an ellipsis", () => {
    expect(shortTitle("Ethics and Professional Standards")).toBe("Ethics and Professional Standards");
    const long = "Quantitative Methods III and Economics I: data science, firms, cycles, policy, and geopolitics";
    const cut = shortTitle(long);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(49);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut).toBe("Quantitative Methods III and Economics I: data…");
  });
});
