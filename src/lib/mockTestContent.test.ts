import { describe, expect, it } from "vitest";
import {
  MOCK_DURATION_MS,
  MOCK_MAX_DOC_BYTES,
  MOCK_MAX_INCIDENTS,
  MockContentError,
  appendIncident,
  appendKeystroke,
  emptyAnswers,
  emptyDwell,
  formatMockClock,
  gradeMockAnswers,
  mockAttemptDurationMs,
  mockAttemptId,
  mockAttemptQuestionCount,
  mockAttemptView,
  mockDocBytes,
  mockDurationMsFor,
  mockKeystrokeLimit,
  mockRemainingMs,
  mockTimeUsedMs,
  parseMockTestDraft,
  splitMockDraft,
  type MockAttempt,
} from "./mockTestContent";
import { SYNTHETIC_PAPER_ID, syntheticPaper, syntheticPaperQuestion, syntheticTree } from "../testFixtures/syntheticPaper";

// Synthetic fixture only: real mock content is private and never committed.
function syntheticDraft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    moduleId: "m99-synthetic",
    version: "test-1",
    title: "Synthetic mock",
    source: "Unit test fixture",
    questions: Array.from({ length: 8 }, (_, index) => ({
      id: `syn-q${index + 1}`,
      stem: `Synthetic stem ${index + 1}`,
      table: index === 0 ? { caption: "Exhibit", headers: ["Year", "Return"], rows: [["1", "5%"], ["2", "-3%"]] } : null,
      options: ["Alpha.", "Beta.", "Gamma."],
      correctOption: index % 3,
      concept: "Synthetic concept",
      explanation: "Synthetic explanation",
      working: ["step"],
      keystrokes: "",
      distractors: ["a", "b", "c"],
      confidence: "High",
      sourceFiles: [],
      sourceRef: "",
    })),
    ...overrides,
  };
}

function attempt(overrides: Partial<MockAttempt> = {}): MockAttempt {
  return {
    id: mockAttemptId("student-1", "m99-synthetic"),
    uid: "student-1",
    moduleId: "m99-synthetic",
    testVersion: "test-1",
    attemptNumber: 1,
    status: "active",
    startedAtMs: 1_000_000,
    lastSeenAtMs: 1_000_000,
    answers: Array(8).fill(null),
    flags: Array(8).fill(false),
    incidents: [],
    keystrokes: [],
    submittedAtMs: null,
    finishReason: null,
    score: null,
    correct: null,
    reviewReleased: false,
    ...overrides,
  };
}

describe("mock test content contract", () => {
  it("parses a valid upload and wraps table rows for Firestore", () => {
    const draft = parseMockTestDraft(syntheticDraft());
    expect(draft.questions).toHaveLength(8);
    expect(draft.questions[0]!.table!.rows[0]).toEqual({ cells: ["1", "5%"] });
  });

  it("rejects a test that does not have exactly eight questions", () => {
    const short = syntheticDraft({ questions: syntheticDraft().questions.slice(0, 7) });
    expect(() => parseMockTestDraft(short)).toThrow(MockContentError);
  });

  it("rejects an answer outside A-C and a table with ragged rows", () => {
    const badAnswer = syntheticDraft();
    (badAnswer.questions[2] as Record<string, unknown>).correctOption = 3;
    expect(() => parseMockTestDraft(badAnswer)).toThrow(/correctOption/);
    const rowLabels = syntheticDraft();
    rowLabels.questions[0]!.table = { caption: "", headers: ["", "2019"], rows: [["Balance", "800"]] };
    expect(parseMockTestDraft(rowLabels).questions[0]!.table!.headers).toEqual(["", "2019"]);
    const ragged = syntheticDraft();
    ragged.questions[0]!.table = { caption: "", headers: ["A", "B"], rows: [["only one"]] };
    expect(() => parseMockTestDraft(ragged)).toThrow(/cells/);
  });

  it("never copies answer or explanation fields into the student questions document", () => {
    const { questions, key, review } = splitMockDraft(parseMockTestDraft(syntheticDraft()));
    const serialized = JSON.stringify(questions);
    for (const forbidden of ["correctOption", "explanation", "distractors", "confidence", "concept", "keystrokes", "sourceFiles"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(key.correct).toEqual([0, 1, 2, 0, 1, 2, 0, 1]);
    expect(review.items).toHaveLength(8);
  });
});

function syntheticFigure(overrides: Record<string, unknown> = {}) {
  return {
    title: "Market for widgets",
    description: "Demand falls and supply rises with price; they cross at a price of 40.",
    xLabel: "Quantity",
    yLabel: "Price",
    xMin: 0, xMax: 100, yMin: 0, yMax: 80,
    xTicks: [0, 50, 100],
    yTicks: [0, 40, 80],
    series: [
      { kind: "line", label: "Demand", points: [{ x: 0, y: 80 }, { x: 100, y: 0 }] },
      { kind: "line", label: "Supply", tone: "secondary", dashed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 80 }] },
    ],
    guides: [{ axis: "y", value: 40, label: "P = 40" }],
    markers: [{ x: 50, y: 40, label: "E" }],
    ...overrides,
  };
}

