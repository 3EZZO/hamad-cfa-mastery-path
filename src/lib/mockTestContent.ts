/**
 * Module mock tests: content contract, grading and timing.
 *
 * A tutor uploads one private JSON file per module. It is split into three
 * Firestore documents with different readers: the questions (stems and
 * options only), the answer key, and the review (explanations). Students
 * never receive the key or the review before their attempt is locked, so
 * nothing in this module may copy answer fields into the questions document.
 */

export const MOCK_SCHEMA_VERSION = 1 as const;
export const MOCK_QUESTION_COUNT = 8;
export const MOCK_DURATION_MS = 12 * 60 * 1000;
/** The last five minutes switch the timer into its urgency state. */
export const MOCK_URGENT_MS = 5 * 60 * 1000;
/** Mirrors firestore.rules: saves are accepted for 15 s after 12:00 for latency. */
export const MOCK_SAVE_GRACE_MS = 15 * 1000;
export const MOCK_MAX_INCIDENTS = 100;
export const MOCK_MAX_KEYSTROKES = 600;

export type MockOption = 0 | 1 | 2;
export type MockAnswer = MockOption | null;
export type MockConfidence = "High" | "Medium" | "Low";
export type MockTestStatus = "draft" | "published";
export type MockAttemptStatus = "active" | "submitted" | "forfeited";
export type MockFinishReason = "submit" | "timeout" | "expired" | "leave";
export type MockIncidentType =
  | "fullscreen-exit"
  | "tab-hidden"
  | "window-blur"
  | "page-hide"
  | "reload";

export interface MockTable {
  caption: string;
  headers: string[];
  /** Firestore cannot store nested arrays, so each row wraps its cells. */
  rows: Array<{ cells: string[] }>;
}

/**
 * A chart drawn by the app from data (never an uploaded image), so it follows
 * the theme and stays light. Points are {x, y} objects because Firestore
 * cannot store nested arrays.
 */
export interface MockFigurePoint {
  x: number;
  y: number;
}

export type MockFigureSeriesKind = "line" | "scatter" | "bar";
export type MockFigureTone = "primary" | "secondary" | "accent" | "muted";

export interface MockFigureSeries {
  kind: MockFigureSeriesKind;
  label: string;
  points: MockFigurePoint[];
  tone: MockFigureTone;
  dashed: boolean;
}

/** A labelled reference line: vertical at x = value, or horizontal at y = value. */
export interface MockFigureGuide {
  axis: "x" | "y";
  value: number;
  label: string;
}

/** A labelled point, e.g. "A" or "Kink". */
export interface MockFigureMarker {
  x: number;
  y: number;
  label: string;
}

export interface MockFigure {
  title: string;
  /** Text alternative read by screen readers. */
  description: string;
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Tick values; empty means none (e.g. a conceptual diagram without numbers). */
  xTicks: number[];
  yTicks: number[];
  series: MockFigureSeries[];
  guides: MockFigureGuide[];
  markers: MockFigureMarker[];
}

/** What the student sees. Deliberately has no answer, concept or source. */
export interface MockQuestion {
  id: string;
  stem: string;
  table: MockTable | null;
  /** Absent on tests uploaded before figures existed. */
  figure?: MockFigure | null;
  options: [string, string, string];
}

export interface MockReviewItem {
  id: string;
  concept: string;
  explanation: string;
  working: string[];
  keystrokes: string;
  distractors: [string, string, string];
  confidence: MockConfidence;
  sourceFiles: string[];
  sourceRef: string;
}

export interface MockDraftQuestion extends MockQuestion, MockReviewItem {
  correctOption: MockOption;
}

export interface MockTestDraft {
  schemaVersion: typeof MOCK_SCHEMA_VERSION;
  moduleId: string;
  version: string;
  title: string;
  source: string;
  questions: MockDraftQuestion[];
}

export interface MockTestMeta {
  schemaVersion: typeof MOCK_SCHEMA_VERSION;
  moduleId: string;
  title: string;
  version: string;
  status: MockTestStatus;
  questionCount: number;
  durationSeconds: number;
  updatedBy: string;
  updatedAtClient: string;
  publishedAtClient: string | null;
}

export interface MockQuestionsDoc {
  moduleId: string;
  version: string;
  questions: MockQuestion[];
}

export interface MockKeyDoc {
  moduleId: string;
  version: string;
  correct: MockOption[];
}

export interface MockReviewDoc {
  moduleId: string;
  version: string;
  items: MockReviewItem[];
}

export interface MockIncident {
  type: MockIncidentType;
  atClient: string;
  elapsedMs: number;
}

export interface MockKeystroke {
  q: number;
  key: string;
  display: string;
  t: number;
  /** TVM registers after the key, so the tutor sees the same diagnostics as Practice. */
  registers: { N: number; IY: number; PV: number; PMT: number; FV: number; PY: number; CY: number; isBGN: boolean };
}

