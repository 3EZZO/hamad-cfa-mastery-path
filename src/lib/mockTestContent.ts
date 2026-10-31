import { MOCK_PAPERS, isMockPaperId, mockPaperById, paperCatalogIds, paperModuleTestIds } from "../data/mockPapers";

/**
 * Mock tests: content contract, grading and timing.
 *
 * Two kinds share one engine: an eight-question module test (schema 1, or
 * schema 2 with kind "module") and a 44-question comprehensive paper
 * (schema 2, kind "paper"), both at 90 seconds a question.
 *
 * A tutor uploads one private JSON file per test. It is split into Firestore
 * documents with different readers: the questions (stems, exhibits and
 * options only), the answer key, the review (explanations) and, for schema 2,
 * the tutor-only sources (private provenance). Students never receive the key
 * or the review before their attempt is locked, and never the sources, so
 * nothing in this module may copy answer, tag or source fields into the
 * questions document.
 */

/** Schema of the original eight-question module uploads; still accepted unchanged. */
export const MOCK_SCHEMA_VERSION = 1 as const;
export const MOCK_SCHEMA_VERSION_V2 = 2 as const;
export type MockSchemaVersion = typeof MOCK_SCHEMA_VERSION | typeof MOCK_SCHEMA_VERSION_V2;
export type MockTestKind = "module" | "paper";
export const MOCK_SECONDS_PER_QUESTION = 90;
/** Questions per test kind; firestore.rules accepts exactly these counts. */
export const MOCK_KIND_QUESTION_COUNT: Record<MockTestKind, number> = { module: 8, paper: 44 };
/** Module-test count and duration: the defaults for every pre-paper document and attempt. */
export const MOCK_QUESTION_COUNT = MOCK_KIND_QUESTION_COUNT.module;
export const MOCK_DURATION_MS = MOCK_QUESTION_COUNT * MOCK_SECONDS_PER_QUESTION * 1000;
/** The last five minutes switch the timer into its urgency state. */
export const MOCK_URGENT_MS = 5 * 60 * 1000;
/** Mirrors firestore.rules: saves are accepted for 15 s after 12:00 for latency. */
export const MOCK_SAVE_GRACE_MS = 15 * 1000;
export const MOCK_MAX_INCIDENTS = 100;
export const MOCK_MAX_KEYSTROKES = 600;
/** Mirrors firestore.rules: a 44-question paper keeps more calculator history. */
export const MOCK_PAPER_MAX_KEYSTROKES = 1500;
/** Firestore's document limit is 1 MiB; uploads stay well below it. */
export const MOCK_MAX_DOC_BYTES = 900_000;

export function mockDurationMsFor(questionCount: number): number {
  return questionCount * MOCK_SECONDS_PER_QUESTION * 1000;
}

export function mockKeystrokeLimit(questionCount: number): number {
  return questionCount === MOCK_KIND_QUESTION_COUNT.paper ? MOCK_PAPER_MAX_KEYSTROKES : MOCK_MAX_KEYSTROKES;
}

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

/**
 * A probability tree drawn by the app. Branch probabilities stay text so the
 * notation of the source survives ("0.65", "P(B | A) = 0.15"). Used in the
 * exam only when the question supplies the tree; when the task is to build
 * it, the tree belongs in the review instead (see MockExhibitPolicy).
 */
export interface MockTreeNode {
  label: string;
  probability: string;
  /** Optional leaf annotation, e.g. a payoff. Never a computed answer. */
  note: string;
  children: MockTreeNode[];
}

