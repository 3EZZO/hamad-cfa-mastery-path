import { useEffect, useState } from "react";
import type { MockTestPackage } from "../../lib/cloudMockTests";
import {
  MOCK_KIND_QUESTION_COUNT,
  emptyAnswers,
  emptyDwell,
  emptyFlags,
  gradeMockAnswers,
  mockDurationMsFor,
  mockKeystrokeLimit,
  parseMockTestDraft,
  splitMockDraft,
} from "../../lib/mockTestContent";
import { MOCK_PAPER_KIND } from "../../data/mockPapers";
import { MockResults } from "./MockResults";
import { MockTestRunner } from "./MockTestRunner";
import { PaperBreakdownView } from "./PaperBreakdownView";
import "./moduleMock.css";

/**
 * DEVELOPMENT ONLY (mounted from main.tsx under import.meta.env.DEV; absent
 * from production builds, which the build check verifies). Renders a local
 * mock upload in the real exam and review screens, so the tutor review sheet
 * shows exactly what the student will see. It never calls Firebase: the file
 * is read from this machine and nothing is saved or sent.
 *
 *   /?paper-preview=<project-relative path to a *.mock.json>&q=<1-based>&view=exam|review[&correct=<n>]
 *
 * `correct` (review only) answers the first n questions right and the rest
 * wrong, to see a pass or fail result; without it every answer is right.
 */
export const DEV_PAPER_PREVIEW_MARKER = "dev-paper-preview-harness";

function packageOf(raw: unknown): MockTestPackage {
  const draft = parseMockTestDraft(raw);
  const docs = splitMockDraft(draft);
  const questionCount = MOCK_KIND_QUESTION_COUNT[draft.kind];
  return {
    meta: {
      schemaVersion: draft.schemaVersion,
      kind: draft.kind,
      moduleId: draft.moduleId,
      title: draft.title,
      version: draft.version,
      status: "draft",
      questionCount,
      durationSeconds: mockDurationMsFor(questionCount) / 1000,
      updatedBy: "dev-preview",
      updatedAtClient: "",
      publishedAtClient: null,
    },
    ...docs,
  };
}

export default function DevPaperPreview() {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("paper-preview") ?? "";
  const view = params.get("view") === "review" ? "review" : "exam";
  const question = Math.max(1, Number(params.get("q") ?? "1") || 1);
  const [pkg, setPkg] = useState<MockTestPackage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!path) return;
    fetch(`/${path.replace(/^\/+/, "")}`)
      .then(response => {
        if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`);
        return response.json();
      })
      .then(raw => setPkg(packageOf(raw)))
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [path]);

  const load = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPkg(packageOf(JSON.parse(await file.text())));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (!pkg) {
    return (
      <main className="mock-start" data-marker={DEV_PAPER_PREVIEW_MARKER}>
        <div className="mock-start__card">
          <p className="mock-start__eyebrow">Development only · nothing is sent anywhere</p>
          <h2>Paper preview</h2>
          <p>Load a local <code>*.mock.json</code> to see it in the real exam and review screens.</p>
          <input type="file" accept="application/json,.json" onChange={event => void load(event.target.files?.[0])} />
          {error && <p className="mock-hub__error" role="alert" style={{ whiteSpace: "pre-line" }}>{error}</p>}
        </div>
      </main>
    );
  }

  const count = pkg.key.correct.length;
  if (view === "review") {
    // The review as a student sees it once released: every answer right, or only the first `correct`.
    const right = params.has("correct") ? Math.max(0, Number(params.get("correct")) || 0) : count;
    const answers = pkg.key.correct.map((option, index) => (index < right ? option : ((option + 1) % 3) as typeof option));
    const { correct, score } = gradeMockAnswers(answers, pkg.key.correct);
    return (
      <MockResults
        moduleLabel={pkg.meta.title}
        local={{ reason: "submit", work: { answers, flags: emptyFlags(count), incidents: [], keystrokes: [], dwellMs: emptyDwell(count) }, correct, score, timeUsedMs: 0, pkg, saved: true }}
        backLabel="Preview"
        onBack={() => undefined}
        breakdown={pkg.key.modules ? review => <PaperBreakdownView keyDoc={pkg.key} {...review} /> : undefined}
      />
    );
  }
  return (
    <MockTestRunner
      rehearsal="unsaved"
      kindLabel={pkg.meta.kind === "paper" ? MOCK_PAPER_KIND : "Module mock test"}
      moduleLabel={`${pkg.meta.title} · preview`}
      questions={pkg.questions.questions}
      startedAtMs={Date.now()}
      serverOffsetMs={0}
      durationMs={pkg.meta.durationSeconds * 1000}
      keystrokeLimit={mockKeystrokeLimit(count)}
      initialIndex={question - 1}
      initialWork={{ answers: emptyAnswers(count), flags: emptyFlags(count), incidents: [], keystrokes: [], dwellMs: emptyDwell(count) }}
      onSave={async () => undefined}
      onFinish={async () => undefined}
    />
  );
}
