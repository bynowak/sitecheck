import { categories, type Finding, type Category } from './types.js';
export const severityWeights = { error: 5, warning: 2, info: 1 } as const;
export function scoreFindings(findings: Finding[]): {
  score: number;
  scores: Record<Category, number | null>;
} {
  const scores = Object.fromEntries(
    categories.map((category) => {
      const checks = findings.filter(
        (f) => f.category === category && f.status !== 'skip',
      );
      const total = checks.reduce((n, f) => n + severityWeights[f.severity], 0);
      const passed = checks
        .filter((f) => f.status === 'pass')
        .reduce((n, f) => n + severityWeights[f.severity], 0);
      return [category, total ? Math.round((100 * passed) / total) : null];
    }),
  ) as Record<Category, number | null>;
  const available = Object.values(scores).filter(
    (n): n is number => n !== null,
  );
  return {
    score: available.length
      ? Math.round(available.reduce((a, b) => a + b, 0) / available.length)
      : 0,
    scores,
  };
}