export interface MockTree {
  title: string;
  /** Text alternative read by screen readers. */
  description: string;
  rootLabel: string;
  branches: MockTreeNode[];
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

/** What the student sees. Deliberately has no answer, concept, tag or source. */
export interface MockQuestion {
  id: string;
  stem: string;
  table: MockTable | null;
  /** Absent on tests uploaded before figures existed. */
  figure?: MockFigure | null;
  /** Schema 2 only. */
  tree?: MockTree | null;
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
  /** Schema 1 only; schema 2 keeps provenance in the tutor-only sources. */
  sourceFiles: string[];
  sourceRef: string;
  /** Schema 2: a worked graphic shown only after the attempt (e.g. the tree the student had to build). */
  reviewFigure?: MockFigure | null;
  reviewTree?: MockTree | null;
}

/** The Practice taxonomy, reused so results and repair speak the same language. */
export type MockSkill = "calculation" | "concept" | "interpretation" | "trap";
/**
 * none: no graphic. supplied: the question gives the graphic and asks to read
 * or use it. explanation-only: building the graphic is the task, so the exam
 * shows the given data and the graphic appears only in the review.
 */
export type MockExhibitPolicy = "none" | "supplied" | "explanation-only";
export type MockAuthoring = "source" | "authored";

/** Schema 2 tags, readable with the key once the attempt is locked. */
export interface MockQuestionTags {
  /**
   * The module test this question exercises (a MOCK_MODULES id of the paper's
   * topic); empty for topics that have no module tests.
   */
  moduleTag: string;
  /** Official 2027 curriculum module (READING_CATALOG id). */
  catalogId: string;
  /** Learning-outcome labels, as written in the official outline. */
  los: string[];
  skill: MockSkill;
  exhibitPolicy: MockExhibitPolicy;
}

/** Schema 2 private provenance, tutor-only. */
export interface MockSourceItem extends MockQuestionTags {
  id: string;
  authoring: MockAuthoring;
  /** Stable private bank id; empty for an authored question. */
  bankId: string;
  /** Page in the private reference edition; null for an authored question. */
  sourcePage: number | null;
  note: string;
}

export interface MockDraftQuestion extends MockQuestion, MockReviewItem {
  correctOption: MockOption;
  /** Present on schema 2 uploads. */
  tags?: MockQuestionTags;
  source?: Pick<MockSourceItem, "authoring" | "bankId" | "sourcePage" | "note">;
}

export interface MockTestDraft {
  schemaVersion: MockSchemaVersion;
  kind: MockTestKind;
  moduleId: string;
  version: string;
  title: string;
  source: string;
  questions: MockDraftQuestion[];
}

export interface MockTestMeta {
  schemaVersion: MockSchemaVersion;
  /** Absent on module tests uploaded before papers existed. */
  kind?: MockTestKind;
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
  /** Schema 2: per-question module test, official module and skill, for results once locked. */
  modules?: string[];
  catalogIds?: string[];
  skills?: MockSkill[];
}

export interface MockReviewDoc {
  moduleId: string;
  version: string;
  items: MockReviewItem[];
}

/** Schema 2 tutor-only provenance and tags. */
export interface MockSourcesDoc {
  moduleId: string;
  version: string;
  items: MockSourceItem[];
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
  /**
   * Frozen when a paper attempt starts. Absent on module-test attempts, which
   * are always 8 questions / 12 minutes (also every attempt made before papers).
   */
  questionCount?: number;
  durationSeconds?: number;
  startedAtMs: number;
  lastSeenAtMs: number;
  answers: MockAnswer[];
  flags: boolean[];
  /**
   * Paper attempts: estimated milliseconds on each question, counted only while
   * the exam page is visible and focused. An estimate, not an integrity record.
   */
  dwellMs?: number[];
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
const CATALOG_PATTERN = /^cfa-2027-outline-m\d{3}$/;
const TREE_LIMITS = { depth: 3, branches: 4, nodes: 40, label: 60, probability: 32, note: 40 };
const SKILLS: readonly MockSkill[] = ["calculation", "concept", "interpretation", "trap"];
const EXHIBIT_POLICIES: readonly MockExhibitPolicy[] = ["none", "supplied", "explanation-only"];

function parseTree(value: unknown, field: string): MockTree | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new MockContentError(`${field} must be an object or null.`);
  let nodes = 0;
  const branches = (raw: unknown, path: string, depth: number): MockTreeNode[] => {
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > TREE_LIMITS.branches) {
      throw new MockContentError(`${path} must have 2-${TREE_LIMITS.branches} branches.`);
    }
    return raw.map((node, index): MockTreeNode => {
      const at = `${path}[${index}]`;
      if (!isRecord(node)) throw new MockContentError(`${at} must be an object.`);
      nodes += 1;
      if (nodes > TREE_LIMITS.nodes) throw new MockContentError(`${field} has more than ${TREE_LIMITS.nodes} branches.`);
      const children = node.children === undefined || (Array.isArray(node.children) && node.children.length === 0)
        ? []
        : depth >= TREE_LIMITS.depth
          ? (() => { throw new MockContentError(`${field} is deeper than ${TREE_LIMITS.depth} levels.`); })()
          : branches(node.children, `${at}.children`, depth + 1);
      return {
        label: text(node.label, `${at}.label`, TREE_LIMITS.label),
        probability: text(node.probability, `${at}.probability`, TREE_LIMITS.probability),
        note: text(node.note ?? "", `${at}.note`, TREE_LIMITS.note, true),
        children,
      };
    });
  };
  return {
    title: text(value.title, `${field}.title`, 200),
    description: text(value.description, `${field}.description`, 1200),
    rootLabel: text(value.rootLabel ?? "", `${field}.rootLabel`, TREE_LIMITS.label, true),
    branches: branches(value.branches, `${field}.branches`, 1),
  };
}

