import { describe, expect, it } from "vitest";
import {
  addPracticeMistake,
  bridgedQuestionIds,
  buildPracticeMistake,
  practiceMistakeId,
} from "./practiceMistakeBridge";
import type { PracticeQuestion } from "./practiceContent";
import { createDefaultState, normalizeState } from "./storage";

// Synthetic fixture only.
const question: PracticeQuestion = {
  id: "q-hpr-01",
  moduleId: "m001-returns",
  conceptId: "hpr",
  type: "calculation",
  difficulty: 3,
  estimatedSeconds: 90,
  prompt: "A share bought at 50 pays a 2 dividend and sells at 54. Holding-period return?",
  options: ["8%", "12%", "4%"],
  correctOption: 1,
  explanation: "HPR = (54 - 50 + 2) / 50 = 12%.",
  working: [],
  formulae: ["HPR = (P1 - P0 + D) / P0"],
  distractorExplanations: ["Ignores the dividend.", "Correct.", "Uses the dividend only."],
  examTrap: "Add the dividend to the price change before dividing.",
  tags: [],
};

describe("buildPracticeMistake", () => {
  it("files the miss under the bank topic with a three-day retest and a deterministic id", () => {
    const entry = buildPracticeMistake({
      question, topic: "Quantitative Methods", bankId: "bank-01", selectedOption: 0, date: "2026-10-03",
    });
    expect(entry).toMatchObject({
      id: "practice-miss-q-hpr-01",
      date: "2026-10-03",
      topic: "Quantitative Methods",
      category: "Formula / process",
      summary: question.prompt,
      revisitDate: "2026-10-06",
      resolved: false,
      questionId: "q-hpr-01",
      bankId: "bank-01",
    });
    expect(entry!.correction).toBe(
      "Correct: 12%. Chose: 8%. HPR = (54 - 50 + 2) / 50 = 12%. Exam trap: Add the dividend to the price change before dividing.",
    );
    expect(practiceMistakeId("x")).toBe("practice-miss-x");
  });

  it("maps question types to vault categories", () => {
    const category = (type: PracticeQuestion["type"]) =>
      buildPracticeMistake({ question: { ...question, type }, topic: "Economics", bankId: "b", selectedOption: 2, date: "2026-10-03" })!.category;
    expect(category("concept")).toBe("Concept gap");
    expect(category("interpretation")).toBe("Reading error");
    expect(category("trap")).toBe("Confidence error");
  });

  it("refuses a topic the vault cannot file under", () => {
    expect(buildPracticeMistake({ question, topic: "Mixed Curriculum", bankId: "b", selectedOption: 0, date: "2026-10-03" })).toBeNull();
  });
});

describe("addPracticeMistake", () => {
  const entry = buildPracticeMistake({ question, topic: "Quantitative Methods", bankId: "bank-01", selectedOption: 0, date: "2026-10-03" })!;

  it("adds once and then leaves the existing entry untouched", () => {
    const first = addPracticeMistake(createDefaultState(), entry);
    expect(first.added).toBe(true);
    expect(first.tracker.errorEntries).toEqual([entry]);
    const edited = { ...first.tracker, errorEntries: [{ ...entry, resolved: true, correction: "Tutor rewrote this." }] };
    const second = addPracticeMistake(edited, entry);
    expect(second.added).toBe(false);
    expect(second.tracker).toBe(edited);
    expect(bridgedQuestionIds(second.tracker.errorEntries)).toEqual(new Set(["q-hpr-01"]));
  });

  it("survives normalisation with its bridge fields, and drops junk ids", () => {
    const normalized = normalizeState({
      ...createDefaultState(),
      errorEntries: [entry, { ...entry, id: "manual", questionId: 42, bankId: "" }],
    });
    expect(normalized.errorEntries[0]).toMatchObject({ questionId: "q-hpr-01", bankId: "bank-01" });
    expect(normalized.errorEntries[1]).not.toHaveProperty("questionId");
    expect(normalized.errorEntries[1]).not.toHaveProperty("bankId");
  });
});
