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
}

/** Topics in curriculum order, which is also the display order. */
export const MOCK_TOPICS: readonly MockTopic[] = ["Quantitative Methods", "Economics"];

const QM: MockTopic = "Quantitative Methods";
const EC: MockTopic = "Economics";

export const MOCK_MODULES: readonly MockModule[] = [
  { id: "m01-rates-and-returns", topic: QM, number: 1, title: "Rates and Returns" },
  { id: "m02-time-value-of-money", topic: QM, number: 2, title: "The Time Value of Money in Finance" },
  { id: "m03-statistical-measures", topic: QM, number: 3, title: "Statistical Measures of Asset Returns" },
  { id: "m04-probability-trees", topic: QM, number: 4, title: "Probability Trees and Conditional Expectations" },
  { id: "m05-portfolio-mathematics", topic: QM, number: 5, title: "Portfolio Mathematics" },
  { id: "m06-simulation-methods", topic: QM, number: 6, title: "Simulation Methods" },
  { id: "m07-estimation-and-inference", topic: QM, number: 7, title: "Estimation and Inference" },
  { id: "m08-hypothesis-testing", topic: QM, number: 8, title: "Hypothesis Testing" },
  { id: "m09-parametric-nonparametric", topic: QM, number: 9, title: "Parametric and Non-Parametric Tests of Independence" },
  { id: "m10-simple-linear-regression", topic: QM, number: 10, title: "Simple Linear Regression" },
  { id: "m11-big-data-techniques", topic: QM, number: 11, title: "Introduction to Big Data Techniques" },
  { id: "e01-firm-and-market-structures", topic: EC, number: 1, title: "The Firm and Market Structures" },
  { id: "e02-understanding-business-cycles", topic: EC, number: 2, title: "Understanding Business Cycles" },
  { id: "e03-fiscal-policy", topic: EC, number: 3, title: "Fiscal Policy" },
  { id: "e04-monetary-policy", topic: EC, number: 4, title: "Monetary Policy" },
  { id: "e05-introduction-to-geopolitics", topic: EC, number: 5, title: "Introduction to Geopolitics" },
  { id: "e06-international-trade", topic: EC, number: 6, title: "International Trade" },
  { id: "e07-capital-flows-fx-market", topic: EC, number: 7, title: "Capital Flows and the FX Market" },
  { id: "e08-exchange-rate-calculations", topic: EC, number: 8, title: "Exchange Rate Calculations" },
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