function parseTags(value: unknown, field: string): MockQuestionTags {
  if (!isRecord(value)) throw new MockContentError(`${field} must be an object.`);
  const moduleTag = text(value.moduleTag ?? "", `${field}.moduleTag`, 80, true);
  if (moduleTag && !ID_PATTERN.test(moduleTag)) throw new MockContentError(`${field}.moduleTag must be a module test id.`);
  const catalogId = text(value.catalogId, `${field}.catalogId`, 80);
  if (!CATALOG_PATTERN.test(catalogId)) throw new MockContentError(`${field}.catalogId must be an official 2027 module id.`);
  const los = textList(value.los, `${field}.los`, 300, 4);
  if (!los.length) throw new MockContentError(`${field}.los must name at least one learning outcome.`);
  if (!SKILLS.includes(value.skill as MockSkill)) {
    throw new MockContentError(`${field}.skill must be ${SKILLS.join(", ")}.`);
  }
  if (!EXHIBIT_POLICIES.includes(value.exhibitPolicy as MockExhibitPolicy)) {
    throw new MockContentError(`${field}.exhibitPolicy must be ${EXHIBIT_POLICIES.join(", ")}.`);
  }
  return { moduleTag, catalogId, los, skill: value.skill as MockSkill, exhibitPolicy: value.exhibitPolicy as MockExhibitPolicy };
}

function parseSource(value: unknown, field: string): NonNullable<MockDraftQuestion["source"]> {
  if (!isRecord(value)) throw new MockContentError(`${field} must be an object.`);
  if (value.authoring !== "source" && value.authoring !== "authored") {
    throw new MockContentError(`${field}.authoring must be source or authored.`);
  }
  const bankId = text(value.bankId ?? "", `${field}.bankId`, 80, true);
  const sourcePage = value.sourcePage === null || value.sourcePage === undefined ? null : finite(value.sourcePage, `${field}.sourcePage`);
  if (value.authoring === "source" && (!bankId || sourcePage === null)) {
    throw new MockContentError(`${field} needs bankId and sourcePage for a source question.`);
  }
  if (value.authoring === "authored" && bankId) {
    throw new MockContentError(`${field}: an authored question has no bankId.`);
  }
  return { authoring: value.authoring, bankId, sourcePage, note: text(value.note ?? "", `${field}.note`, 600, true) };
}

