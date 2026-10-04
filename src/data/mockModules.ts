/**
 * CFA Level I modules that carry a compulsory module mock test. The id is the
 * Firestore document id for the test, its questions, key and review, and the
 * suffix of every attempt id (`<uid>_<moduleId>`), so it must never change
 * once a test has been published. Numbers restart at 1 in each topic, so a
 * module is only unambiguous together with its topic (see mockModuleLabel).
 */
export type MockTopic = "Quantitative Methods" | "Economics";

export interface MockModule {
  id: string;
  topic: MockTopic;
  number: number;
  title: string;
  /**
   * The official 2027 curriculum modules (READING_CATALOG ids) this test
   * assesses. Links a test to the study-plan weeks that teach those modules
   * and to the practice sets for them. The Quant tests follow the 2025-26
   * module names, so some map to two catalog modules (owner-approved
   * mapping, 2026-10-04).
   */
  catalogIds: readonly string[];
}

/** Topics in curriculum order, which is also the display order. */
export const MOCK_TOPICS: readonly MockTopic[] = ["Quantitative Methods", "Economics"];

const QM: MockTopic = "Quantitative Methods";
const EC: MockTopic = "Economics";
const m = (number: number) => `cfa-2027-outline-m${String(number).padStart(3, "0")}`;

export const MOCK_MODULES: readonly MockModule[] = [
  { id: "m01-rates-and-returns", topic: QM, number: 1, title: "Rates and Returns", catalogIds: [m(1), m(2)] },
  { id: "m02-time-value-of-money", topic: QM, number: 2, title: "The Time Value of Money in Finance", catalogIds: [m(4)] },
  { id: "m03-statistical-measures", topic: QM, number: 3, title: "Statistical Measures of Asset Returns", catalogIds: [m(5)] },
  { id: "m04-probability-trees", topic: QM, number: 4, title: "Probability Trees and Conditional Expectations", catalogIds: [m(5), m(6)] },
  { id: "m05-portfolio-mathematics", topic: QM, number: 5, title: "Portfolio Mathematics", catalogIds: [m(8)] },
  { id: "m06-simulation-methods", topic: QM, number: 6, title: "Simulation Methods", catalogIds: [m(9)] },
  { id: "m07-estimation-and-inference", topic: QM, number: 7, title: "Estimation and Inference", catalogIds: [m(7)] },
  { id: "m08-hypothesis-testing", topic: QM, number: 8, title: "Hypothesis Testing", catalogIds: [m(7)] },
  { id: "m09-parametric-nonparametric", topic: QM, number: 9, title: "Parametric and Non-Parametric Tests of Independence", catalogIds: [m(7)] },
  { id: "m10-simple-linear-regression", topic: QM, number: 10, title: "Simple Linear Regression", catalogIds: [m(10)] },
  { id: "m11-big-data-techniques", topic: QM, number: 11, title: "Introduction to Big Data Techniques", catalogIds: [m(11)] },
  { id: "e01-firm-and-market-structures", topic: EC, number: 1, title: "The Firm and Market Structures", catalogIds: [m(12)] },
  { id: "e02-understanding-business-cycles", topic: EC, number: 2, title: "Understanding Business Cycles", catalogIds: [m(13)] },
  { id: "e03-fiscal-policy", topic: EC, number: 3, title: "Fiscal Policy", catalogIds: [m(14)] },
  { id: "e04-monetary-policy", topic: EC, number: 4, title: "Monetary Policy", catalogIds: [m(15)] },
  { id: "e05-introduction-to-geopolitics", topic: EC, number: 5, title: "Introduction to Geopolitics", catalogIds: [m(16)] },
  { id: "e06-international-trade", topic: EC, number: 6, title: "International Trade", catalogIds: [m(17)] },
  { id: "e07-capital-flows-fx-market", topic: EC, number: 7, title: "Capital Flows and the FX Market", catalogIds: [m(18)] },
  { id: "e08-exchange-rate-calculations", topic: EC, number: 8, title: "Exchange Rate Calculations", catalogIds: [m(19)] },
];

const TOPIC_LABEL: Record<MockTopic, { short: string; code: string }> = {
  "Quantitative Methods": { short: "Quant", code: "QM" },
  Economics: { short: "Economics", code: "EC" },
};

export function mockModuleById(id: string): MockModule | undefined {
  return MOCK_MODULES.find(module => module.id === id);
}

export function mockModulesInTopic(topic: MockTopic): MockModule[] {
  return MOCK_MODULES.filter(module => module.topic === topic);
}

/** Module tests that assess any of the given curriculum modules, in curriculum order. */
export function mockModulesForCatalog(catalogIds: Iterable<string>): MockModule[] {
  const wanted = new Set(catalogIds);
  return MOCK_MODULES.filter(module => module.catalogIds.some(id => wanted.has(id)));
}

/** "Quant · Module 3", "Economics · Module 1": unambiguous across topics. */
export function mockModuleLabel(module: MockModule): string {
  return `${TOPIC_LABEL[module.topic].short} · Module ${module.number}`;
}

/** Compact code for tables and lists: "QM3", "EC1". */
export function mockModuleCode(module: MockModule): string {
  return `${TOPIC_LABEL[module.topic].code}${module.number}`;
}

/** Position in curriculum order (topic, then number); unknown ids sort last. */
export function mockModuleOrder(id: string): number {
  const index = MOCK_MODULES.findIndex(module => module.id === id);
  return index === -1 ? MOCK_MODULES.length : index;
}
