export interface PlanSession {
  number: number;
  label: string;
  title: string;
  objective: string;
  durationMinutes: number;
  requirement: "required" | "flex";
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
  session1: PlanSession;
  session2: PlanSession;
  session3: PlanSession;
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
}

export interface MockScore {
  id: string;
  date: string;
  label: string;
  score: number;
  note: string;
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
}

export interface NoteEntry {
  id: string;
  date: string;
  category: string;
  title: string;
  body: string;
}

export interface TrackerState {
  version: 1;
  updatedAt: string;
  taskCompletions: Record<string, boolean>;
  topicMastery: Record<string, number>;
  sessionLogs: SessionLog[];
  practiceLogs: PracticeLog[];
  mockScores: MockScore[];
  errorEntries: ErrorEntry[];
  notes: NoteEntry[];
}
