export const PRACTICE_BANK_SCHEMA_VERSION = 1 as const;

export type PracticeQuestionType =
  | "concept"
  | "calculation"
  | "interpretation"
  | "trap";

export interface PracticeQuestion {
  id: string;
  moduleId: string;
  conceptId: string;
  type: PracticeQuestionType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedSeconds: number;
  prompt: string;
  options: [string, string, string];
  correctOption: 0 | 1 | 2;
  explanation: string;
  working: string[];
  formulae: string[];
  distractorExplanations: [string, string, string];
  examTrap: string;
  tags: string[];
}

export interface PracticeBankDraft {
  schemaVersion: typeof PRACTICE_BANK_SCHEMA_VERSION;
  id: string;
  version: string;
  title: string;
  topic: string;
  moduleIds: string[];
  sourceSessionIds: string[];
  questions: PracticeQuestion[];
}

export interface PublishedPracticeBank extends PracticeBankDraft {
  storageId: string;
  published: true;
  publishedBy: string;
  publishedAtClient: string;
}

export interface PracticeQuestionState {
  questionId: string;
  bankStorageId: string;
  attempts: number;
  correctAttempts: number;
  streak: number;
  lapseCount: number;
  intervalDays: number;
  ease: number;
  lastCorrect: boolean;
  lastConfidence: number;
  lastResponseMs: number;
  lastAttemptedAt: string;
  dueAt: string;
  misconceptionTags: string[];
  updatedAtClient: string;
}

export interface PracticeAnswerRecord {
  questionId: string;
  selectedOption: 0 | 1 | 2;
  correct: boolean;
  confidence: number;
  responseMs: number;
  answeredAt: string;
  calculatorLog?: any[];
}

export type PracticeRunMode = "quick" | "module" | "exam" | "repair" | "mixed";

export interface PracticeRun {
  id: string;
  uid: string;
  mode: PracticeRunMode;
  bankStorageIds: string[];
  moduleId: string | null;
  questionIds: string[];
  answers: PracticeAnswerRecord[];
  currentIndex: number;
  status: "active" | "completed";
  startedAtClient: string;
  updatedAtClient: string;
  completedAtClient: string | null;
}

export interface PracticeAssignment {
  bankStorageIds: string[];
  updatedBy: string;
  updatedAtClient: string;
}

export class PracticeContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeContentError";
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const FORBIDDEN_KEYS = new Set([
  "say",
  "listenFor",
  "ifWrong",
  "repair",
  "masteryEvidence",
  "privateTutorNote",
  "teachingScript",
]);

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PracticeContentError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, max = 2_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new PracticeContentError(`${path} must contain 1-${max} characters.`);
  }
  return value.trim();
}

function id(value: unknown, path: string): string {
  const result = text(value, path, 100);
  if (!ID_PATTERN.test(result)) {
    throw new PracticeContentError(`${path} must be a stable lowercase identifier.`);
  }
  return result;
}

function stringList(value: unknown, path: string, maxItems = 20): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new PracticeContentError(`${path} must be a list of at most ${maxItems} items.`);
  }
  return value.map((item, index) => text(item, `${path}[${index}]`, 1_000));
}

function assertNoTutorFields(value: unknown, path = "practiceBank"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoTutorFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new PracticeContentError(`${path}.${key} is tutor-only and cannot be published.`);
    }
    assertNoTutorFields(child, `${path}.${key}`);
  });
}

