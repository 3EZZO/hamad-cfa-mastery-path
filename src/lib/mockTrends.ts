import { MOCK_TOPICS, mockModuleById, mockModuleCode, type MockTopic } from "../data/mockModules";
import type { MockAttempt } from "./mockTestContent";

/**
 * Module test scores per topic for Progress → Mocks: the average of the graded
 * (submitted, not forfeited) tests and the most recent few in the order they
 * were taken. Topics without a graded test are left out.
 */
export interface TopicTrendScore {
  moduleId: string;
  code: string;
  title: string;
  score: number;
}

export interface TopicTrend {
  topic: MockTopic;
  graded: number;
  averageScore: number;
  /** Oldest first, newest last. */
  recent: TopicTrendScore[];
}

export function topicScoreTrends(attempts: readonly MockAttempt[], recentCount = 5): TopicTrend[] {
  const graded = attempts
    .filter(attempt => attempt.status === "submitted" && attempt.score !== null && attempt.submittedAtMs !== null)
    .flatMap(attempt => {
      const module = mockModuleById(attempt.moduleId);
      return module ? [{ module, score: attempt.score!, at: attempt.submittedAtMs! }] : [];
    })
    .sort((left, right) => left.at - right.at);
  return MOCK_TOPICS.flatMap((topic): TopicTrend[] => {
    const scores = graded.filter(entry => entry.module.topic === topic);
    if (!scores.length) return [];
    return [{
      topic,
      graded: scores.length,
      averageScore: scores.reduce((sum, entry) => sum + entry.score, 0) / scores.length,
      recent: scores.slice(-recentCount).map(entry => ({
        moduleId: entry.module.id,
        code: mockModuleCode(entry.module),
        title: entry.module.title,
        score: entry.score,
      })),
    }];
  });
}