/** The exam may show only a supplied graphic; a graphic the student must build belongs in the review. */
function checkExhibitPolicy(question: MockDraftQuestion, field: string): void {
  const policy = question.tags!.exhibitPolicy;
  const examGraphic = Boolean(question.figure || question.tree);
  const reviewGraphic = Boolean(question.reviewFigure || question.reviewTree);
  if (policy === "supplied" && !examGraphic) {
    throw new MockContentError(`${field}: exhibitPolicy supplied needs a figure or tree in the question.`);
  }
  if (policy !== "supplied" && examGraphic) {
    throw new MockContentError(`${field}: only exhibitPolicy supplied may show a figure or tree in the question.`);
  }
  if (policy === "explanation-only" && !reviewGraphic) {
    throw new MockContentError(`${field}: exhibitPolicy explanation-only needs a reviewFigure or reviewTree.`);
  }
}

/** A paper's questions belong to its topic: its official modules and, where they exist, its module tests. */
function checkPaperTags(paperId: string, tags: MockQuestionTags, field: string): void {
  const topic = mockPaperById(paperId)!.topic;
  if (!paperCatalogIds(paperId).includes(tags.catalogId)) {
    throw new MockContentError(`${field}.catalogId must be an official ${topic} module.`);
  }
  const moduleTests = paperModuleTestIds(paperId);
  if (moduleTests.length && !moduleTests.includes(tags.moduleTag)) {
    throw new MockContentError(`${field}.moduleTag must be a ${topic} module test id.`);
  }
  if (!moduleTests.length && tags.moduleTag) {
    throw new MockContentError(`${field}.moduleTag must be empty: ${topic} has no module tests.`);
  }
}

function testKind(value: Record<string, unknown>, schemaVersion: MockSchemaVersion): MockTestKind {
  if (schemaVersion === MOCK_SCHEMA_VERSION) {
    if (value.kind !== undefined && value.kind !== "module") throw new MockContentError("A schema 1 upload is a module test.");
    return "module";
  }
  if (value.kind !== "module" && value.kind !== "paper") throw new MockContentError("kind must be module or paper.");
  return value.kind;
}

export function parseMockTestDraft(value: unknown): MockTestDraft {
  if (!isRecord(value)) throw new MockContentError("The mock test file must be a JSON object.");
  if (value.schemaVersion !== MOCK_SCHEMA_VERSION && value.schemaVersion !== MOCK_SCHEMA_VERSION_V2) {
    throw new MockContentError(`schemaVersion must be ${MOCK_SCHEMA_VERSION} or ${MOCK_SCHEMA_VERSION_V2}.`);
  }
  const schemaVersion: MockSchemaVersion = value.schemaVersion;
  const v2 = schemaVersion === MOCK_SCHEMA_VERSION_V2;
  const kind = testKind(value, schemaVersion);
  const moduleId = text(value.moduleId, "moduleId", 80);
  if (!ID_PATTERN.test(moduleId)) throw new MockContentError("moduleId must be lowercase letters, digits and dashes.");
  if (kind === "paper" && !isMockPaperId(moduleId)) {
    throw new MockContentError(`moduleId must be one of the registered papers: ${MOCK_PAPERS.map(paper => paper.id).join(", ")}.`);
  }
  if (kind === "module" && isMockPaperId(moduleId)) throw new MockContentError("A module test cannot use a paper id.");
  const count = MOCK_KIND_QUESTION_COUNT[kind];
  if (!Array.isArray(value.questions) || value.questions.length !== count) {
    throw new MockContentError(
      kind === "paper"
        ? `A mock exam paper must have exactly ${count} questions.`
        : `A module mock test must have exactly ${count} questions.`,
    );
  }
  const questions = value.questions.map((raw, index): MockDraftQuestion => {
    const field = `questions[${index}]`;
    if (!isRecord(raw)) throw new MockContentError(`${field} must be an object.`);
    const id = text(raw.id, `${field}.id`, 80);
    if (!ID_PATTERN.test(id)) throw new MockContentError(`${field}.id must be lowercase letters, digits and dashes.`);
    const question: MockDraftQuestion = {
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
      sourceFiles: v2 ? [] : textList(raw.sourceFiles ?? [], `${field}.sourceFiles`, 120, 6),
      sourceRef: v2 ? "" : text(raw.sourceRef ?? "", `${field}.sourceRef`, 120, true),
    };
    if (!v2) {
      if (raw.tree !== undefined || raw.tags !== undefined || raw.source !== undefined) {
        throw new MockContentError(`${field}: tree, tags and source need schemaVersion ${MOCK_SCHEMA_VERSION_V2}.`);
      }
      return question;
    }
    if (raw.sourceFiles !== undefined || raw.sourceRef !== undefined) {
      throw new MockContentError(`${field}: schema ${MOCK_SCHEMA_VERSION_V2} keeps provenance in source, not sourceFiles/sourceRef.`);
    }
    question.tree = parseTree(raw.tree, `${field}.tree`);
    question.reviewFigure = parseFigure(raw.reviewFigure, `${field}.reviewFigure`);
    question.reviewTree = parseTree(raw.reviewTree, `${field}.reviewTree`);
    question.tags = parseTags(raw.tags, `${field}.tags`);
    if (kind === "paper") checkPaperTags(moduleId, question.tags, `${field}.tags`);
    else if (!question.tags.moduleTag) throw new MockContentError(`${field}.tags.moduleTag is empty.`);
    question.source = parseSource(raw.source, `${field}.source`);
    checkExhibitPolicy(question, field);
    return question;
  });
  if (new Set(questions.map(question => question.id)).size !== questions.length) {
    throw new MockContentError("Question ids must be unique.");
  }
  const draft: MockTestDraft = {
    schemaVersion,
    kind,
    moduleId,
    version: text(value.version, "version", 60),
    title: text(value.title, "title", 200),
    source: text(value.source ?? "", "source", 600, true),
    questions,
  };
  assertMockDocSizes(splitMockDraft(draft));
  return draft;
}

