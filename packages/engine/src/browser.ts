import { chromium } from 'playwright';
import { requestPublic } from './network.js';
import { AuditError } from './types.js';
export async function renderPage(
  url: string,
  timeoutMs: number,
): Promise<{ html: string; url: string; consoleErrors: string[] }> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    throw new AuditError(
      'Chromium is unavailable. Run pnpm exec playwright install chromium in packages/engine.',
      'BROWSER',
    );
  }
  try {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    let requests = 0;
    // Browser traffic is fulfilled through the same DNS-pinned transport as HTML audits.
    await context.route('**/*', async (route) => {
      const req = route.request();
      requests++;
      if (
        requests > 100 ||
        req.method() !== 'GET' ||
        ![
          'document',
          'stylesheet',
          'script',
          'image',
          'font',
          'xhr',
          'fetch',
        ].includes(req.resourceType())
      ) {
        await route.abort();
        return;
      }
      try {
        const result = await requestPublic(
          req.url(),
          Math.min(timeoutMs, 5000),
        );
        await route.fulfill({
          status: result.status,
          body: result.bytes,
          contentType: result.contentType,
        });
      } catch {
        await route.abort();
      }
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && errors.length < 50)
        errors.push(msg.text().slice(0, 500));
    });
    page.on('pageerror', (err) => {
      if (errors.length < 50) errors.push(err.message.slice(0, 500));
    });
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    // Allow client rendering to settle, but do not wait indefinitely on polling sites.
    await page
      .waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5000) })
      .catch(() => undefined);
    return {
      html: await page.content(),
      url: page.url(),
      consoleErrors: errors,
    };
  } catch (e) {
    if (e instanceof AuditError) throw e;
    throw new AuditError('Browser inspection failed or timed out.', 'BROWSER');
  } finally {
    await browser.close();
  }
}
