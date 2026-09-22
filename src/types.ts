export interface PlanSession {
  number: number;
  label: string;
  title: string;
  objective: string;
  durationMinutes: number;
  requirement: "required";
  date: string;
  day: string;
  deliveryDates?: string[];
  readings: string[];
}

export interface MockMilestone {
  label: string;
  targetScore: number | null;
  instruction: string;
}

export interface PlanWeek {
  phase: string;
  week: number;
  startDate: string;
  endDate: string;
  focus: string;
  topics: string[];
  outcomes: string[];
  session1?: PlanSession;
  session2?: PlanSession;
  session3?: PlanSession;
  independentStudy: string[];
  questionTarget: number;
  masteryGate: string;
  mockMilestone: MockMilestone | null;
}

export interface PlanTask {
  id: string;
  label: string;
  detail: string;
  kind: "session" | "independent" | "evidence";
  optional: boolean;
}

export interface SessionLog {
  id: string;
  date: string;
  sessionNumber: number;
  week: number;
  type: string;
  durationMinutes: number;
  focus: string;
  outcome: string;
  nextAction: string;
}

export interface PracticeLog {
  id: string;
  date: string;
  topic: string;
  attempted: number;
  correct: number;
  source: string;
  note: string;
  confidence: number;
}

/** Per-topic result inside one mock, as the tutor tallies it from the debrief. */
export interface MockScoreSection {
  topic: string;
  attempted: number;
  correct: number;
}

export interface MockScore {
  id: string;
  date: string;
  label: string;
  score: number;
  note: string;
  milestoneWeek?: number | null;
  /** Optional section breakdown; absent for mocks logged with a headline score only. */
  sections?: MockScoreSection[];
}

export interface SessionCompletionRequest {
  taskId: string;
  requestedAt: string;
}

export interface SessionCompletionReview {
  taskId: string;
  requestedAt: string;
  status: "approved" | "returned";
  reviewedAt: string;
  note: string;
}

export interface PrivateTutorNote {
  id: string;
  date: string;
  category: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface ErrorEntry {
  id: string;
  date: string;
  topic: string;
  category: string;
  summary: string;
  correction: string;
  revisitDate: string;
  resolved: boolean;
  /** Set when the entry was bridged from a Practice Coach miss; used to dedupe and link back. */
  questionId?: string;
  bankId?: string;
}

export interface NoteEntry {
  id: string;
  date: string;
  category: string;
  title: string;
  body: string;
}

export interface SessionOverride {
  sessionNumber: number;
  date: string;
  reason: string;
  updatedAt: string;
}

export interface DiagnosticEntry {
  id: string;
  date: string;
  sessionNumber: 1;
  status: "draft" | "final";
  attempted: number;
  correct: number;
  studyHoursPerWeek: number;
  pacingRating: number;
  confidenceRating: number;
  calculatorReady: boolean;
  priorityTopics: string[];
  strengths: string;
  barriers: string;
  tutorPlan: string;
}

export interface TrackerState {
  version: 1;
  scheduleVersion: "weekly-saturday-v4";
  updatedAt: string;
  taskCompletions: Record<string, boolean>;
  sessionCompletionRequests: Record<string, SessionCompletionRequest>;
  sessionCompletionReviews: Record<string, SessionCompletionReview>;
  topicMastery: Record<string, number>;
  sessionLogs: SessionLog[];
  practiceLogs: PracticeLog[];
  mockScores: MockScore[];
  errorEntries: ErrorEntry[];
  notes: NoteEntry[];
  sessionOverrides: Record<string, SessionOverride>;
  diagnostics: DiagnosticEntry[];
}
