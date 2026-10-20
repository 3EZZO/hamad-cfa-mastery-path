import { describe, expect, it } from "vitest";
import { TOPICS } from "../../data/plan";
import { MATERIAL_TOPICS } from "./materialDetails";
import { isTopicOpen, materialTopicForSession, parseTopicChoices } from "./topicDisclosure";

const base = { choices: {}, searchChoices: {}, searching: false, defaultOpen: ["Economics"] as const };

describe("collapsible PDF topics", () => {
  it("maps every curriculum topic to a library topic and mixed weeks to none", () => {
    for (const topic of TOPICS) expect(materialTopicForSession(topic)).toBe(topic);
    expect(materialTopicForSession("Mixed Curriculum")).toBeNull();
    expect(materialTopicForSession("Supplementary")).toBeNull();
    expect(materialTopicForSession(undefined)).toBeNull();
  });

  it("opens the session topic and collapses the others by default", () => {
    expect(isTopicOpen("Economics", base)).toBe(true);
    expect(isTopicOpen("Quantitative Methods", base)).toBe(false);
  });

  it("opens every topic when the session has no topic", () => {
    expect(MATERIAL_TOPICS.every(topic => isTopicOpen(topic, { ...base, defaultOpen: [] }))).toBe(true);
  });

  it("lets a remembered choice override the default", () => {
    const choices = { Economics: false, "Quantitative Methods": true };
    expect(isTopicOpen("Economics", { ...base, choices })).toBe(false);
    expect(isTopicOpen("Quantitative Methods", { ...base, choices })).toBe(true);
  });

  it("opens all matching groups while searching, except those closed during the search", () => {
    const searching = { ...base, choices: { Economics: false }, searching: true };
    expect(isTopicOpen("Economics", searching)).toBe(true);
    expect(isTopicOpen("Fixed Income", searching)).toBe(true);
    expect(isTopicOpen("Fixed Income", { ...searching, searchChoices: { "Fixed Income": false } })).toBe(false);
  });

  it("ignores malformed or unknown stored choices", () => {
    expect(parseTopicChoices(null)).toEqual({});
    expect(parseTopicChoices("not json")).toEqual({});
    expect(parseTopicChoices("[true]")).toEqual({});
    expect(parseTopicChoices(JSON.stringify({ Economics: false, Astrology: true, Derivatives: "yes" }))).toEqual({ Economics: false });
  });
});
