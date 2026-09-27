import { describe, expect, it } from "vitest";
import { MOCK_MODULES, mockModuleById } from "./mockModules";

describe("MOCK_MODULES", () => {
  it("covers Quantitative Methods modules 1 to 11 in order", () => {
    expect(MOCK_MODULES.map(module => module.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("uses unique ids that the mock test upload accepts", () => {
    const ids = MOCK_MODULES.map(module => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^m\d{2}-[a-z0-9-]+$/);
  });

  it("keeps the ids of published tests unchanged", () => {
    expect(MOCK_MODULES.slice(0, 4).map(module => module.id)).toEqual([
      "m01-rates-and-returns",
      "m02-time-value-of-money",
      "m03-statistical-measures",
      "m04-probability-trees",
    ]);
  });

  it("finds a module by id", () => {
    expect(mockModuleById("m11-big-data-techniques")?.number).toBe(11);
    expect(mockModuleById("m99-unknown")).toBeUndefined();
  });
});
