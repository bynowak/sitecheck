import { load } from 'cheerio';
import { z } from 'zod';
import { requestPublic, validateUrl } from './network.js';
import { inspectPage } from './rules.js';
import { scoreFindings } from './scoring.js';
import { renderPage } from './browser.js';
import {
  AuditError,
  type AuditOptions,
  type AuditReport,
  type Finding,
} from './types.js';
export * from './types.js';
export { validateUrl } from './network.js';
export { inspectPage } from './rules.js';
export { scoreFindings, severityWeights } from './scoring.js';
const optionsSchema = z.object({
  browser: z.boolean().default(false),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  maxLinks: z.number().int().min(0).max(100).default(20),
});
export async function audit(
  input: string,
  options: AuditOptions = {},
): Promise<AuditReport> {
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success)
    throw new AuditError('Invalid audit options.', 'INVALID_URL');
  const opts = parsed.data;
  const url = validateUrl(input).href;
  const response = await requestPublic(url, opts.timeoutMs);
  if (!response.contentType.toLowerCase().includes('text/html'))
    throw new AuditError(
      'The destination did not return an HTML document.',
      'NETWORK',
    );
  const rendered = opts.browser
    ? await renderPage(response.url, opts.timeoutMs)
    : null;
  const html = rendered?.html ?? response.body;
  const finalUrl = rendered?.url ?? response.url;
  const $ = load(html);
  const findings = inspectPage({
    html,
    url: finalUrl,
    status: response.status,
    responseTimeMs: response.responseTimeMs,
    consoleErrors: rendered?.consoleErrors ?? null,
  });
  const addNetwork = (
    id: string,
    title: string,
    status: Finding['status'],
    evidence: string[],
  ) =>
    findings.push({
      id,
      title,
      category: id === 'broken-links' ? 'structure' : 'seo',
      severity: 'warning',
      status,
      explanation:
        id === 'broken-links'
          ? 'Checks a bounded sample of public HTTP(S) links.'
          : 'Discovery files help crawlers understand the site.',
      recommendation:
        id === 'broken-links'
          ? 'Repair failed links; manually review blocked or unreachable destinations.'
          : `Serve a valid ${id} at the origin root.`,
      evidence,
    });
  for (const file of ['sitemap.xml', 'robots.txt']) {
    try {
      const r = await requestPublic(
        new URL('/' + file, finalUrl).href,
        opts.timeoutMs,
      );
      const valid =
        r.status === 200 &&
        (file === 'robots.txt'
          ? /^\s*(user-agent|sitemap)\s*:/im.test(r.body)
          : /<(?:\w+:)?(?:urlset|sitemapindex)\b/i.test(r.body));
      addNetwork(file, file, valid ? 'pass' : 'fail', [
        `HTTP ${r.status}; ${valid ? 'recognized content' : 'missing or unrecognized content'}`,
      ]);
    } catch (e) {
      addNetwork(file, file, 'skip', [
        e instanceof Error ? e.message : 'Request failed',
      ]);
    }
  }
  const links = [
    ...new Set(
      $('a[href]')
        .toArray()
        .flatMap((el) => {
          try {
            const u = new URL($(el).attr('href')!, finalUrl);
            u.hash = '';
            return ['http:', 'https:'].includes(u.protocol) ? [u.href] : [];
          } catch {
            return [];
          }
        }),
    ),
  ];
  const failures: string[] = [];
  const unknown: string[] = [];
  let checked = 0;
  for (
    let offset = 0;
    offset < Math.min(links.length, opts.maxLinks);
    offset += 4
  ) {
    await Promise.all(
      links
        .slice(offset, Math.min(offset + 4, opts.maxLinks))
        .map(async (link) => {
          try {
            let r = await requestPublic(
              link,
              Math.min(opts.timeoutMs, 5000),
              2000000,
              'HEAD',
            );
            if ([405, 501].includes(r.status))
              r = await requestPublic(link, Math.min(opts.timeoutMs, 5000));
            checked++;
            if (r.status >= 400) failures.push(`${link} — HTTP ${r.status}`);
          } catch {
            unknown.push(`${link} — blocked, unreachable, or timed out`);
          }
        }),
    );
  }
  addNetwork(
    'broken-links',
    'Link health',
    failures.length
      ? 'fail'
      : unknown.length || (!opts.maxLinks && links.length)
        ? 'skip'
        : 'pass',
    [
      ...failures.sort(),
      ...unknown.sort(),
      `${checked} checked of ${links.length} discovered (limit ${opts.maxLinks})`,
    ],
  );
  return {
    schemaVersion: 1,
    url,
    finalUrl,
    auditedAt: new Date().toISOString(),
    mode: opts.browser ? 'browser' : 'html',
    ...scoreFindings(findings),
    findings,
    metrics: {
      responseTimeMs: response.responseTimeMs,
      domElements: $('*').length,
      linksChecked: checked,
      linksDiscovered: links.length,
    },
    limitations: [
      'Heuristic audit, not a WCAG conformance certification or Lighthouse replacement.',
      'Link checks are sampled; robots directives are reported but do not authorize crawling.',
      ...(rendered
        ? [
            'Browser uses isolated, read-only intercepted requests; POST, service workers, streaming, and authenticated flows are unsupported. Blocked resources may cause console errors.',
          ]
        : [
            'HTML mode does not execute JavaScript. Console checks are skipped.',
          ]),
    ],
  };
}
