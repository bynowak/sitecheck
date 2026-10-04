import { chromium } from '../packages/engine/node_modules/playwright/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { load } from '../packages/engine/node_modules/cheerio/dist/esm/index.js';
import { inspectPage, scoreFindings } from '../packages/engine/dist/index.js';

// Explicit test fixture: UI verification never pretends this is a live audit.
const html = await readFile(
  new URL('../tests/fixtures/issues.html', import.meta.url),
  'utf8',
);
const findings = inspectPage({
  html,
  url: 'https://fixture.example/',
  status: 200,
  responseTimeMs: 100,
  consoleErrors: null,
});
const $ = load(html);
const report = {
  schemaVersion: 1,
  url: 'https://fixture.example/',
  finalUrl: 'https://fixture.example/',
  auditedAt: '2026-10-04T12:00:00Z',
  mode: 'html',
  ...scoreFindings(findings),
  findings,
  metrics: {
    responseTimeMs: 100,
    domElements: $('*').length,
    linksChecked: 0,
    linksDiscovered: $('a[href]').length,
  },
  limitations: ['UI test fixture — not a live audit.'],
};
await mkdir(new URL('../docs/screenshots/', import.meta.url), {
  recursive: true,
});
const browser = await chromium.launch();
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/audit', (route) =>
      route.fulfill({ json: report }),
    );
    await page.goto('http://localhost:3000');
    await page
      .getByLabel('Public website URL')
      .fill('https://fixture.example/');
    await page.getByRole('button', { name: 'Run audit →' }).click();
    await page.getByText('AUDIT COMPLETE', { exact: true }).waitFor();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
    )
      throw new Error(`Horizontal overflow at ${width}`);
    await page.screenshot({
      path: fileURLToPath(
        new URL(`../docs/screenshots/dashboard-${width}.png`, import.meta.url),
      ),
      fullPage: false,
    });
    await page.getByRole('combobox').selectOption('error');
    if (
      await page
        .locator('.finding.fail .badge')
        .allTextContents()
        .then((values) => values.some((v) => v !== 'error'))
    )
      throw new Error('Severity filter failed');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON ↓' }).click();
    if ((await download).suggestedFilename() !== 'sitecheck-report.json')
      throw new Error('Export failed');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(
      `Dashboard verified at ${width}px: report, severity filter, export, no overflow or runtime errors.`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
