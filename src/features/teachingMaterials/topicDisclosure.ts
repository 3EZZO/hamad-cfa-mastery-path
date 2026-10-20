import { useCallback, useState } from "react";
import { MATERIAL_TOPICS, type MaterialTopic } from "./materialDetails";

/** Explicit open/closed choices; topics without a choice follow the defaults. */
export type TopicChoices = Partial<Record<MaterialTopic, boolean>>;

const STORAGE_PREFIX = "hamad-pdf-topics:";

/** The library topic for a session's curriculum topic; mixed or mock weeks have none. */
export function materialTopicForSession(sessionTopic: string | null | undefined): MaterialTopic | null {
  return MATERIAL_TOPICS.find(topic => topic !== "Supplementary" && topic === sessionTopic) ?? null;
}

export function parseTopicChoices(raw: string | null): TopicChoices {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const choices: TopicChoices = {};
    for (const topic of MATERIAL_TOPICS) {
      const choice = (value as Record<string, unknown>)[topic];
      if (typeof choice === "boolean") choices[topic] = choice;
    }
    return choices;
  } catch {
    return {};
  }
}

/**
 * While searching, every group with a match opens unless it was closed during
 * this search. Otherwise a remembered choice wins, then the defaults; with no
 * default topic at all (mixed weeks), every group opens.
 */
export function isTopicOpen(topic: MaterialTopic, state: {
  choices: TopicChoices;
  searchChoices: TopicChoices;
  searching: boolean;
  defaultOpen: readonly MaterialTopic[];
}): boolean {
  if (state.searching) return state.searchChoices[topic] ?? true;
  return state.choices[topic] ?? (state.defaultOpen.length ? state.defaultOpen.includes(topic) : true);
}

function readChoices(key: string): TopicChoices {
  try {
    return parseTopicChoices(localStorage.getItem(STORAGE_PREFIX + key));
  } catch {
    return {};
  }
}

function writeChoices(key: string, choices: TopicChoices) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(choices));
  } catch {
    /* Remembering the open topics is a per-device convenience only. */
  }
}

export function useTopicDisclosure(storageKey: string, defaultOpen: readonly MaterialTopic[], searching = false) {
  const [state, setState] = useState(() => ({ key: storageKey, choices: readChoices(storageKey) }));
  const [searchChoices, setSearchChoices] = useState<TopicChoices>({});
  const [wasSearching, setWasSearching] = useState(searching);
  const choices = state.key === storageKey ? state.choices : readChoices(storageKey);
  if (state.key !== storageKey) setState({ key: storageKey, choices });
  // A new search starts with every matching group open again.
  if (wasSearching !== searching) {
    setWasSearching(searching);
    setSearchChoices({});
  }

  const isOpen = (topic: MaterialTopic) => isTopicOpen(topic, { choices, searchChoices, searching, defaultOpen });

  const setOpen = useCallback((topics: readonly MaterialTopic[], open: boolean) => {
    if (searching) {
      setSearchChoices(current => ({ ...current, ...Object.fromEntries(topics.map(topic => [topic, open])) }));
      return;
    }
    setState(current => {
      const next = { ...current.choices, ...Object.fromEntries(topics.map(topic => [topic, open])) };
      writeChoices(current.key, next);
      return { key: current.key, choices: next };
    });
  }, [searching]);

  return { isOpen, setOpen };
}
