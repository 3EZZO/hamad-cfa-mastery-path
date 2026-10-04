import { describe, expect, it } from "vitest";
import {
  MOCK_MODULES,
  MOCK_TOPICS,
  mockModuleById,
  mockModuleCode,
  mockModuleLabel,
  mockModuleOrder,
  mockModulesInTopic,
} from "./mockModules";

describe("MOCK_MODULES", () => {
  it("covers Quantitative Methods modules 1 to 11 in order", () => {
    expect(mockModulesInTopic("Quantitative Methods").map(module => module.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("covers Economics modules 1 to 8 in order", () => {
    expect(mockModulesInTopic("Economics").map(module => module.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("lists topics in curriculum order, each module once", () => {
    expect(MOCK_TOPICS).toEqual(["Quantitative Methods", "Economics"]);
    expect(MOCK_TOPICS.flatMap(topic => mockModulesInTopic(topic))).toEqual([...MOCK_MODULES]);
  });

  it("uses unique ids that the mock test upload accepts", () => {
    const ids = MOCK_MODULES.map(module => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const module of MOCK_MODULES) {
      expect(module.id).toMatch(module.topic === "Economics" ? /^e\d{2}-[a-z0-9-]+$/ : /^m\d{2}-[a-z0-9-]+$/);
      expect(Number(module.id.slice(1, 3))).toBe(module.number);
    }
  });

  it("keeps the ids of published tests unchanged", () => {
    expect(MOCK_MODULES.slice(0, 4).map(module => module.id)).toEqual([
      "m01-rates-and-returns",
      "m02-time-value-of-money",
      "m03-statistical-measures",
      "m04-probability-trees",
    ]);
    expect(mockModulesInTopic("Economics").map(module => module.id)).toEqual([
      "e01-firm-and-market-structures",
      "e02-understanding-business-cycles",
      "e03-fiscal-policy",
      "e04-monetary-policy",
      "e05-introduction-to-geopolitics",
      "e06-international-trade",
      "e07-capital-flows-fx-market",
      "e08-exchange-rate-calculations",
    ]);
  });

  it("finds a module by id", () => {
    expect(mockModuleById("m11-big-data-techniques")?.number).toBe(11);
    expect(mockModuleById("e03-fiscal-policy")?.topic).toBe("Economics");
    expect(mockModuleById("m99-unknown")).toBeUndefined();
  });

  it("labels modules unambiguously across topics", () => {
    const quant1 = mockModuleById("m01-rates-and-returns")!;
    const econ1 = mockModuleById("e01-firm-and-market-structures")!;
    expect(mockModuleLabel(quant1)).toBe("Quant · Module 1");
    expect(mockModuleLabel(econ1)).toBe("Economics · Module 1");
    expect(mockModuleCode(quant1)).toBe("QM1");
    expect(mockModuleCode(econ1)).toBe("EC1");
  });

  it("orders ids by topic, then number, with unknown ids last", () => {
    expect(mockModuleOrder("m11-big-data-techniques")).toBeLessThan(mockModuleOrder("e01-firm-and-market-structures"));
    expect(mockModuleOrder("m99-unknown")).toBe(MOCK_MODULES.length);
  });
});