describe("question figures", () => {
  it("parses a figure with defaults and keeps it in the student questions document", () => {
    const upload = syntheticDraft();
    (upload.questions[1] as Record<string, unknown>).figure = syntheticFigure();
    const draft = parseMockTestDraft(upload);
    const figure = draft.questions[1]!.figure!;
    expect(figure.series.map(series => [series.label, series.tone, series.dashed])).toEqual([
      ["Demand", "primary", false],
      ["Supply", "secondary", true],
    ]);
    expect(draft.questions[0]!.figure).toBeNull();
    expect(splitMockDraft(draft).questions.questions[1]!.figure).toEqual(figure);
  });

  it("rejects malformed figures", () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ xMin: 10, xMax: 10 }, /xMin < xMax/],
      [{ yMax: Number.NaN }, /yMax must be a number/],
      [{ series: [] }, /series is empty/],
      [{ series: [{ kind: "pie", label: "x", points: [{ x: 0, y: 0 }] }] }, /kind/],
      [{ series: [{ kind: "line", label: "x", tone: "neon", points: [{ x: 0, y: 0 }] }] }, /tone/],
      [{ series: [{ kind: "line", label: "x", points: [[0, 0]] }] }, /\{x, y\}/],
      [{ series: [{ kind: "line", label: "x", points: Array.from({ length: 201 }, (_, x) => ({ x, y: x })) }] }, /at most 200/],
      [{ guides: [{ axis: "z", value: 1, label: "" }] }, /axis/],
    ];
    for (const [override, message] of cases) {
      const upload = syntheticDraft();
      (upload.questions[0] as Record<string, unknown>).figure = syntheticFigure(override);
      expect(() => parseMockTestDraft(upload)).toThrow(message);
    }
  });
});

