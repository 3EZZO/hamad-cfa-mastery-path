/**
 * CFA Level I modules that carry a compulsory module mock test. The id is the
 * Firestore document id for the test, its questions, key and review, and the
 * suffix of every attempt id (`<uid>_<moduleId>`), so it must never change
 * once a test has been published.
 */
export interface MockModule {
  id: string;
  number: number;
  title: string;
}

export const MOCK_MODULES: readonly MockModule[] = [
  { id: "m01-rates-and-returns", number: 1, title: "Rates and Returns" },
  { id: "m02-time-value-of-money", number: 2, title: "The Time Value of Money in Finance" },
  { id: "m03-statistical-measures", number: 3, title: "Statistical Measures of Asset Returns" },
  { id: "m04-probability-trees", number: 4, title: "Probability Trees and Conditional Expectations" },
];

export function mockModuleById(id: string): MockModule | undefined {
  return MOCK_MODULES.find(module => module.id === id);
}
