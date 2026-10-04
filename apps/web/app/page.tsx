'use client';
import { useState } from 'react';
import type { AuditReport, Category, Severity } from '@sitecheck/engine';
const names: Record<Category, string> = {
  seo: 'SEO',
  accessibility: 'Accessibility',
  technical: 'Technical',
  structure: 'Content / Structure',
};
export default function Dashboard() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const [copied, setCopied] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url }),
      });
      const data: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data === 'object' && data !== null && 'error' in data
            ? String(data.error)
            : 'Audit failed',
        );
      setReport(data as AuditReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit failed');
    } finally {
      setLoading(false);
    }
  }
  const json = () => JSON.stringify(report, null, 2);
  async function copy() {
    try {
      await navigator.clipboard.writeText(json());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard unavailable. Export JSON instead.');
    }
  }
  function download() {
    const resource = URL.createObjectURL(
      new Blob([json()], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = resource;
    a.download = 'sitecheck-report.json';
    a.click();
    URL.revokeObjectURL(resource);
  }
  return (
    <>
      <header className="top">
        <a href="/" className="brand">
          <span className="mark">✓</span> sitecheck
          <span className="version">v1.0</span>
        </a>
        <a href="https://github.com/bynowak/sitecheck">GitHub ↗</a>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">THE WEBSITE QUALITY TOOLKIT</p>
          <h1>Know what ships.</h1>
          <p>
            Find the overlooked details. A clear, actionable audit of your
            website’s metadata, accessibility, and technical health.
          </p>
        </section>
        <section className="scan">
          <form onSubmit={submit}>
            <label htmlFor="url">Public website URL</label>
            <div className="input-row">
              <input
                id="url"
                type="url"
                required
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
              <button disabled={loading}>
                {loading ? 'Auditing…' : 'Run audit →'}
              </button>
            </div>
            <details>
              <summary>Server authentication</summary>
              <label htmlFor="token">
                API token (required on production servers)
              </label>
              <input
                id="token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </details>
            <p className="hint">
              One page. Four categories. Every finding explained. HTML
              inspection · up to 10 links.
            </p>
          </form>
        </section>
        {loading && (
          <div role="status" className="state">
            Inspecting the document and checking public links. This can take up
            to two minutes.
          </div>
        )}
        {error && (
          <div role="alert" className="state error">
            {error}
          </div>
        )}
        {!report && !loading && (
          <section className="empty">
            <span>↗</span>
            <h2>A sharper picture of your website.</h2>
            <p>
              Your report will appear here. No invented metrics. No mystery
              score.
            </p>
            <div className="pill-row">
              {Object.values(names).map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          </section>
        )}
        {report && (
          <section aria-label="Audit report">
            <div className="report-heading">
              <div>
                <p className="eyebrow">AUDIT COMPLETE</p>
                <h2>{new URL(report.finalUrl).hostname}</h2>
                <p className="hint">
                  {report.finalUrl} ·{' '}
                  {new Date(report.auditedAt).toLocaleString()}
                </p>
              </div>
              <div className="actions">
                <button className="secondary" onClick={copy}>
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
                <button className="secondary" onClick={download}>
                  Export JSON ↓
                </button>
              </div>
            </div>
            <div className="scores">
              <div className="overall">
                <strong>
                  {report.score}
                  <small>/100</small>
                </strong>
                <span>Overall score</span>
              </div>
              {Object.entries(report.scores).map(([category, score]) => (
                <div key={category}>
                  <span>{names[category as Category]}</span>
                  <strong>{score ?? '—'}</strong>
                  <progress
                    max="100"
                    value={score ?? 0}
                    aria-label={names[category as Category]}
                  />
                </div>
              ))}
            </div>
            <div className="filter">
              <h3>
                Findings{' '}
                <span>
                  {report.findings.filter((f) => f.status === 'fail').length}{' '}
                  issues
                </span>
              </h3>
              <label>
                Severity{' '}
                <select
                  value={filter}
                  onChange={(e) =>
                    setFilter(e.target.value as Severity | 'all')
                  }
                >
                  <option value="all">All</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </label>
            </div>
            {Object.entries(names).map(([category, name]) => {
              const findings = report.findings.filter(
                (f) =>
                  f.category === category &&
                  (filter === 'all' || f.severity === filter),
              );
              return (
                <section className="category" key={category}>
                  <h3>{name}</h3>
                  {findings.length ? (
                    findings.map((f) => (
                      <details
                        className={`finding ${f.status}`}
                        key={f.id}
                        open={f.status === 'fail'}
                      >
                        <summary>
                          <span className="status">
                            {f.status === 'pass'
                              ? '✓'
                              : f.status === 'skip'
                                ? '—'
                                : '!'}
                          </span>
                          <strong>{f.title}</strong>
                          <span className="badge">
                            {f.status === 'fail' ? f.severity : f.status}
                          </span>
                        </summary>
                        <div className="finding-body">
                          <p>{f.explanation}</p>
                          <p>
                            <strong>Next step:</strong> {f.recommendation}
                          </p>
                          {f.evidence.length > 0 && (
                            <ul>
                              {f.evidence.map((ev, i) => (
                                <li key={i}>
                                  <code>{ev}</code>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </details>
                    ))
                  ) : (
                    <p className="hint">No findings match this filter.</p>
                  )}
                </section>
              );
            })}
            <aside className="limitations">
              <h3>What this report covers</h3>
              {report.limitations.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <p>
                Score: weighted pass rate per category (error 5, warning 2, info
                1), then the mean of evaluated categories. Skipped checks are
                excluded.
              </p>
            </aside>
          </section>
        )}
      </main>
      <footer>
        <span>sitecheck · Know what ships.</span>
        <span>Open source. Transparent by design.</span>
      </footer>
    </>
  );
}
