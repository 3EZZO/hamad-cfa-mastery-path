import { TOPICS } from "./plan";

export type CurriculumTopic = (typeof TOPICS)[number];

export interface ExamWeight {
  /** Lower bound of the published range, percent of the exam. */
  min: number;
  /** Upper bound of the published range, percent of the exam. */
  max: number;
}

/**
 * CFA Program Level I topic weights, as published by CFA Institute.
 *
 * OWNER TO CONFIRM against the 2027 Level I topic outline before relying on
 * them; update the ranges here if the 2027 outline differs. Used only to
 * order and weight the Progress heatmap — never as a pass prediction.
 */
export const EXAM_WEIGHTS: Record<CurriculumTopic, ExamWeight> = {
  "Ethical and Professional Standards": { min: 15, max: 20 },
  "Quantitative Methods": { min: 6, max: 9 },
  Economics: { min: 6, max: 9 },
  "Financial Statement Analysis": { min: 11, max: 14 },
  "Corporate Issuers": { min: 6, max: 9 },
  "Equity Investments": { min: 11, max: 14 },
  "Fixed Income": { min: 11, max: 14 },
  Derivatives: { min: 5, max: 8 },
  "Alternative Investments": { min: 7, max: 10 },
  "Portfolio Management": { min: 8, max: 12 },
};

export function weightMidpoint(topic: CurriculumTopic): number {
  const weight = EXAM_WEIGHTS[topic];
  return (weight.min + weight.max) / 2;
}

export function formatExamWeight(topic: CurriculumTopic): string {
  const weight = EXAM_WEIGHTS[topic];
  return `${weight.min}–${weight.max}%`;
}
