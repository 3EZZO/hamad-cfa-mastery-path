import type { ComponentType } from "react";

export type CommandGroup = "Go to" | "Actions";

export interface PaletteCommand {
  id: string;
  label: string;
  group: CommandGroup;
  /** Secondary line under the label. */
  hint?: string;
  /** Extra words the query may match, e.g. synonyms. */
  keywords?: string[];
  /** Display-only shortcut, e.g. "Alt+3". */
  shortcut?: string;
  icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
  run: () => void;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Ranks a command for a query: 3 = label starts with it, 2 = a label word
 * starts with it, 1 = label or keywords contain it, 0 = no match.
 */
export function scoreCommand(query: string, command: PaletteCommand): number {
  const needle = normalize(query);
  if (!needle) return 1;
  const label = normalize(command.label);
  if (label.startsWith(needle)) return 3;
  if (label.split(" ").some(word => word.startsWith(needle))) return 2;
  const haystack = [label, command.hint ?? "", ...(command.keywords ?? [])]
    .map(normalize)
    .join(" ");
  return haystack.includes(needle) ? 1 : 0;
}

/**
 * Filters and orders commands for the palette: better matches first, then
 * the original order (so "Go to" entries keep their navigation order and
 * precede actions when scores tie).
 */
export function filterCommands(
  query: string,
  commands: readonly PaletteCommand[],
): PaletteCommand[] {
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(query, command) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.command);
}
