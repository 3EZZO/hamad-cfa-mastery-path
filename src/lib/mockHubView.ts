import { MOCK_TOPICS, type MockTopic } from "../data/mockModules";

/**
 * How the Tests page is laid out on this device: the selected topic and the
 * sections the viewer opened or closed. Only explicit choices are stored, so
 * a topic without one follows its default (open while it has work to do).
 */
export type HubTopicFilter = "all" | MockTopic;

export interface MockHubView {
  topic: HubTopicFilter;
  open: Partial<Record<MockTopic, boolean>>;
  doneOpen: Partial<Record<MockTopic, boolean>>;
}

export const MOCK_HUB_VIEW_KEY = "hamad-mock-hub-view";

export function defaultHubView(): MockHubView {
  return { topic: "all", open: {}, doneOpen: {} };
}

function flags(value: unknown): Partial<Record<MockTopic, boolean>> {
  const result: Partial<Record<MockTopic, boolean>> = {};
  if (typeof value !== "object" || value === null) return result;
  for (const topic of MOCK_TOPICS) {
    const flag = (value as Record<string, unknown>)[topic];
    if (typeof flag === "boolean") result[topic] = flag;
  }
  return result;
}

export function parseHubView(raw: string | null): MockHubView {
  if (!raw) return defaultHubView();
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const topic = MOCK_TOPICS.includes(value.topic as MockTopic) ? (value.topic as MockTopic) : "all";
    return { topic, open: flags(value.open), doneOpen: flags(value.doneOpen) };
  } catch {
    return defaultHubView();
  }
}

export function loadHubView(): MockHubView {
  try { return parseHubView(localStorage.getItem(MOCK_HUB_VIEW_KEY)); }
  catch { return defaultHubView(); }
}

export function saveHubView(view: MockHubView): void {
  try { localStorage.setItem(MOCK_HUB_VIEW_KEY, JSON.stringify(view)); } catch { /* Keep working in memory. */ }
}
