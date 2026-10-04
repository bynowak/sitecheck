import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { inspectPage } from '../packages/engine/src/rules.js';
import { scoreFindings } from '../packages/engine/src/scoring.js';
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
const inspect = (html: string) =>
  inspectPage({
    html,
    url: 'https://example.com/',
    status: 200,
    responseTimeMs: 100,
    consoleErrors: [],
  });
describe('HTML rules', () => {
  it('passes a complete semantic page', () => {
    const findings = inspect(fixture('healthy'));
    expect(findings.filter((f) => f.status !== 'pass')).toEqual([]);
    expect(scoreFindings(findings).score).toBe(100);
  });
  it.each([
    'title-length',
    'description',
    'canonical',
    'language',
    'heading-order',
    'h1',
    'image-alt',
    'empty-links',
    'button-name',
    'form-labels',
    'duplicate-ids',
    'landmarks',
    'insecure-resources',
    'structured-data',
  ])('detects %s', (id) =>
    expect(inspect(fixture('issues')).find((f) => f.id === id)?.status).toBe(
      'fail',
    ),
  );
  it('allows decorative images and names supplied by references', () => {
    const findings = inspect(
      '<html lang="en"><body><span id="label">Search</span><input aria-labelledby="label"><button aria-labelledby="label"></button><a href="/" aria-labelledby="label"></a><img alt=""></body></html>',
    );
    for (const id of ['form-labels', 'button-name', 'empty-links', 'image-alt'])
      expect(findings.find((f) => f.id === id)?.status).toBe('pass');
  });
  it('does not accept a broken aria-labelledby reference', () =>
    expect(
      inspect('<input aria-labelledby="absent">').find(
        (f) => f.id === 'form-labels',
      )?.status,
    ).toBe('fail'));
  it('reports status, timing, DOM size and console errors', () => {
    const findings = inspectPage({
      html: '<div></div>'.repeat(1501),
      url: 'https://example.com',
      status: 404,
      responseTimeMs: 2000,
      consoleErrors: ['boom'],
    });
    for (const id of [
      'http-status',
      'response-time',
      'dom-size',
      'console-errors',
    ])
      expect(findings.find((f) => f.id === id)?.status).toBe('fail');
  });
  it('skips console inspection in HTML mode', () =>
    expect(
      inspectPage({
        html: '',
        url: 'https://example.com',
        status: 200,
        responseTimeMs: 0,
        consoleErrors: null,
      }).find((f) => f.id === 'console-errors')?.status,
    ).toBe('skip'));
  it('includes complete rule documentation and bounded evidence', () => {
    for (const f of inspect(fixture('issues'))) {
      expect(f.id).toBeTruthy();
      expect(f.title).toBeTruthy();
      expect(f.explanation).toBeTruthy();
      expect(f.recommendation).toBeTruthy();
      expect(f.evidence.length).toBeLessThanOrEqual(20);
    }
  });
});
describe('transparent scoring', () => {
  it('weights errors more than info and excludes skipped checks', () => {
    const template = inspect(fixture('healthy'))[0]!;
    const findings = [
      {
        ...template,
        id: 'error',
        category: 'seo' as const,
        severity: 'error' as const,
        status: 'fail' as const,
      },
      {
        ...template,
        id: 'info',
        category: 'seo' as const,
        severity: 'info' as const,
        status: 'pass' as const,
      },
      {
        ...template,
        id: 'skip',
        category: 'seo' as const,
        status: 'skip' as const,
      },
    ];
    expect(scoreFindings(findings)).toEqual({
      score: 17,
      scores: {
        seo: 17,
        accessibility: null,
        technical: null,
        structure: null,
      },
    });
  });
  it('handles no evaluated rules', () =>
    expect(scoreFindings([]).score).toBe(0));
});