export interface MockDraftDocs {
  questions: MockQuestionsDoc;
  key: MockKeyDoc;
  review: MockReviewDoc;
  /** Schema 2 only: tutor-only provenance. */
  sources: MockSourcesDoc | null;
}

/** Split an upload into the documents with different readers. */
export function splitMockDraft(draft: MockTestDraft): MockDraftDocs {
  const { moduleId, version } = draft;
  const v2 = draft.schemaVersion === MOCK_SCHEMA_VERSION_V2;
  const key: MockKeyDoc = { moduleId, version, correct: draft.questions.map(question => question.correctOption) };
  if (v2) {
    // Topics without module tests carry no per-question module tags.
    if (draft.questions.every(question => question.tags!.moduleTag)) {
      key.modules = draft.questions.map(question => question.tags!.moduleTag);
    }
    key.catalogIds = draft.questions.map(question => question.tags!.catalogId);
    key.skills = draft.questions.map(question => question.tags!.skill);
  }
  return {
    questions: {
      moduleId,
      version,
      questions: draft.questions.map(({ id, stem, table, figure, tree, options }) =>
        v2 ? { id, stem, table, figure, tree: tree ?? null, options } : { id, stem, table, figure, options }),
    },
    key,
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
        ...(v2 ? { reviewFigure: question.reviewFigure ?? null, reviewTree: question.reviewTree ?? null } : {}),
      })),
    },
    sources: v2
      ? {
          moduleId,
          version,
          items: draft.questions.map(question => ({ id: question.id, ...question.tags!, ...question.source! })),
        }
      : null,
  };
}

/** Serialized UTF-8 size, a close upper bound of the Firestore document size. */
export function mockDocBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function assertMockDocSizes(docs: MockDraftDocs): void {
  for (const [name, value] of Object.entries(docs)) {
    if (value === null) continue;
    const bytes = mockDocBytes(value);
    if (bytes > MOCK_MAX_DOC_BYTES) {
      throw new MockContentError(`The ${name} document would be ${bytes} bytes; the limit is ${MOCK_MAX_DOC_BYTES}.`);
    }
  }
}

export function mockTestKind(meta: Pick<MockTestMeta, "kind">): MockTestKind {
  return meta.kind ?? "module";
}

