import { chromium } from '../packages/engine/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const svg = await readFile(
  new URL('../docs/brand/sitecheck.svg', import.meta.url),
  'utf8',
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 640 },
  });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({
    path: fileURLToPath(
      new URL('../docs/brand/social-preview.png', import.meta.url),
    ),
  });
} finally {
  await browser.close();
}
