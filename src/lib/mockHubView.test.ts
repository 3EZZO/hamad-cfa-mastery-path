import { describe, expect, it } from "vitest";
import { defaultHubView, parseHubView } from "./mockHubView";

describe("parseHubView", () => {
  it("falls back to the default for missing or broken data", () => {
    expect(parseHubView(null)).toEqual(defaultHubView());
    expect(parseHubView("not json")).toEqual(defaultHubView());
  });

  it("keeps valid choices and drops unknown topics and values", () => {
    expect(parseHubView(JSON.stringify({
      topic: "Economics",
      open: { "Quantitative Methods": false, Economics: true, Ethics: true },
      doneOpen: { Economics: "yes" },
    }))).toEqual({ topic: "Economics", open: { "Quantitative Methods": false, Economics: true }, doneOpen: {} });
    expect(parseHubView(JSON.stringify({ topic: "Derivatives" })).topic).toBe("all");
  });
});
