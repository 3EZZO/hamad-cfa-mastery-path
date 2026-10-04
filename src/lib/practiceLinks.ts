import type { MockModule } from "../data/mockModules";
import type { PracticeModuleInsight } from "./practiceInsights";

/**
 * Links between practice sets and curriculum modules. Practice banks use their
 * own module ids (`m004-tvm-valuation`); the `mNNN` prefix names the catalog
 * module (`cfa-2027-outline-m004`). Ids without that prefix are not guessed.
 * Kept free of the plan and catalog data so the Tests page stays light.
 */
const CATALOG_PREFIX = "cfa-2027-outline-m";

export function catalogIdForPracticeModule(moduleId: string): string | null {
  const match = /^m(\d{3})(?:-|$)/i.exec(moduleId);
  return match ? `${CATALOG_PREFIX}${match[1]}` : null;
}

/**
 * The practice set to open after a module test: among the student's assigned
 * practice modules (`insights`, weakest first as buildPracticeInsights orders
 * them), the first that teaches one of the test's curriculum modules. Null
 * when no assigned practice set covers the test yet.
 */
export function practiceModuleForTest(
  test: Pick<MockModule, "catalogIds">,
  insights: readonly Pick<PracticeModuleInsight, "moduleId">[],
): string | null {
  const wanted = new Set(test.catalogIds);
  return insights.find(insight => {
    const catalogId = catalogIdForPracticeModule(insight.moduleId);
    return catalogId !== null && wanted.has(catalogId);
  })?.moduleId ?? null;
}