export function mockAttemptId(uid: string, moduleId: string): string {
  return `${uid}_${moduleId}`;
}

export function mockHistoryId(attemptId: string, attemptNumber: number): string {
  return `${attemptId}_${attemptNumber}`;
}

export function emptyAnswers(count = MOCK_QUESTION_COUNT): MockAnswer[] {
  return Array.from({ length: count }, () => null);
}

export function emptyFlags(count = MOCK_QUESTION_COUNT): boolean[] {
  return Array.from({ length: count }, () => false);
}

export function emptyDwell(count: number): number[] {
  return Array.from({ length: count }, () => 0);
}

/** Questions in an attempt: frozen on paper attempts, 8 on every module-test attempt. */
export function mockAttemptQuestionCount(attempt: Pick<MockAttempt, "questionCount">): number {
  return attempt.questionCount ?? MOCK_QUESTION_COUNT;
}

export function mockAttemptDurationMs(attempt: Pick<MockAttempt, "durationSeconds">): number {
  return attempt.durationSeconds === undefined ? MOCK_DURATION_MS : attempt.durationSeconds * 1000;
}

/** Grading must match the rule in firestore.rules exactly. */
export function gradeMockAnswers(
  answers: readonly MockAnswer[],
  key: readonly MockOption[],
): { correct: boolean[]; score: number } {
  if (!Object.values(MOCK_KIND_QUESTION_COUNT).includes(key.length)) {
    throw new MockContentError(`The answer key must have ${Object.values(MOCK_KIND_QUESTION_COUNT).join(" or ")} entries.`);
  }
  if (answers.length !== key.length) throw new MockContentError("The answers and the key cover different questions.");
  const correct = key.map((right, index) => answers[index] === right);
  return { correct, score: correct.filter(Boolean).length };
}

export function mockDeadlineMs(startedAtMs: number, durationMs = MOCK_DURATION_MS): number {
  return startedAtMs + durationMs;
}

/**
 * Remaining time on the server clock. `serverOffsetMs` is server minus
 * client time, measured when the attempt was created or resumed, so moving
 * the device clock does not change the result.
 */
export function mockRemainingMs(
  startedAtMs: number,
  clientNowMs: number,
  serverOffsetMs: number,
  durationMs = MOCK_DURATION_MS,
): number {
  return Math.max(0, mockDeadlineMs(startedAtMs, durationMs) - (clientNowMs + serverOffsetMs));
}

export function mockTimeUsedMs(
  attempt: Pick<MockAttempt, "startedAtMs" | "submittedAtMs" | "durationSeconds">,
): number | null {
  if (attempt.submittedAtMs === null) return null;
  return Math.min(mockAttemptDurationMs(attempt), Math.max(0, attempt.submittedAtMs - attempt.startedAtMs));
}

export type MockAttemptView = "not-started" | "in-progress" | "expired" | "completed" | "forfeited";

/** "expired" is an active attempt past its deadline that still needs finalizing. */
export function mockAttemptView(attempt: MockAttempt | null, serverNowMs: number): MockAttemptView {
  if (!attempt) return "not-started";
  if (attempt.status === "forfeited") return "forfeited";
  if (attempt.status === "submitted") return "completed";
  return serverNowMs >= mockDeadlineMs(attempt.startedAtMs, mockAttemptDurationMs(attempt)) ? "expired" : "in-progress";
}

export function isMockAttemptLocked(attempt: Pick<MockAttempt, "status">): boolean {
  return attempt.status === "submitted" || attempt.status === "forfeited";
}

export function appendIncident(incidents: readonly MockIncident[], incident: MockIncident): MockIncident[] {
  if (incidents.length >= MOCK_MAX_INCIDENTS) return [...incidents];
  return [...incidents, incident];
}

export function appendKeystroke(
  keystrokes: readonly MockKeystroke[],
  keystroke: MockKeystroke,
  limit = MOCK_MAX_KEYSTROKES,
): MockKeystroke[] {
  if (keystrokes.length >= limit) return [...keystrokes];
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
