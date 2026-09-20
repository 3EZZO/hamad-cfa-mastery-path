import { describe, expect, it, vi } from "vitest";
import { filterCommands, scoreCommand, type PaletteCommand } from "./commandPalette";

const commands: PaletteCommand[] = [
  { id: "dashboard", label: "Home", group: "Go to", run: vi.fn() },
  { id: "mocks", label: "Mock Results", group: "Go to", hint: "Trend the score", run: vi.fn() },
  { id: "practice", label: "Practice", group: "Go to", keywords: ["questions", "quick 5"], run: vi.fn() },
  { id: "log-mock", label: "Log a mock", group: "Actions", run: vi.fn() },
  { id: "theme", label: "Toggle dark theme", group: "Actions", keywords: ["light", "appearance"], run: vi.fn() },
];

const ids = (list: PaletteCommand[]) => list.map(command => command.id);

describe("command palette filtering", () => {
  it("returns everything in original order for an empty query", () => {
    expect(ids(filterCommands("", commands))).toEqual(ids(commands));
    expect(ids(filterCommands("   ", commands))).toEqual(ids(commands));
  });

  it("ranks label prefix over word prefix over keyword/hint matches", () => {
    expect(scoreCommand("mo", commands[1])).toBe(3);
    expect(scoreCommand("res", commands[1])).toBe(2);
    expect(scoreCommand("score", commands[1])).toBe(1);
    expect(scoreCommand("quick", commands[2])).toBe(1);
    expect(scoreCommand("zzz", commands[2])).toBe(0);
    expect(ids(filterCommands("mo", commands))).toEqual(["mocks", "log-mock"]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(ids(filterCommands("  DARK  ", commands))).toEqual(["theme"]);
    expect(ids(filterCommands("Quick  5", commands))).toEqual(["practice"]);
  });

  it("drops non-matching commands", () => {
    expect(filterCommands("payments", commands)).toEqual([]);
  });
});
