export const categories = [
  'seo',
  'accessibility',
  'technical',
  'structure',
] as const;
export type Category = (typeof categories)[number];
export type Severity = 'error' | 'warning' | 'info';
export interface Finding {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  status: 'pass' | 'fail' | 'skip';
  explanation: string;
  recommendation: string;
  evidence: string[];
}
export interface AuditReport {
  schemaVersion: 1;
  url: string;
  finalUrl: string;
  auditedAt: string;
  mode: 'html' | 'browser';
  score: number;
  scores: Record<Category, number | null>;
  findings: Finding[];
  metrics: {
    responseTimeMs: number;
    domElements: number;
    linksChecked: number;
    linksDiscovered: number;
  };
  limitations: string[];
}
export interface PageSnapshot {
  html: string;
  url: string;
  status: number;
  responseTimeMs: number;
  consoleErrors: string[] | null;
}
export interface AuditOptions {
  browser?: boolean;
  timeoutMs?: number;
  maxLinks?: number;
}
export class AuditError extends Error {
  constructor(
    message: string,
    public readonly code:
      'INVALID_URL' | 'BLOCKED_URL' | 'NETWORK' | 'BROWSER' | 'LIMIT',
  ) {
    super(message);
    this.name = 'AuditError';
  }
}