function parseQuestion(value: unknown, index: number): PracticeQuestion {
  const path = `practiceBank.questions[${index}]`;
  const source = record(value, path);
  const allowed = new Set([
    "id", "moduleId", "conceptId", "type", "difficulty", "estimatedSeconds",
    "prompt", "options", "correctOption", "explanation", "working", "formulae",
    "distractorExplanations", "examTrap", "tags",
  ]);
  const unexpected = Object.keys(source).filter(key => !allowed.has(key));
  if (unexpected.length) {
    throw new PracticeContentError(`${path} contains unsupported fields: ${unexpected.join(", ")}.`);
  }
  const type = source.type;
  if (!["concept", "calculation", "interpretation", "trap"].includes(String(type))) {
    throw new PracticeContentError(`${path}.type is invalid.`);
  }
  const difficulty = Number(source.difficulty);
  const estimatedSeconds = Number(source.estimatedSeconds);
  const correctOption = Number(source.correctOption);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    throw new PracticeContentError(`${path}.difficulty must be 1-5.`);
  }
  if (!Number.isInteger(estimatedSeconds) || estimatedSeconds < 20 || estimatedSeconds > 600) {
    throw new PracticeContentError(`${path}.estimatedSeconds must be 20-600.`);
  }
  if (![0, 1, 2].includes(correctOption)) {
    throw new PracticeContentError(`${path}.correctOption must be 0, 1, or 2.`);
  }
  const options = stringList(source.options, `${path}.options`, 3);
  const distractors = stringList(
    source.distractorExplanations,
    `${path}.distractorExplanations`,
    3
  );
  if (options.length !== 3 || distractors.length !== 3) {
    throw new PracticeContentError(`${path} must contain exactly three options and three option explanations.`);
  }
  if (new Set(options.map(option => option.toLowerCase())).size !== 3) {
    throw new PracticeContentError(`${path}.options must be distinct.`);
  }
  return {
    id: id(source.id, `${path}.id`),
    moduleId: id(source.moduleId, `${path}.moduleId`),
    conceptId: id(source.conceptId, `${path}.conceptId`),
    type: type as PracticeQuestionType,
    difficulty: difficulty as PracticeQuestion["difficulty"],
    estimatedSeconds,
    prompt: text(source.prompt, `${path}.prompt`, 2_000),
    options: options as PracticeQuestion["options"],
    correctOption: correctOption as PracticeQuestion["correctOption"],
    explanation: text(source.explanation, `${path}.explanation`, 3_000),
    working: stringList(source.working, `${path}.working`, 20),
    formulae: stringList(source.formulae, `${path}.formulae`, 12),
    distractorExplanations: distractors as PracticeQuestion["distractorExplanations"],
    examTrap: text(source.examTrap, `${path}.examTrap`, 1_000),
    tags: stringList(source.tags, `${path}.tags`, 20).map((tag, tagIndex) =>
      id(tag.toLowerCase().replace(/\s+/g, "-"), `${path}.tags[${tagIndex}]`)
    ),
  };
}

export function parsePracticeBankDraft(value: unknown): PracticeBankDraft {
  assertNoTutorFields(value);
  const source = record(value, "practiceBank");
  const allowed = new Set([
    "schemaVersion", "id", "version", "title", "topic", "moduleIds",
    "sourceSessionIds", "questions",
  ]);
  const unexpected = Object.keys(source).filter(key => !allowed.has(key));
  if (unexpected.length) {
    throw new PracticeContentError(`practiceBank contains unsupported fields: ${unexpected.join(", ")}.`);
  }
  if (source.schemaVersion !== PRACTICE_BANK_SCHEMA_VERSION) {
    throw new PracticeContentError("practiceBank.schemaVersion must be 1.");
  }
  if (!Array.isArray(source.questions) || source.questions.length < 5 || source.questions.length > 250) {
    throw new PracticeContentError("practiceBank.questions must contain 5-250 questions.");
  }
  const questions = source.questions.map(parseQuestion);
  const ids = questions.map(question => question.id);
  if (new Set(ids).size !== ids.length) {
    throw new PracticeContentError("practiceBank question IDs must be unique.");
  }
  const normalizedPrompts = questions.map(question => normalizeQuestionText(question.prompt));
  if (new Set(normalizedPrompts).size !== normalizedPrompts.length) {
    throw new PracticeContentError("practiceBank contains duplicate question prompts.");
  }
  for (let left = 0; left < questions.length; left += 1) {
    for (let right = left + 1; right < questions.length; right += 1) {
      if (questionSimilarity(questions[left]!.prompt, questions[right]!.prompt) >= 0.88) {
        throw new PracticeContentError(
          `practiceBank questions ${questions[left]!.id} and ${questions[right]!.id} are near-duplicates.`
        );
      }
    }
  }
  const moduleIds = stringList(source.moduleIds, "practiceBank.moduleIds", 30).map((value, index) =>
    id(value, `practiceBank.moduleIds[${index}]`)
  );
  if (!moduleIds.length || questions.some(question => !moduleIds.includes(question.moduleId))) {
    throw new PracticeContentError("Every question moduleId must appear in practiceBank.moduleIds.");
  }
  return {
    schemaVersion: PRACTICE_BANK_SCHEMA_VERSION,
    id: id(source.id, "practiceBank.id"),
    version: id(source.version, "practiceBank.version"),
    title: text(source.title, "practiceBank.title", 240),
    topic: text(source.topic, "practiceBank.topic", 120),
    moduleIds,
    sourceSessionIds: stringList(source.sourceSessionIds, "practiceBank.sourceSessionIds", 10).map((value, index) =>
      id(value, `practiceBank.sourceSessionIds[${index}]`)
    ),
    questions,
  };
}

