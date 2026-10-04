import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../packages/engine/src/network.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../packages/engine/src/network.js')>();
  return { ...original, requestPublic: vi.fn() };
});
vi.mock('../packages/engine/src/browser.js', () => ({ renderPage: vi.fn() }));
import {
  requestPublic,
  type HttpResult,
} from '../packages/engine/src/network.js';
import { audit } from '../packages/engine/src/index.js';
import { renderPage } from '../packages/engine/src/browser.js';
const result = (body: string, status = 200): HttpResult => ({
  url: 'https://example.com/',
  status,
  body,
  bytes: Buffer.from(body),
  contentType: 'text/html',
  responseTimeMs: 100,
});
afterEach(() => vi.resetAllMocks());
describe('audit orchestration', () => {
  it('recognizes discovery files and reports broken links', async () => {
    vi.mocked(requestPublic)
      .mockResolvedValueOnce(
        result('<a href="/broken">Broken</a><a href="/broken#same">Same</a>'),
      )
      .mockResolvedValueOnce(result('<urlset></urlset>'))
      .mockResolvedValueOnce(result('User-agent: *\nDisallow:'))
      .mockResolvedValueOnce(result('', 404));
    const report = await audit('https://example.com');
    expect(report.metrics.linksDiscovered).toBe(1);
    expect(report.metrics.linksChecked).toBe(1);
    expect(report.findings.find((f) => f.id === 'broken-links')?.status).toBe(
      'fail',
    );
    expect(report.findings.find((f) => f.id === 'sitemap.xml')?.status).toBe(
      'pass',
    );
    expect(report.findings.find((f) => f.id === 'robots.txt')?.status).toBe(
      'pass',
    );
    expect(report.schemaVersion).toBe(1);
  });
  it('marks network failures as unknown instead of broken', async () => {
    vi.mocked(requestPublic)
      .mockResolvedValueOnce(result('<a href="http://localhost">Private</a>'))
      .mockRejectedValue(new Error('Blocked'));
    const report = await audit('https://example.com');
    expect(report.findings.find((f) => f.id === 'broken-links')?.status).toBe(
      'skip',
    );
    expect(report.metrics.linksChecked).toBe(0);
  });
  it('honors link limits', async () => {
    vi.mocked(requestPublic).mockResolvedValue(
      result('<a href="/one">One</a><a href="/two">Two</a>'),
    );
    const report = await audit('https://example.com', { maxLinks: 0 });
    expect(report.metrics.linksChecked).toBe(0);
    expect(requestPublic).toHaveBeenCalledTimes(3);
  });
  it('falls back to GET for HEAD-unsupported servers', async () => {
    vi.mocked(requestPublic)
      .mockResolvedValueOnce(result('<a href="/one">One</a>'))
      .mockResolvedValueOnce(result(''))
      .mockResolvedValueOnce(result(''))
      .mockResolvedValueOnce(result('', 405))
      .mockResolvedValueOnce(result(''));
    const report = await audit('https://example.com');
    expect(report.metrics.linksChecked).toBe(1);
    expect(requestPublic).toHaveBeenLastCalledWith(
      'https://example.com/one',
      5000,
    );
  });
  it('rejects non-HTML pages', async () => {
    vi.mocked(requestPublic).mockResolvedValue({
      ...result('{}'),
      contentType: 'application/json',
    });
    await expect(audit('https://example.com')).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });
  it('uses rendered DOM when requested', async () => {
    vi.mocked(requestPublic).mockResolvedValue(
      result('<title>Original</title>'),
    );
    vi.mocked(renderPage).mockResolvedValue({
      html: '<title>Rendered document title</title>',
      url: 'https://example.com/',
      consoleErrors: ['Runtime failure'],
    });
    const report = await audit('https://example.com', {
      browser: true,
      maxLinks: 0,
    });
    expect(report.mode).toBe('browser');
    expect(report.findings.find((f) => f.id === 'title')?.evidence).toEqual([
      'Rendered document title',
    ]);
    expect(report.findings.find((f) => f.id === 'console-errors')?.status).toBe(
      'fail',
    );
  });
  it.each([{ maxLinks: 101 }, { timeoutMs: 0 }])(
    'rejects unsafe options',
    async (options) =>
      await expect(audit('https://example.com', options)).rejects.toMatchObject(
        { code: 'INVALID_URL' },
      ),
  );
});