describe("grading and timing", () => {
  it("grades unanswered questions as wrong", () => {
    const result = gradeMockAnswers([0, 1, null, 0, 2, 2, null, 1], [0, 1, 2, 0, 1, 2, 0, 1]);
    expect(result.correct).toEqual([true, true, false, true, false, true, false, true]);
    expect(result.score).toBe(5);
  });

  it("uses the server offset, so a changed device clock adds no time", () => {
    const started = 1_000_000;
    // Device clock is 10 minutes behind the server: offset +600 000 ms.
    const deviceNow = started - 600_000 + 60_000;
    expect(mockRemainingMs(started, deviceNow, 600_000)).toBe(MOCK_DURATION_MS - 60_000);
    // Without the offset the same device reading would show 22 minutes left.
    expect(mockRemainingMs(started, deviceNow, 0)).toBeGreaterThan(MOCK_DURATION_MS);
    expect(mockRemainingMs(started, started + MOCK_DURATION_MS + 5_000, 0)).toBe(0);
  });

  it("derives the attempt status the student and tutor see", () => {
    expect(mockAttemptView(null, 0)).toBe("not-started");
    expect(mockAttemptView(attempt(), 1_000_000 + 60_000)).toBe("in-progress");
    expect(mockAttemptView(attempt(), 1_000_000 + MOCK_DURATION_MS)).toBe("expired");
    expect(mockAttemptView(attempt({ status: "submitted" }), 0)).toBe("completed");
    expect(mockAttemptView(attempt({ status: "forfeited" }), 0)).toBe("forfeited");
  });

  it("caps time used at 12 minutes", () => {
    expect(mockTimeUsedMs(attempt({ submittedAtMs: 1_000_000 + 400_000 }))).toBe(400_000);
    expect(mockTimeUsedMs(attempt({ submittedAtMs: 1_000_000 + MOCK_DURATION_MS + 9_000 }))).toBe(MOCK_DURATION_MS);
    expect(mockTimeUsedMs(attempt())).toBeNull();
  });

  it("formats the countdown and bounds the incident log", () => {
    expect(formatMockClock(MOCK_DURATION_MS)).toBe("12:00");
    expect(formatMockClock(299_001)).toBe("05:00");
    expect(formatMockClock(0)).toBe("00:00");
    let incidents = attempt().incidents;
    for (let index = 0; index < MOCK_MAX_INCIDENTS + 5; index += 1) {
      incidents = appendIncident(incidents, { type: "tab-hidden", atClient: "x", elapsedMs: index });
    }
    expect(incidents).toHaveLength(MOCK_MAX_INCIDENTS);
  });
});