export function practiceBankStorageId(bank: Pick<PracticeBankDraft, "id" | "version">): string {
  return `${bank.id}--${bank.version}`;
}

export function parsePublishedPracticeBank(value: unknown): PublishedPracticeBank {
  const source = record(value, "publishedPracticeBank");
  const draft = parsePracticeBankDraft({
    schemaVersion: source.schemaVersion,
    id: source.id,
    version: source.version,
    title: source.title,
    topic: source.topic,
    moduleIds: source.moduleIds,
    sourceSessionIds: source.sourceSessionIds,
    questions: source.questions,
  });
  const storageId = text(source.storageId, "publishedPracticeBank.storageId", 210);
  if (storageId !== practiceBankStorageId(draft) || source.published !== true) {
    throw new PracticeContentError("Published practice-bank identity is invalid.");
  }
  return {
    ...draft,
    storageId,
    published: true,
    publishedBy: text(source.publishedBy, "publishedPracticeBank.publishedBy", 160),
    publishedAtClient: text(source.publishedAtClient, "publishedPracticeBank.publishedAtClient", 40),
  };
}

export function parsePracticeQuestionState(value: unknown): PracticeQuestionState {
  const source = record(value, "practiceQuestionState");
  const number = (key: string, minimum: number, maximum: number) => {
    const result = Number(source[key]);
    if (!Number.isFinite(result) || result < minimum || result > maximum) {
      throw new PracticeContentError(`practiceQuestionState.${key} is invalid.`);
    }
    return result;
  };
  const parsed = {
    questionId: id(source.questionId, "practiceQuestionState.questionId"),
    bankStorageId: text(source.bankStorageId, "practiceQuestionState.bankStorageId", 210),
    attempts: Math.round(number("attempts", 1, 10_000)),
    correctAttempts: Math.round(number("correctAttempts", 0, 10_000)),
    streak: Math.round(number("streak", 0, 10_000)),
    lapseCount: Math.round(number("lapseCount", 0, 10_000)),
    intervalDays: number("intervalDays", 0, 10_000),
    ease: number("ease", 1.3, 3),
    lastCorrect: source.lastCorrect === true,
    lastConfidence: Math.round(number("lastConfidence", 1, 5)),
    lastResponseMs: Math.round(number("lastResponseMs", 0, 3_600_000)),
    lastAttemptedAt: text(source.lastAttemptedAt, "practiceQuestionState.lastAttemptedAt", 40),
    dueAt: text(source.dueAt, "practiceQuestionState.dueAt", 40),
    misconceptionTags: stringList(source.misconceptionTags, "practiceQuestionState.misconceptionTags", 20),
    updatedAtClient: text(source.updatedAtClient, "practiceQuestionState.updatedAtClient", 40),
  };
  if (
    parsed.correctAttempts > parsed.attempts ||
    parsed.streak > parsed.attempts ||
    parsed.lapseCount > parsed.attempts
  ) {
    throw new PracticeContentError(
      "Practice-state counters cannot exceed total attempts."
    );
  }
  return parsed;
}

