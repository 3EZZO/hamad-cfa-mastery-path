import { expect, it, vi } from "vitest";
import { quickCheckCatalogIds, quickCheckPool } from "./quickCheckModel";

vi.mock("../../data/mockModules", () => ({ MOCK_MODULES: [
  { id: "a", title: "Ambiguous PDF", topic: "Economics", catalogIds: ["cfa-2027-outline-m014"] },
  { id: "b", title: "Ambiguous PDF", topic: "Economics", catalogIds: ["cfa-2027-outline-m015"] },
] }));

it("refuses conflicting title mappings instead of merging unrelated curriculum questions", () => {
  const pdf = { title: "Ambiguous PDF", topic: "Economics" };
  expect(quickCheckCatalogIds(pdf)).toEqual([]);
  expect(quickCheckPool([], pdf)).toEqual({ items: [], moduleNumbers: [], scope: "none" });
});
