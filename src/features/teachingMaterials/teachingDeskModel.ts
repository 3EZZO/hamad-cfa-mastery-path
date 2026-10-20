import { normalizeReadingTopic, READING_CATALOG } from "../../data/readings";
import type { TeachingSessionEnvelope } from "../liveSession/teachingHost";
import type { LibraryEntry } from "./libraryModel";
import { compareMaterialLabels, MATERIAL_TOPICS, type MaterialTopic } from "./materialDetails";

export interface SessionModule {
  number: number;
  title: string;
  topic: MaterialTopic;
}

export const UP_NEXT_LIMIT = 3;

function asMaterialTopic(topic: string): MaterialTopic | null {
  const name = normalizeReadingTopic(topic);
  return MATERIAL_TOPICS.find(item => item !== "Supplementary" && item === name) ?? null;
}

/** Curriculum modules the plan assigns to this session, in outline order. */
export function sessionModules(sessionNumber: number): SessionModule[] {
  return READING_CATALOG.readings
    .filter(reading => reading.sessionNumbers.includes(sessionNumber))
    .flatMap(reading => {
      const topic = asMaterialTopic(reading.topic);
      return topic ? [{ number: reading.number, title: reading.title, topic }] : [];
    })
    .sort((a, b) => a.number - b.number);
}

/** Topics taught in this session: its modules' topics, else the plan week's topic. */
export function sessionTopics(sessionNumber: number, weekTopic: MaterialTopic | null): MaterialTopic[] {
  const topics = [...new Set(sessionModules(sessionNumber).map(module => module.topic))];
  return topics.length ? topics : weekTopic ? [weekTopic] : [];
}

/** PDFs opened for teaching in earlier sessions' private records. */
export function taughtEarlier(envelopes: readonly (TeachingSessionEnvelope | null)[]): Set<string> {
  return new Set(envelopes.flatMap(envelope => (envelope && !envelope.rehearsal ? envelope.history.map(entry => entry.versionId) : [])));
}

/**
 * The next PDFs to teach: current versions in the session's topics that no
 * earlier session has opened, in topic order and then reading/module order.
 * Reading numbers are not matched to the outline, whose numbering differs.
 */
export function upNext(entries: readonly LibraryEntry[], topics: readonly MaterialTopic[], taught: ReadonlySet<string>) {
  const candidates = entries
    .filter(entry => entry.version.versionId === entry.material.currentVersionId
      && topics.includes(entry.topic) && !taught.has(entry.version.versionId))
    .sort((a, b) => topics.indexOf(a.topic) - topics.indexOf(b.topic) || compareMaterialLabels(a.version, b.version));
  return { items: candidates.slice(0, UP_NEXT_LIMIT), more: Math.max(0, candidates.length - UP_NEXT_LIMIT) };
}

/**
 * Where to continue: this session's chosen PDF, else the PDF chosen in the
 * most recently updated earlier session, provided it is still in the library.
 */
export function resumeEntry(
  entries: readonly LibraryEntry[],
  currentSelection: string | null,
  earlier: readonly (TeachingSessionEnvelope | null)[],
): LibraryEntry | null {
  const find = (versionId: string | null) => (versionId ? entries.find(entry => entry.version.versionId === versionId) ?? null : null);
  const current = find(currentSelection);
  if (current) return current;
  const latest = earlier
    .filter((envelope): envelope is TeachingSessionEnvelope => !!envelope && !envelope.rehearsal && !!envelope.selectedVersionId)
    .sort((a, b) => Date.parse(b.updatedAtClient) - Date.parse(a.updatedAtClient));
  for (const envelope of latest) {
    const entry = find(envelope.selectedVersionId);
    if (entry) return entry;
  }
  return null;
}