export interface MockAttempt {
  id: string;
  uid: string;
  moduleId: string;
  testVersion: string;
  attemptNumber: number;
  status: MockAttemptStatus;
  startedAtMs: number;
  lastSeenAtMs: number;
  answers: MockAnswer[];
  flags: boolean[];
  incidents: MockIncident[];
  keystrokes: MockKeystroke[];
  submittedAtMs: number | null;
  finishReason: MockFinishReason | null;
  score: number | null;
  correct: boolean[] | null;
  reviewReleased: boolean;
}

export interface MockAttemptHistoryEntry extends MockAttempt {
  archivedAtMs: number;
  archivedBy: string;
}

export class MockContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockContentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new MockContentError(`${field} must be text.`);
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) throw new MockContentError(`${field} is empty.`);
  if (trimmed.length > max) throw new MockContentError(`${field} is longer than ${max} characters.`);
  return trimmed;
}

function textList(value: unknown, field: string, max: number, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new MockContentError(`${field} must be a list of at most ${maxItems} items.`);
  }
  return value.map((item, index) => text(item, `${field}[${index}]`, max));
}

function triple(value: unknown, field: string, max: number): [string, string, string] {
  const list = textList(value, field, max, 3);
  if (list.length !== 3) throw new MockContentError(`${field} must have exactly three entries.`);
  return [list[0]!, list[1]!, list[2]!];
}

function option(value: unknown, field: string): MockOption {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new MockContentError(`${field} must be 0, 1 or 2 (A, B or C).`);
  }
  return value;
}

function parseTable(value: unknown, field: string): MockTable | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new MockContentError(`${field} must be an object or null.`);
  // A row-label column often has an empty header, so headers may be blank.
  if (!Array.isArray(value.headers) || value.headers.length === 0 || value.headers.length > 12) {
    throw new MockContentError(`${field}.headers must have 1-12 entries.`);
  }
  const headers = value.headers.map((header, index) => text(header, `${field}.headers[${index}]`, 200, true));
  if (!Array.isArray(value.rows) || value.rows.length === 0 || value.rows.length > 30) {
    throw new MockContentError(`${field}.rows must have 1-30 rows.`);
  }
  const rows = value.rows.map((row, index) => {
    const cells = Array.isArray(row) ? row : isRecord(row) ? row.cells : null;
    const parsed = (Array.isArray(cells) ? cells : []).map((cell, cellIndex) =>
      text(cell, `${field}.rows[${index}][${cellIndex}]`, 300, true),
    );
    if (parsed.length !== headers.length) {
      throw new MockContentError(`${field}.rows[${index}] must have ${headers.length} cells.`);
    }
    return { cells: parsed };
  });
  return { caption: text(value.caption ?? "", `${field}.caption`, 300, true), headers, rows };
}

const FIGURE_LIMITS = { series: 6, points: 200, totalPoints: 600, guides: 8, markers: 12, ticks: 12, label: 80 };

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new MockContentError(`${field} must be a number.`);
  return value;
}

function list(value: unknown, field: string, max: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new MockContentError(`${field} must be a list of at most ${max} items.`);
  return value;
}

