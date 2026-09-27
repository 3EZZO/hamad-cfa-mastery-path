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
  { id: "m05-portfolio-mathematics", number: 5, title: "Portfolio Mathematics" },
  { id: "m06-simulation-methods", number: 6, title: "Simulation Methods" },
  { id: "m07-estimation-and-inference", number: 7, title: "Estimation and Inference" },
  { id: "m08-hypothesis-testing", number: 8, title: "Hypothesis Testing" },
  { id: "m09-parametric-nonparametric", number: 9, title: "Parametric and Non-Parametric Tests of Independence" },
  { id: "m10-simple-linear-regression", number: 10, title: "Simple Linear Regression" },
  { id: "m11-big-data-techniques", number: 11, title: "Introduction to Big Data Techniques" },
];

export function mockModuleById(id: string): MockModule | undefined {
  return MOCK_MODULES.find(module => module.id === id);
}