export function parsePracticeRun(value: unknown): PracticeRun {
  const source = record(value, "practiceRun");
  const mode = source.mode;
  const status = source.status;
  if (!["quick", "module", "exam", "repair", "mixed"].includes(String(mode))) {
    throw new PracticeContentError("practiceRun.mode is invalid.");
  }
  if (!["active", "completed"].includes(String(status))) {
    throw new PracticeContentError("practiceRun.status is invalid.");
  }
  if (!Array.isArray(source.answers) || source.answers.length > 100) {
    throw new PracticeContentError("practiceRun.answers is invalid.");
  }
  const answers = source.answers.map((value, index) => {
    const answer = record(value, `practiceRun.answers[${index}]`);
    const selectedOption = Number(answer.selectedOption);
    const confidence = Number(answer.confidence);
    const responseMs = Number(answer.responseMs);
    if (![0, 1, 2].includes(selectedOption) || !Number.isInteger(confidence) || confidence < 1 || confidence > 5 || !Number.isFinite(responseMs)) {
      throw new PracticeContentError(`practiceRun.answers[${index}] is invalid.`);
    }
    return {
      questionId: id(answer.questionId, `practiceRun.answers[${index}].questionId`),
      selectedOption: selectedOption as 0 | 1 | 2,
      correct: answer.correct === true,
      confidence,
      responseMs: Math.max(0, Math.round(responseMs)),
      answeredAt: text(answer.answeredAt, `practiceRun.answers[${index}].answeredAt`, 40),
    };
  });
  const questionIds = stringList(source.questionIds, "practiceRun.questionIds", 100).map((value, index) =>
    id(value, `practiceRun.questionIds[${index}]`)
  );
  const currentIndex = Number(source.currentIndex);
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex > questionIds.length) {
    throw new PracticeContentError("practiceRun.currentIndex is invalid.");
  }
  if (answers.length > questionIds.length) {
    throw new PracticeContentError("practiceRun cannot contain more answers than questions.");
  }
  if (new Set(questionIds).size !== questionIds.length) {
    throw new PracticeContentError("practiceRun question IDs must be unique.");
  }
  if (
    new Set(answers.map(answer => answer.questionId)).size !== answers.length ||
    answers.some(answer => !questionIds.includes(answer.questionId))
  ) {
    throw new PracticeContentError("practiceRun answers must uniquely match its questions.");
  }
  const completedAtClient = source.completedAtClient === null
    ? null
    : text(source.completedAtClient, "practiceRun.completedAtClient", 40);
  if (
    (status === "active" && (currentIndex >= questionIds.length || completedAtClient !== null)) ||
    (status === "completed" && (currentIndex !== questionIds.length || completedAtClient === null))
  ) {
    throw new PracticeContentError("practiceRun status and completion position do not agree.");
  }
  return {
    id: id(source.id, "practiceRun.id"),
    uid: text(source.uid, "practiceRun.uid", 160),
    mode: mode as PracticeRunMode,
    bankStorageIds: stringList(source.bankStorageIds, "practiceRun.bankStorageIds", 20),
    moduleId: source.moduleId === null ? null : id(source.moduleId, "practiceRun.moduleId"),
    questionIds,
    answers,
    currentIndex,
    status: status as PracticeRun["status"],
    startedAtClient: text(source.startedAtClient, "practiceRun.startedAtClient", 40),
    updatedAtClient: text(source.updatedAtClient, "practiceRun.updatedAtClient", 40),
    completedAtClient,
  };
}

export function parsePracticeAssignment(value: unknown): PracticeAssignment {
  const source = record(value, "practiceAssignment");
  return {
    bankStorageIds: stringList(source.bankStorageIds, "practiceAssignment.bankStorageIds", 50),
    updatedBy: text(source.updatedBy, "practiceAssignment.updatedBy", 160),
    updatedAtClient: text(source.updatedAtClient, "practiceAssignment.updatedAtClient", 40),
  };
}

export function normalizeQuestionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): Set<string> {
  return new Set(normalizeQuestionText(value).split(" ").filter(token => token.length > 2));
}

export function questionSimilarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter(token => b.has(token)).length;
  return overlap / (a.size + b.size - overlap);
}

export function assertIndependentPracticeQuestions(
  bank: PracticeBankDraft,
  privateSessionPrompts: string[]
): void {
  for (const question of bank.questions) {
    for (const source of privateSessionPrompts) {
      const similarity = questionSimilarity(question.prompt, source);
      if (similarity >= 0.68) {
        throw new PracticeContentError(
          `${question.id} is too similar to a Session Mode prompt (${Math.round(similarity * 100)}%).`
        );
      }
    }
  }
}