function parseFigure(value: unknown, field: string): MockFigure | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new MockContentError(`${field} must be an object or null.`);
  const xMin = finite(value.xMin, `${field}.xMin`);
  const xMax = finite(value.xMax, `${field}.xMax`);
  const yMin = finite(value.yMin, `${field}.yMin`);
  const yMax = finite(value.yMax, `${field}.yMax`);
  if (xMin >= xMax || yMin >= yMax) throw new MockContentError(`${field} needs xMin < xMax and yMin < yMax.`);
  const ticks = (raw: unknown, axis: "x" | "y") => list(raw, `${field}.${axis}Ticks`, FIGURE_LIMITS.ticks)
    .map((tick, index) => finite(tick, `${field}.${axis}Ticks[${index}]`));
  const series = list(value.series, `${field}.series`, FIGURE_LIMITS.series).map((raw, index): MockFigureSeries => {
    const path = `${field}.series[${index}]`;
    if (!isRecord(raw)) throw new MockContentError(`${path} must be an object.`);
    if (raw.kind !== "line" && raw.kind !== "scatter" && raw.kind !== "bar") {
      throw new MockContentError(`${path}.kind must be line, scatter or bar.`);
    }
    const tone = raw.tone ?? "primary";
    if (tone !== "primary" && tone !== "secondary" && tone !== "accent" && tone !== "muted") {
      throw new MockContentError(`${path}.tone must be primary, secondary, accent or muted.`);
    }
    const points = list(raw.points, `${path}.points`, FIGURE_LIMITS.points).map((point, pointIndex) => {
      if (!isRecord(point)) throw new MockContentError(`${path}.points[${pointIndex}] must be {x, y}.`);
      return { x: finite(point.x, `${path}.points[${pointIndex}].x`), y: finite(point.y, `${path}.points[${pointIndex}].y`) };
    });
    if (!points.length) throw new MockContentError(`${path}.points is empty.`);
    return { kind: raw.kind, label: text(raw.label, `${path}.label`, FIGURE_LIMITS.label), points, tone, dashed: raw.dashed === true };
  });
  if (!series.length) throw new MockContentError(`${field}.series is empty.`);
  if (series.reduce((sum, entry) => sum + entry.points.length, 0) > FIGURE_LIMITS.totalPoints) {
    throw new MockContentError(`${field} has more than ${FIGURE_LIMITS.totalPoints} points.`);
  }
  const guides = list(value.guides, `${field}.guides`, FIGURE_LIMITS.guides).map((raw, index): MockFigureGuide => {
    const path = `${field}.guides[${index}]`;
    if (!isRecord(raw) || (raw.axis !== "x" && raw.axis !== "y")) throw new MockContentError(`${path}.axis must be x or y.`);
    return { axis: raw.axis, value: finite(raw.value, `${path}.value`), label: text(raw.label, `${path}.label`, FIGURE_LIMITS.label, true) };
  });
  const markers = list(value.markers, `${field}.markers`, FIGURE_LIMITS.markers).map((raw, index): MockFigureMarker => {
    const path = `${field}.markers[${index}]`;
    if (!isRecord(raw)) throw new MockContentError(`${path} must be an object.`);
    return { x: finite(raw.x, `${path}.x`), y: finite(raw.y, `${path}.y`), label: text(raw.label, `${path}.label`, FIGURE_LIMITS.label) };
  });
  return {
    title: text(value.title, `${field}.title`, 200),
    description: text(value.description, `${field}.description`, 1200),
    xLabel: text(value.xLabel, `${field}.xLabel`, FIGURE_LIMITS.label),
    yLabel: text(value.yLabel, `${field}.yLabel`, FIGURE_LIMITS.label),
    xMin,
    xMax,
    yMin,
    yMax,
    xTicks: ticks(value.xTicks, "x"),
    yTicks: ticks(value.yTicks, "y"),
    series,
    guides,
    markers,
  };
}