describe("full mock papers (schema 2)", () => {
  const paperAttempt = (overrides: Partial<MockAttempt> = {}) =>
    attempt({ moduleId: SYNTHETIC_PAPER_ID, questionCount: 44, durationSeconds: 3960, answers: Array(44).fill(null), flags: Array(44).fill(false), ...overrides });

  it("parses a 44-question, 66-minute paper and keeps schema 1 module tests unchanged", () => {
    const paper = parseMockTestDraft(syntheticPaper());
    expect(paper.kind).toBe("paper");
    expect(paper.questions).toHaveLength(44);
    expect(mockDurationMsFor(44)).toBe(66 * 60 * 1000);
    const legacy = parseMockTestDraft(syntheticDraft());
    expect(legacy.kind).toBe("module");
    expect(splitMockDraft(legacy).sources).toBeNull();
    expect(Object.keys(splitMockDraft(legacy).questions.questions[0]!)).toEqual(["id", "stem", "table", "figure", "options"]);
  });

  it("rejects wrong sizes, unregistered paper ids and schema 2 fields on schema 1", () => {
    expect(() => parseMockTestDraft(syntheticPaper({ questions: syntheticPaper().questions.slice(0, 43) }))).toThrow("exactly 44");
    expect(() => parseMockTestDraft(syntheticPaper({ moduleId: "qm-paper-99" }))).toThrow("registered papers");
    expect(() => parseMockTestDraft(syntheticPaper({ kind: "module", moduleId: "m99-synthetic" }))).toThrow("exactly 8");
    expect(() => parseMockTestDraft(syntheticPaper({ kind: "module" }))).toThrow("cannot use a paper id");
    expect(() => parseMockTestDraft(syntheticDraft({ moduleId: "qm-paper-01" }))).toThrow("cannot use a paper id");
    const withTree = syntheticDraft();
    (withTree.questions[0] as Record<string, unknown>).tree = syntheticTree();
    expect(() => parseMockTestDraft(withTree)).toThrow("need schemaVersion 2");
    const withSourceRef = syntheticPaper();
    (withSourceRef.questions[0] as Record<string, unknown>).sourceRef = "private";
    expect(() => parseMockTestDraft(withSourceRef)).toThrow("keeps provenance in source");
  });

  it("splits tags into the key and provenance into the tutor-only sources, never into the questions", () => {
    const docs = splitMockDraft(parseMockTestDraft(syntheticPaper()));
    const studentView = JSON.stringify(docs.questions);
    for (const leak of ["synthetic-bank", "moduleTag", "catalogId", "cfa-2027", "skill", "authoring", "correctOption", "Synthetic explanation"]) {
      expect(studentView).not.toContain(leak);
    }
    expect(docs.key.correct).toHaveLength(44);
    expect(docs.key.modules).toHaveLength(44);
    expect(docs.key.skills![0]).toBe("calculation");
    expect(docs.sources!.items[0]).toMatchObject({ id: "qmp01-q01", authoring: "source", bankId: "synthetic-bank-1", sourcePage: 3 });
    expect(docs.sources!.items[10]).toMatchObject({ authoring: "authored", bankId: "", sourcePage: null });
    expect(JSON.stringify(docs.review)).not.toContain("synthetic-bank");
  });

  it("checks authored versus source provenance and the 2027 tags", () => {
    const authoredWithBank = syntheticPaper();
    authoredWithBank.questions[10] = syntheticPaperQuestion(10, { source: { authoring: "authored", bankId: "x", sourcePage: null } });
    expect(() => parseMockTestDraft(authoredWithBank)).toThrow("authored question has no bankId");
    const sourceWithoutPage = syntheticPaper();
    sourceWithoutPage.questions[0] = syntheticPaperQuestion(0, { source: { authoring: "source", bankId: "x", sourcePage: null } });
    expect(() => parseMockTestDraft(sourceWithoutPage)).toThrow("needs bankId and sourcePage");
    const badCatalog = syntheticPaper();
    badCatalog.questions[0] = syntheticPaperQuestion(0, { tags: { ...syntheticPaperQuestion(0).tags, catalogId: "m009" } });
    expect(() => parseMockTestDraft(badCatalog)).toThrow("official 2027 module id");
    const economics = syntheticPaper();
    economics.questions[0] = syntheticPaperQuestion(0, { tags: { ...syntheticPaperQuestion(0).tags, moduleTag: "e03-fiscal-policy" } });
    expect(() => parseMockTestDraft(economics)).toThrow("Quantitative Methods module test id");
  });

  it("shows a graphic in the exam only when the question supplies it", () => {
    const tags = (exhibitPolicy: string) => ({ ...syntheticPaperQuestion(0).tags, exhibitPolicy });
    const supplied = syntheticPaper();
    supplied.questions[0] = syntheticPaperQuestion(0, { tree: syntheticTree(), tags: tags("supplied") });
    expect(parseMockTestDraft(supplied).questions[0]!.tree!.branches[0]!.children).toHaveLength(2);

    const buildIt = syntheticPaper();
    buildIt.questions[0] = syntheticPaperQuestion(0, { tree: syntheticTree(), tags: tags("explanation-only") });
    expect(() => parseMockTestDraft(buildIt)).toThrow("only exhibitPolicy supplied");
    buildIt.questions[0] = syntheticPaperQuestion(0, { reviewTree: syntheticTree(), tags: tags("explanation-only") });
    const parsed = splitMockDraft(parseMockTestDraft(buildIt));
    expect(parsed.questions.questions[0]!.tree).toBeNull();
    expect(parsed.review.items[0]!.reviewTree!.title).toBe("Synthetic tree");

    const missing = syntheticPaper();
    missing.questions[0] = syntheticPaperQuestion(0, { tags: tags("supplied") });
    expect(() => parseMockTestDraft(missing)).toThrow("needs a figure or tree");
  });

  it("bounds tree size and depth", () => {
    const deep = syntheticTree();
    let node = deep.branches[0]!.children[0]! as Record<string, unknown>;
    for (let level = 0; level < 3; level += 1) {
      const child = { label: "deeper", probability: "0.5" };
      node.children = [child, { label: "other", probability: "0.5" }];
      node = child;
    }
    const supplied = { ...syntheticPaperQuestion(0).tags, exhibitPolicy: "supplied" };
    const paper = syntheticPaper();
    paper.questions[0] = syntheticPaperQuestion(0, { tree: deep, tags: supplied });
    expect(() => parseMockTestDraft(paper)).toThrow("deeper than 3 levels");
    const single = syntheticTree();
    single.branches = [single.branches[0]!];
    paper.questions[0] = syntheticPaperQuestion(0, { tree: single, tags: supplied });
    expect(() => parseMockTestDraft(paper)).toThrow("2-4 branches");
  });

  it("rejects an upload whose documents would exceed the size budget", () => {
    // Every field within its own limit, but 44 maximal tables add up past the budget.
    const headers = Array.from({ length: 12 }, (_, index) => `H${index}`);
    const rows = Array.from({ length: 30 }, () => ({ cells: Array(12).fill("x".repeat(300)) }));
    const heavy = syntheticPaper({
      questions: syntheticPaper().questions.map(question => ({ ...question, table: { caption: "Exhibit", headers, rows } })),
    });
    expect(() => parseMockTestDraft(heavy)).toThrow("questions document would be");
    // A realistic paper with long explanations stays inside it.
    const long = syntheticPaper();
    long.questions = long.questions.map(question => ({
      ...question,
      explanation: "x".repeat(4000),
      working: Array(12).fill("y".repeat(600)),
      distractors: ["z".repeat(1200), "z".repeat(1200), "z".repeat(1200)],
    }));
    expect(() => parseMockTestDraft(long)).not.toThrow();
  });

  it("grades, times and resolves a frozen 44-question attempt", () => {
    const key = Array.from({ length: 44 }, (_, index) => (index % 3) as 0 | 1 | 2);
    const answers = key.map((right, index) => (index < 30 ? right : null));
    expect(gradeMockAnswers(answers, key).score).toBe(30);
    expect(() => gradeMockAnswers(answers.slice(0, 8), key)).toThrow("different questions");
    expect(() => gradeMockAnswers(answers.slice(0, 10), key.slice(0, 10))).toThrow("8 or 44");

    const durationMs = mockAttemptDurationMs(paperAttempt());
    expect(durationMs).toBe(3_960_000);
    expect(mockAttemptQuestionCount(paperAttempt())).toBe(44);
    expect(mockAttemptQuestionCount(attempt())).toBe(8);
    expect(mockAttemptView(paperAttempt(), 1_000_000 + MOCK_DURATION_MS + 1)).toBe("in-progress");
    expect(mockAttemptView(paperAttempt(), 1_000_000 + durationMs)).toBe("expired");
    expect(mockTimeUsedMs(paperAttempt({ submittedAtMs: 1_000_000 + durationMs + 9_000 }))).toBe(durationMs);
    expect(mockRemainingMs(1_000_000, 1_000_000, 0, durationMs)).toBe(durationMs);
    expect(emptyAnswers(44)).toHaveLength(44);
    expect(emptyDwell(44).every(value => value === 0)).toBe(true);
  });

  it("keeps a larger calculator history for papers only", () => {
    expect(mockKeystrokeLimit(8)).toBe(600);
    expect(mockKeystrokeLimit(44)).toBe(1500);
    const stroke = { q: 0, key: "1", display: "1", t: 0, registers: { N: 0, IY: 0, PV: 0, PMT: 0, FV: 0, PY: 1, CY: 1, isBGN: false } };
    let log = Array.from({ length: 600 }, () => stroke);
    expect(appendKeystroke(log, stroke)).toHaveLength(600);
    expect(appendKeystroke(log, stroke, 1500)).toHaveLength(601);
    log = Array.from({ length: 1500 }, () => stroke);
    expect(appendKeystroke(log, stroke, 1500)).toHaveLength(1500);
  });

  it("measures document sizes in UTF-8 bytes", () => {
    expect(mockDocBytes({ a: "é" })).toBe(new TextEncoder().encode(JSON.stringify({ a: "é" })).length);
    expect(MOCK_MAX_DOC_BYTES).toBeLessThan(1_048_576);
  });
});
