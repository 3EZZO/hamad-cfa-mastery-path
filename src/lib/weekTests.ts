import { mockModulesForCatalog, type MockModule } from "../data/mockModules";
import { getWeekSessions, PLAN } from "../data/plan";

/**
 * Module tests that belong to a study-plan week: the tests whose curriculum
 * modules are assigned to that week's sessions. Outside the plan (before the
 * start, after the last week) there are none.
 */
export function weekCatalogIds(weekNumber: number): string[] {
  const week = PLAN[weekNumber - 1];
  if (!week) return [];
  return [...new Set(getWeekSessions(week).flatMap(session => session.readings ?? []))];
}

export function testsForWeek(weekNumber: number): MockModule[] {
  return mockModulesForCatalog(weekCatalogIds(weekNumber));
}