function confidence(value: unknown, field: string): MockConfidence {
  if (value !== "High" && value !== "Medium" && value !== "Low") {
    throw new MockContentError(`${field} must be High, Medium or Low.`);
  }
  return value;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function parseMockTestDraft(value: unknown): MockTestDraft {
  if (!isRecord(value)) throw new MockContentError("The mock test file must be a JSON object.");
  if (value.schemaVersion !== MOCK_SCHEMA_VERSION) {
    throw new MockContentError(`schemaVersion must be ${MOCK_SCHEMA_VERSION}.`);
  }
  const moduleId = text(value.moduleId, "moduleId", 80);
  if (!ID_PATTERN.test(moduleId)) throw new MockContentError("moduleId must be lowercase letters, digits and dashes.");
  if (!Array.isArray(value.questions) || value.questions.length !== MOCK_QUESTION_COUNT) {
    throw new MockContentError(`A module mock test must have exactly ${MOCK_QUESTION_COUNT} questions.`);
  }
  const questions = value.questions.map((raw, index): MockDraftQuestion => {
    const field = `questions[${index}]`;
    if (!isRecord(raw)) throw new MockContentError(`${field} must be an object.`);
    const id = text(raw.id, `${field}.id`, 80);
    if (!ID_PATTERN.test(id)) throw new MockContentError(`${field}.id must be lowercase letters, digits and dashes.`);
    return {
      id,
      stem: text(raw.stem, `${field}.stem`, 4000),
      table: parseTable(raw.table, `${field}.table`),
      figure: parseFigure(raw.figure, `${field}.figure`),
      options: triple(raw.options, `${field}.options`, 600),
      correctOption: option(raw.correctOption, `${field}.correctOption`),
      concept: text(raw.concept, `${field}.concept`, 200),
      explanation: text(raw.explanation, `${field}.explanation`, 4000),
      working: textList(raw.working ?? [], `${field}.working`, 600, 12),
      keystrokes: text(raw.keystrokes ?? "", `${field}.keystrokes`, 600, true),
      distractors: triple(raw.distractors, `${field}.distractors`, 1200),
      confidence: confidence(raw.confidence, `${field}.confidence`),
      sourceFiles: textList(raw.sourceFiles ?? [], `${field}.sourceFiles`, 120, 6),
      sourceRef: text(raw.sourceRef ?? "", `${field}.sourceRef`, 120, true),
    };
  });
  if (new Set(questions.map(question => question.id)).size !== questions.length) {
    throw new MockContentError("Question ids must be unique.");
  }
  return {
    schemaVersion: MOCK_SCHEMA_VERSION,
    moduleId,
    version: text(value.version, "version", 60),
    title: text(value.title, "title", 200),
    source: text(value.source ?? "", "source", 600, true),
    questions,
  };
}

/** Split an upload into the three documents with different readers. */
export function splitMockDraft(draft: MockTestDraft): {
  questions: MockQuestionsDoc;
  key: MockKeyDoc;
  review: MockReviewDoc;
} {
  const { moduleId, version } = draft;
  return {
    questions: {
      moduleId,
      version,
      questions: draft.questions.map(({ id, stem, table, figure, options }) => ({ id, stem, table, figure, options })),
    },
    key: { moduleId, version, correct: draft.questions.map(question => question.correctOption) },
    review: {
      moduleId,
      version,
      items: draft.questions.map(question => ({
        id: question.id,
        concept: question.concept,
        explanation: question.explanation,
        working: question.working,
        keystrokes: question.keystrokes,
        distractors: question.distractors,
        confidence: question.confidence,
        sourceFiles: question.sourceFiles,
        sourceRef: question.sourceRef,
      })),
    },
  };
}

export function mockAttemptId(uid: string, moduleId: string): string {
  return `${uid}_${moduleId}`;
}

export function mockHistoryId(attemptId: string, attemptNumber: number): string {
  return `${attemptId}_${attemptNumber}`;
}

export function emptyAnswers(): MockAnswer[] {
  return Array.from({ length: MOCK_QUESTION_COUNT }, () => null);
}

export function emptyFlags(): boolean[] {
  return Array.from({ length: MOCK_QUESTION_COUNT }, () => false);
}

/** Grading must match the rule in firestore.rules exactly. */
export function gradeMockAnswers(
  answers: readonly MockAnswer[],
  key: readonly MockOption[],
): { correct: boolean[]; score: number } {
  if (key.length !== MOCK_QUESTION_COUNT) throw new MockContentError("The answer key must have 8 entries.");
  const correct = key.map((right, index) => answers[index] === right);
  return { correct, score: correct.filter(Boolean).length };
}

export function mockDeadlineMs(startedAtMs: number): number {
  return startedAtMs + MOCK_DURATION_MS;
}

/**
 * Remaining time on the server clock. `serverOffsetMs` is server minus
 * client time, measured when the attempt was created or resumed, so moving
 * the device clock does not change the result.
 */
export function mockRemainingMs(startedAtMs: number, clientNowMs: number, serverOffsetMs: number): number {
  return Math.max(0, mockDeadlineMs(startedAtMs) - (clientNowMs + serverOffsetMs));
}

export function mockTimeUsedMs(attempt: Pick<MockAttempt, "startedAtMs" | "submittedAtMs">): number | null {
  if (attempt.submittedAtMs === null) return null;
  return Math.min(MOCK_DURATION_MS, Math.max(0, attempt.submittedAtMs - attempt.startedAtMs));
}

export type MockAttemptView = "not-started" | "in-progress" | "expired" | "completed" | "forfeited";

/** "expired" is an active attempt past its deadline that still needs finalizing. */
export function mockAttemptView(attempt: MockAttempt | null, serverNowMs: number): MockAttemptView {
  if (!attempt) return "not-started";
  if (attempt.status === "forfeited") return "forfeited";
  if (attempt.status === "submitted") return "completed";
  return serverNowMs >= mockDeadlineMs(attempt.startedAtMs) ? "expired" : "in-progress";
}

export function isMockAttemptLocked(attempt: Pick<MockAttempt, "status">): boolean {
  return attempt.status === "submitted" || attempt.status === "forfeited";
}

export function appendIncident(incidents: readonly MockIncident[], incident: MockIncident): MockIncident[] {
  if (incidents.length >= MOCK_MAX_INCIDENTS) return [...incidents];
  return [...incidents, incident];
}

export function appendKeystroke(keystrokes: readonly MockKeystroke[], keystroke: MockKeystroke): MockKeystroke[] {
  if (keystrokes.length >= MOCK_MAX_KEYSTROKES) return [...keystrokes];
  return [...keystrokes, keystroke];
}

export function optionLetter(index: number | null | undefined): string {
  return index === 0 ? "A" : index === 1 ? "B" : index === 2 ? "C" : "—";
}

export function formatMockClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const INCIDENT_LABELS: Record<MockIncidentType, string> = {
  "fullscreen-exit": "Left full screen",
  "tab-hidden": "Switched tab or app",
  "window-blur": "Window lost focus",
  "page-hide": "Closed or refreshed the page",
  reload: "Reopened the test after leaving",
};

export function incidentLabel(type: MockIncidentType): string {
  return INCIDENT_LABELS[type];
}
